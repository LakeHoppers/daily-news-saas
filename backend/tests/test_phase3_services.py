import hashlib
import hmac
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from stripe import SignatureVerificationError
from test_auth import key, snapshot, token, verifier
from test_reads import FakeReads

from app.main import create_app
from app.modules.admin.application.service import AdminService
from app.modules.billing.application.service import BillingService
from app.modules.billing.infrastructure.stripe import TestStripeGateway, verify_webhook
from app.modules.notification.application.delivery import DeliverDigest, is_due
from app.modules.notification.domain.email import build_email
from app.modules.notification.infrastructure.resend import ResendSender
from app.shared.local_state import LocalState
from app.shared.state import ConflictError

# pytest imports this shared RSA fixture for real-signature HTTP tests.
__all__ = ["key"]


def state(tmp_path):
    data = snapshot()
    data["sources"] = [
        {"id": "s", "name": "Source", "url": "https://example.de/rss", "type": "RSS"}
    ]
    data["summaries"] = [
        {
            "id": "summary",
            "storyId": "story",
            "version": 4,
            "headline": "H",
            "body": "Body",
            "whyItMatters": "Why",
            "tags": [],
            "aiProvider": "openai",
            "aiModel": "test",
        }
    ]
    data["digest"] = {
        "digestId": "d",
        "date": "2026-09-09",
        "items": [
            {
                "category": "ECONOMY",
                "headline": "A < B",
                "summary": "Text\nMore",
                "whyItMatters": "It's relevant",
            }
        ],
    }
    return LocalState(tmp_path / "state.sqlite", data)


def test_admin_mutations_are_atomic_versioned_and_conflict_safe(tmp_path):
    store = state(tmp_path)
    admin = AdminService(store)
    with pytest.raises(ConflictError):
        admin.save_source(
            "u", {"name": "Duplicate", "url": "https://example.de/rss", "type": "RSS"}
        )
    assert not store.read().get("auditLogs")

    def edit(_):
        return admin.edit_summary("u", "summary", {"headline": "Edited", "tags": ["valid", 3]})

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(edit, range(4)))
    assert sorted(r["version"] for r in rows) == [5, 6, 7, 8]
    assert all(r["headlineEn"] is None and r["tags"] == ["valid"] for r in rows)
    assert len(store.read()["auditLogs"]) == 4
    before = store.read()

    def broken(data):
        data["sources"].clear()
        raise RuntimeError("rollback")

    with pytest.raises(RuntimeError):
        store.transact(broken)
    assert store.read() == before


def test_http_admin_denies_non_admin_and_accepts_verified_admin(key, tmp_path):
    store = state(tmp_path)
    auth = verifier(key)
    with TestClient(create_app(FakeReads(), verifier=auth, workspace=store)) as client:
        headers = {"Authorization": token(key)}
        assert client.get("/api/admin/sources").status_code == 401
        assert client.get("/api/admin/sources", headers=headers).status_code == 403
        store.transact(lambda d: d["users"][0].update(isAdmin=True))
        assert client.get("/api/admin/sources", headers=headers).status_code == 200
        assert (
            client.patch(
                "/api/admin/summaries/summary", headers=headers, json={"headline": "Changed"}
            ).json()["version"]
            == 5
        )
        assert len(client.get("/api/admin/audit-logs", headers=headers).json()["logs"]) == 1
    auth.close()


class FakeStripe:
    def __init__(self):
        self.customers = 0

    def create_customer(self, email, user_id):
        self.customers += 1
        return "cus_test"

    def checkout(self, customer_id, price_id, success_url, cancel_url):
        return success_url

    def portal(self, customer_id, return_url):
        return return_url


def event(status="active", event_type="customer.subscription.updated"):
    return {
        "id": "evt_test",
        "object": "event",
        "livemode": False,
        "type": event_type,
        "data": {
            "object": {
                "id": "sub_test",
                "customer": "cus_test",
                "status": status,
                "items": {"data": [{"current_period_end": 1800000000}]},
            }
        },
    }


def sign(raw, secret="whsec_test", timestamp=None):
    timestamp = timestamp or int(time.time())
    signature = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + raw, hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={signature}"


def test_billing_customer_reuse_locale_and_subscription_status(tmp_path):
    store = state(tmp_path)
    gateway = FakeStripe()
    service = BillingService(store, gateway, "https://example.com", "price_test")
    assert service.checkout("u", "test@example.com", "en").endswith(
        "/en/dashboard?checkout=success"
    )
    service.checkout("u", "test@example.com", "tr")
    assert gateway.customers == 1
    assert service.portal("u", "https://evil.test").endswith("/tr/dashboard")
    for status, plan, expected in [
        ("active", "PRO", "ACTIVE"),
        ("past_due", "FREE", "PAST_DUE"),
        ("trialing", "PRO", "TRIALING"),
        ("canceled", "FREE", "CANCELED"),
    ]:
        assert service.sync(event(status))["synced"]
        sub = store.read()["subscriptions"][0]
        assert (sub["plan"], sub["status"]) == (plan, expected)
        service.sync(event(status))
        assert len(store.read()["subscriptions"]) == 1


