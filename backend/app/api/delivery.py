import hmac

from fastapi import APIRouter, HTTPException, Request

from app.modules.notification.application.delivery import DeliverDigest

router = APIRouter()


@router.get("/api/cron/deliver")
@router.post("/api/cron/deliver")
def deliver(request: Request):
    secret = request.app.state.cron_secret
    provided = request.headers.get("authorization", "")
    if not secret or not hmac.compare_digest(provided.encode(), f"Bearer {secret}".encode()):
        raise HTTPException(401, "Invalid or missing cron secret")
    store, sender = request.app.state.workspace, request.app.state.email_sender
    if store is None or sender is None:
        raise HTTPException(503, "Delivery disabled during migration")
    return DeliverDigest(store, sender).execute()
