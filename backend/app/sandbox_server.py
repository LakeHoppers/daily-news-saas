"""Explicit, loopback-only Phase 3 API. Production app/main stays public-read-only."""

import argparse
import base64
import json
import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

from app.main import create_app
from app.modules.auth.infrastructure.clerk import ClerkVerifier
from app.modules.billing.application.service import BillingService
from app.modules.billing.infrastructure.stripe import TestStripeGateway
from app.modules.notification.infrastructure.resend import ResendSender
from app.shared.local_state import LocalState


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8014)
    parser.add_argument("--frontend-origin", default="http://localhost:3012")
    args = parser.parse_args()
    load_dotenv()
    key = os.environ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"].split("_", 2)[2]
    issuer = "https://" + base64.b64decode(key + "=" * (-len(key) % 4)).decode().rstrip("$")
    verifier = ClerkVerifier(issuer, [args.frontend_origin], os.getenv("CLERK_AUDIENCE"))
    store = LocalState(args.state, json.loads(args.snapshot.read_text())["state"])
    gateway = TestStripeGateway(os.environ["STRIPE_SECRET_KEY"])
    billing = BillingService(
        store, gateway, args.frontend_origin, os.environ["STRIPE_PRO_PRICE_ID"]
    )
    sender = ResendSender(
        os.environ["RESEND_API_KEY"],
        os.getenv("EMAIL_FROM_ADDRESS", "News Daily <onboarding@resend.dev>"),
    )
    app = create_app(
        verifier=verifier,
        workspace=store,
        billing=billing,
        webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
        email_sender=sender,
        cron_secret=os.getenv("CRON_SECRET", ""),
    )
    try:
        uvicorn.run(app, host="127.0.0.1", port=args.port)
    finally:
        verifier.close()
        sender.close()


if __name__ == "__main__":
    main()