def test_webhook_signature_before_sync_and_replay(key, tmp_path):
    store = state(tmp_path)
    auth = verifier(key)
    service = BillingService(store, FakeStripe(), "https://example.com", "price_test")
    service.checkout("u", "test@example.com")
    raw = json.dumps(event()).encode()
    with TestClient(
        create_app(
            FakeReads(),
            verifier=auth,
            workspace=store,
            billing=service,
            webhook_secret="whsec_test",
        )
    ) as client:
        assert client.post("/api/webhooks/stripe", content=raw).status_code == 400
        assert (
            client.post(
                "/api/webhooks/stripe", content=raw + b" ", headers={"stripe-signature": sign(raw)}
            ).status_code
            == 400
        )
        assert store.read()["subscriptions"][0]["plan"] == "FREE"
        for _ in range(2):
            assert client.post(
                "/api/webhooks/stripe", content=raw, headers={"stripe-signature": sign(raw)}
            ).json()["synced"]
        assert store.read()["subscriptions"][0]["plan"] == "PRO"
        live = json.dumps(event() | {"livemode": True}).encode()
        assert (
            client.post(
                "/api/webhooks/stripe", content=live, headers={"stripe-signature": sign(live)}
            ).status_code
            == 400
        )
    with pytest.raises(SignatureVerificationError):
        verify_webhook(raw, sign(raw, timestamp=1), "whsec_test")
    with pytest.raises(ValueError):
        TestStripeGateway("sk_live_not_allowed")
    auth.close()


class Sender:
    def __init__(self):
        self.calls = []
        self.fail = False

    def send(self, to, message, key):
        self.calls.append(key)
        if self.fail:
            raise RuntimeError("test")


def test_delivery_late_run_retry_and_dedup(tmp_path):
    store = state(tmp_path)
    sender = Sender()
    now = datetime(2026, 9, 9, 14, tzinfo=UTC)
    delivery = DeliverDigest(store, sender)
    sender.fail = True
    assert delivery.execute(now)["failed"] == 1
    sender.fail = False
    assert delivery.execute(now)["delivered"] == 1
    assert delivery.execute(now)["skipped"] == 1
    assert len(sender.calls) == 2 and sender.calls[0] == sender.calls[1]
    assert delivery.execute(datetime(2026, 9, 10, 14, tzinfo=UTC))["skipped"] == 1
    assert not is_due("invalid", 9, now)
    assert is_due("Europe/Berlin", 9, now)
    assert not is_due("Europe/Berlin", 9, datetime(2026, 9, 9, 5, tzinfo=UTC))


def test_email_escaping_and_subscriber_send_block(tmp_path):
    message = build_email(state(tmp_path).read()["digest"])
    assert "A &lt; B" in message["html"] and "It&#39;s" in message["html"]
    assert "<br/><br/>" in message["html"]
    sender = ResendSender("test")
    with pytest.raises(ValueError):
        sender.send("person@example.com", message, "id")
    sender.close()


def test_delivery_concurrent_claim_and_cron_guard(key, tmp_path):
    store = state(tmp_path)
    sender = Sender()
    delivery = DeliverDigest(store, sender)
    now = datetime(2026, 9, 9, 14, tzinfo=UTC)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: delivery.execute(now), range(4)))
    assert sum(r["delivered"] for r in results) == 1
    assert len(sender.calls) == 1
    auth = verifier(key)
    with TestClient(
        create_app(FakeReads(), verifier=auth, workspace=store, cron_secret="secret")
    ) as client:
        assert client.post("/api/cron/deliver").status_code == 401
        assert (
            client.post("/api/cron/deliver", headers={"Authorization": "Bearer wrong"}).status_code
            == 401
        )
        assert (
            client.post("/api/cron/deliver", headers={"Authorization": "Bearer secret"}).status_code
            == 503
        )
    auth.close()


def test_local_pipeline_checkpoints_and_cancellation(monkeypatch, tmp_path):
    import asyncio

    from app.modules.admin.infrastructure import local_pipeline

    store = state(tmp_path)

    async def feeds(_):
        return []

    async def run(data, local, ai, checkpoint):
        local.update(complete=True, stats={"digest": {"itemCount": 10}})
        checkpoint()

    monkeypatch.setattr(local_pipeline, "fetch", feeds)
    monkeypatch.setattr(local_pipeline, "run_local", run)
    result = asyncio.run(local_pipeline.LocalPipeline(store).run("u"))
    assert store.read()["runs"][-1]["status"] == "SUCCESS"
    assert store.read()["pipelineStates"][result["pipelineRunId"]]["complete"]

    async def cancelled(_):
        raise asyncio.CancelledError()

    monkeypatch.setattr(local_pipeline, "fetch", cancelled)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(local_pipeline.LocalPipeline(store).run("u"))
    assert store.read()["runs"][-1]["status"] == "FAILED"
    assert store.read()["runs"][-1]["finishedAt"]
