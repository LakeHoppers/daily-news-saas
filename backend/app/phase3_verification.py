"""Manual isolated parity + external test transports; no Postgres writes or subscriber sends."""

import argparse
import copy
import hashlib
import hmac
import json
import os
import tempfile
import time
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi.testclient import TestClient

from app.main import create_app
from app.modules.admin.application.service import AdminService
from app.modules.billing.application.service import BillingService
from app.modules.billing.domain.status import derive_plan, map_status
from app.modules.billing.infrastructure.stripe import TestStripeGateway
from app.modules.notification.domain.email import build_email
from app.modules.notification.infrastructure.resend import ResendSender
from app.modules.user.application.update import UpdatePreferences
from app.shared.local_state import LocalState


def comparable(value):
    if isinstance(value, list):
        return [comparable(v) for v in value]
    if isinstance(value, dict):
        return {
            k: comparable(v) for k, v in value.items() if k not in ("id", "updatedAt", "createdAt")
        }
    return value


def normalize_rows(rows):
    result = copy.deepcopy(rows)
    for row in result:
        if "scrapeLogs" in row:
            row["scrapeLogs"].sort(key=lambda s: json.dumps(s, sort_keys=True))
    return result


def verify(path, external=False):
    bundle = json.loads(path.read_text())
    data, reference = bundle["state"], bundle["reference"]
    cases = json.loads(Path(str(path) + ".mutations.json").read_text())
    result = {
        "adminReadGroups": 0,
        "mutationCases": 0,
        "emailExactMatch": False,
        "billingStatuses": 0,
    }
    with tempfile.TemporaryDirectory(prefix="news-daily-phase3-") as directory:
        root = Path(directory)
        store = LocalState(root / "reads.sqlite", data)
        admin = AdminService(store)
        assert admin.sources() == reference["sources"], "Source listing mismatch"
        for kind, limit in [("runs", 20), ("scrapeLogs", 50), ("auditLogs", 50)]:
            assert normalize_rows(admin.logs(kind, limit)) == normalize_rows(reference[kind]), (
                f"{kind} read mismatch"
            )
        result["adminReadGroups"] = 4
        assert build_email(data["digest"]) == reference["email"], "Email template mismatch"
        result["emailExactMatch"] = True
        for row in reference["statuses"]:
            assert (
                derive_plan(row["status"]) == row["plan"]
                and map_status(row["status"]) == row["mapped"]
            )
        result["billingStatuses"] = len(reference["statuses"])
        user_id = data["users"][0]["id"]
        for index, case in enumerate(cases):
            local = LocalState(root / f"mutation-{index}.sqlite", data)
            service = AdminService(local)
            if case["kind"] == "preferences":
                local.transact(
                    lambda d, plan=case["plan"]: d.update(
                        subscriptions=[{"userId": user_id, "plan": plan}]
                    )
                )
                actual = UpdatePreferences(local).execute(user_id, case["body"])
            elif case["kind"] == "sourceCreate":
                actual = service.save_source(user_id, case["body"])
            elif case["kind"] == "sourceUpdate":
                actual = service.save_source(user_id, case["body"], case["id"])
            else:
                actual = service.edit_summary(user_id, case["id"], case["body"])
            assert comparable(actual) == comparable(case["result"]), f"Mutation mismatch {index}"
        result["mutationCases"] = len(cases)
        if external:
            # One simulator email; explicit transport cannot send to any real subscriber.
            sender = ResendSender(
                os.environ["RESEND_API_KEY"],
                os.getenv("EMAIL_FROM_ADDRESS", "News Daily <onboarding@resend.dev>"),
            )
            try:
                email_id = sender.send(
                    "delivered@resend.dev",
                    build_email(data["digest"]),
                    f"phase3-verification-{uuid4()}",
                )
                result["resendSimulatorAccepted"] = bool(email_id)
            finally:
                sender.close()
            gateway = TestStripeGateway(os.environ["STRIPE_SECRET_KEY"])
            billing_store = LocalState(root / "billing.sqlite", data)
            billing = BillingService(
                billing_store,
                gateway,
                "https://daily-news-saas.vercel.app",
                os.environ["STRIPE_PRO_PRICE_ID"],
            )
            synthetic = "phase3-sandbox-" + str(uuid4())
            checkout_url = billing.checkout(synthetic, "migration-verification@example.com", "en")
            portal_url = billing.portal(synthetic, "en")
            result["stripeCheckoutCreated"] = checkout_url.startswith(
                "https://checkout.stripe.com/"
            )
            result["stripePortalCreated"] = portal_url.startswith("https://billing.stripe.com/")
            # Read existing real Stripe test events. Replay only to the local signed endpoint.
            events = gateway.client.v1.events.list(
                {
                    "limit": 100,
                    "types": [
                        "customer.subscription.created",
                        "customer.subscription.updated",
                        "customer.subscription.deleted",
                    ],
                }
            )
            selected = [
                e for e in json.loads(events.last_response.body)["data"] if e["livemode"] is False
            ]
            selected.sort(key=lambda e: e["created"])

            class RejectVerifier:
                def verify(self, authorization):
                    raise AssertionError("Stripe endpoint must use webhook signature, not Clerk")

            with TestClient(
                create_app(
                    verifier=RejectVerifier(),
                    workspace=billing_store,
                    billing=billing,
                    webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
                )
            ) as client:
                synced = 0
                states = set()
                for event in selected:
                    raw = json.dumps(event).encode()
                    stamp = int(time.time())
                    signature = hmac.new(
                        os.environ["STRIPE_WEBHOOK_SECRET"].encode(),
                        f"{stamp}.".encode() + raw,
                        hashlib.sha256,
                    ).hexdigest()
                    response = client.post(
                        "/api/webhooks/stripe",
                        content=raw,
                        headers={"stripe-signature": f"t={stamp},v1={signature}"},
                    )
                    assert response.status_code == 200
                    if response.json().get("synced"):
                        synced += 1
                        states.add(event["data"]["object"]["status"])
                assert synced and "active" in states, "Need real active subscription event evidence"
                result["realStripeEventsReplayed"] = synced
                result["realStripeStatuses"] = sorted(states)
                result["realStripeCancellationMetadataEvents"] = sum(
                    bool(e["data"]["object"].get("canceled_at")) for e in selected
                )
                result["terminalCanceledEventObserved"] = "canceled" in states
            result["stripeCheckoutCompleted"] = (
                False  # session creation + real prior event replay, not a new paid checkout
            )
    result["authoritativeWrites"] = False
    result["schedulingChanges"] = False
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--external", action="store_true")
    args = parser.parse_args()
    load_dotenv()
    try:
        print(json.dumps(verify(args.snapshot, args.external)))
    except Exception as exc:  # noqa: BLE001 - private input and SDK exceptions must not be logged
        print(
            json.dumps(
                {
                    "passed": False,
                    "errorType": type(exc).__name__,
                    "check": str(exc)
                    if isinstance(exc, AssertionError)
                    else "private external verification failure",
                }
            )
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
