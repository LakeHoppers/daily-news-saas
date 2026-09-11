import pytest

from app.browser_verification import test_snapshot as isolated_snapshot


def test_browser_snapshot_restricts_identity_and_drops_shared_billing_ids():
    email = "browser+clerk_test@example.com"
    snapshot = {
        "users": [{"id": "test", "email": email}, {"id": "real", "email": "real@example.com"}],
        "preferences": [{"userId": "test"}, {"userId": "real"}],
        "subscriptions": [{"userId": "test", "stripeCustomerId": "existing"}],
    }
    local = isolated_snapshot(snapshot, email)
    assert local["users"] == [{"id": "test", "email": email}]
    assert local["preferences"] == [{"userId": "test"}]
    assert local["subscriptions"] == []
    assert snapshot["subscriptions"][0]["stripeCustomerId"] == "existing"


def test_browser_snapshot_requires_reserved_test_user():
    with pytest.raises(ValueError):
        isolated_snapshot({"users": []}, "real@example.com")
    with pytest.raises(ValueError):
        isolated_snapshot({"users": []}, "missing+clerk_test@example.com")
