from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from stripe import SignatureVerificationError

from app.api.protected import CurrentUser
from app.modules.billing.infrastructure.stripe import verify_webhook

router = APIRouter()


def service(request):
    value = request.app.state.billing
    if value is None:
        raise HTTPException(503, "Billing writes are disabled during migration")
    return value


@router.post("/api/billing/checkout")
def checkout(request: Request, body: dict, user: CurrentUser):
    return {
        "url": service(request).checkout(
            user.user.id, user.user.email, body.get("locale", "tr"), body.get("priceId")
        )
    }


@router.post("/api/billing/portal")
def portal(request: Request, body: dict, user: CurrentUser):
    return {"url": service(request).portal(user.user.id, body.get("locale", "tr"))}


@router.post("/api/webhooks/stripe")
async def webhook(request: Request):
    billing = service(request)
    raw = await request.body()
    if len(raw) > 1_000_000:
        raise HTTPException(413, "Webhook payload too large")
    try:
        event = verify_webhook(
            raw, request.headers.get("stripe-signature", ""), request.app.state.webhook_secret
        )
    except (ValueError, SignatureVerificationError) as exc:
        raise HTTPException(400, "Invalid webhook signature") from exc
    if event.get("livemode") is not False:
        raise HTTPException(400, "Only test-mode events are accepted during migration")
    return await run_in_threadpool(billing.sync, event)
