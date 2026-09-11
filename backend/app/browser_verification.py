"""Explicit manual browser test: real Clerk + Stripe CLI, copied test user, SQLite only."""

import argparse
import base64
import html
import json
import os
import re
import subprocess
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi.responses import HTMLResponse

from app.main import create_app
from app.modules.auth.infrastructure.clerk import ClerkVerifier
from app.modules.billing.application.service import BillingService
from app.modules.billing.infrastructure.stripe import TestStripeGateway
from app.shared.local_state import LocalState


def test_snapshot(snapshot, email):
    if not email.endswith("+clerk_test@example.com"):
        raise ValueError("A reserved Clerk test email is required")
    users = [u for u in snapshot["users"] if u["email"] == email]
    if len(users) != 1:
        raise ValueError("Complete test signup and visit the production dashboard first")
    user_id = users[0]["id"]
    return {
        "users": users,
        "preferences": [p for p in snapshot["preferences"] if p["userId"] == user_id],
        # Never reuse a customer/subscription copied from the production database.
        "subscriptions": [],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--test-email", required=True)
    parser.add_argument("--port", type=int, default=8014)
    args = parser.parse_args()
    load_dotenv()
    root = args.directory.resolve()
    if root.is_relative_to(Path(__file__).resolve().parents[2]):
        raise ValueError("Private artifacts must be outside the repository")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    source = test_snapshot(json.loads(args.snapshot.read_text())["state"], args.test_email)
    store = LocalState(root / "browser.sqlite", source)
    if {u["email"] for u in store.read()["users"]} != {args.test_email}:
        raise ValueError("Existing sandbox belongs to a different test user")
    key = os.environ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]
    if not key.startswith("pk_test_"):
        raise ValueError("Clerk development key required")
    encoded = key.split("_", 2)[2]
    issuer = "https://" + base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")
    origin = f"http://localhost:{args.port}"
    verifier = ClerkVerifier(issuer, [origin], os.getenv("CLERK_AUDIENCE"))
    gateway = TestStripeGateway(os.environ["STRIPE_SECRET_KEY"])
    billing = BillingService(store, gateway, origin, os.environ["STRIPE_PRO_PRICE_ID"])
    cli = str(Path.home() / ".local/bin/stripe")
    env = os.environ | {"STRIPE_API_KEY": os.environ["STRIPE_SECRET_KEY"]}
    # Capture the listener secret in memory; never print it or overwrite .env.
    secret_result = subprocess.run(
        [cli, "listen", "--print-secret"],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=True,
    )
    match = re.search(r"whsec_[A-Za-z0-9]+", secret_result.stdout)
    if not match:
        raise RuntimeError("Stripe listener did not provide a signing secret")
    app = create_app(verifier=verifier, workspace=store, billing=billing, webhook_secret=match[0])
    page = (
        Path(__file__)
        .with_suffix(".html")
        .read_text()
        .replace("__ISSUER__", html.escape(issuer, quote=True))
        .replace("__KEY__", html.escape(key, quote=True))
    )

    @app.get("/verify", response_class=HTMLResponse, include_in_schema=False)
    @app.get("/en/dashboard", response_class=HTMLResponse, include_in_schema=False)
    @app.get("/tr/dashboard", response_class=HTMLResponse, include_in_schema=False)
    def browser_page():
        return HTMLResponse(page, headers={"Cache-Control": "no-store"})

    log_fd = os.open(root / "stripe-listener.log", os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o600)
    with os.fdopen(log_fd, "a") as log:
        listener = subprocess.Popen(
            [
                cli,
                "listen",
                "--events",
                "customer.subscription.created,customer.subscription.updated,customer.subscription.deleted",
                "--forward-to",
                f"http://127.0.0.1:{args.port}/api/webhooks/stripe",
            ],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            print(f"Local test browser: {origin}/verify", flush=True)
            uvicorn.run(app, host="127.0.0.1", port=args.port)
        finally:
            listener.terminate()
            listener.wait(timeout=10)
            verifier.close()


if __name__ == "__main__":
    main()
