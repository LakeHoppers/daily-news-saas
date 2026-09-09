import json
import time

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jwt.algorithms import RSAAlgorithm
from test_reads import FakeReads

from app.main import create_app
from app.modules.auth.application.ports import AuthUnavailable, InvalidSession
from app.modules.auth.infrastructure.clerk import ClerkVerifier
from app.shared.local_state import LocalState

ISSUER = "https://test.clerk.accounts.dev"
ORIGIN = "http://localhost:3001"


@pytest.fixture
def key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def token(key, **overrides):
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "sub": "user_test",
        "sid": "sess_test",
        "azp": ORIGIN,
        "iat": now,
        "nbf": now - 1,
        "exp": now + 60,
        **overrides,
    }
    return "Bearer " + jwt.encode(claims, key, algorithm="RS256", headers={"kid": "key"})


def verifier(key, clock=None):
    jwk = json.loads(RSAAlgorithm.to_jwk(key.public_key())) | {"kid": "key"}
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json={"keys": [jwk]}))
    return ClerkVerifier(
        ISSUER,
        [ORIGIN],
        client=httpx.Client(transport=transport),
        **({"clock": clock} if clock else {}),
    )


def test_valid_session(key):
    auth = verifier(key)
    try:
        assert auth.verify(token(key)) == "user_test"
    finally:
        auth.close()


@pytest.mark.parametrize(
    "claims",
    [
        {"iss": "https://wrong.example"},
        {"azp": "https://evil.example"},
        {"azp": None},
        {"aud": "wrong"},
        {"sts": "pending"},
        {"sub": "machine"},
        {"sid": None},
        {"exp": 1},
        {"nbf": 9999999999},
        {"iat": 9999999999},
        {"exp": None},
    ],
)
def test_rejects_invalid_claims(key, claims):
    auth = verifier(key)
    try:
        with pytest.raises(InvalidSession):
            auth.verify(token(key, **claims))
    finally:
        auth.close()


def test_audience_and_bad_signature(key):
    auth = verifier(key)
    auth.audience = "news-daily"
    assert auth.verify(token(key, aud="news-daily")) == "user_test"
    with pytest.raises(InvalidSession):
        auth.verify(token(key))
    bad = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(InvalidSession):
        auth.verify(token(bad, aud="news-daily"))
    auth.close()


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "Basic abc",
        "Bearer ak_abc",
        "Bearer oat_abc",
        "Bearer m2m_abc",
        "Bearer mt_abc",
        "Bearer x.y.z",
    ],
)
def test_rejects_wrong_token_types_before_network(key, value):
    auth = verifier(key)
    with pytest.raises(InvalidSession):
        auth.verify(value)
    auth.close()


def test_cache_rotation_expiry_and_outage(key):
    now = [10.0]
    current = [key]
    calls = []
    failed = [False]

    def fetch(request):
        calls.append(request.url)
        if failed[0]:
            return httpx.Response(503)
        jwk = json.loads(RSAAlgorithm.to_jwk(current[0].public_key())) | {"kid": "key"}
        return httpx.Response(200, json={"keys": [jwk]})

    auth = ClerkVerifier(
        ISSUER,
        [ORIGIN],
        client=httpx.Client(transport=httpx.MockTransport(fetch)),
        clock=lambda: now[0],
    )
    assert auth.verify(token(key)) == "user_test"
    auth.verify(token(key))
    assert len(calls) == 1
    now[0] += 6
    current[0] = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert auth.verify(token(current[0])) == "user_test"
    assert len(calls) == 2
    failed[0] = True
    auth.verify(token(current[0]))  # valid cache survives short provider outages
    now[0] += 301
    with pytest.raises(AuthUnavailable):
        auth.verify(token(current[0]))
    with pytest.raises(AuthUnavailable):
        auth.verify(token(current[0]))
    assert len(calls) == 3  # outage retries are bounded
    auth.close()


def snapshot():
    return {
        "users": [
            {"id": "u", "clerkId": "user_test", "email": "test@example.com", "isAdmin": False}
        ],
        "preferences": [
            {
                "id": "p",
                "userId": "u",
                "favoriteCategories": [],
                "digestHour": 7,
                "timezone": "Europe/Berlin",
                "paused": False,
                "updatedAt": "now",
            }
        ],
        "subscriptions": [],
    }


def test_http_auth_preferences_free_pro_and_no_authoritative_write(key, tmp_path):
    auth = verifier(key)
    store = LocalState(tmp_path / "sandbox.sqlite", snapshot())
    headers = {"Authorization": token(key)}
    with TestClient(create_app(FakeReads(), verifier=auth, workspace=store)) as client:
        assert client.get("/api/me").status_code == 401
        assert client.get("/api/me", headers=headers).json()["subscription"]["plan"] == "FREE"
        response = client.patch(
            "/api/me/preferences",
            headers=headers,
            json={
                "favoriteCategories": ["ECONOMY", "SPORTS"],
                "digestHour": 20,
                "userId": "someone-else",
            },
        )
        assert response.status_code == 200
        assert response.json()["favoriteCategories"] == ["ECONOMY"]
        assert response.json()["digestHour"] == 9
        store.transact(
            lambda d: d["subscriptions"].append({"userId": "u", "plan": "PRO", "status": "ACTIVE"})
        )
        response = client.patch(
            "/api/me/preferences",
            headers=headers,
            json={"favoriteCategories": ["ECONOMY", "SPORTS"], "digestHour": 20},
        )
        assert response.json()["digestHour"] == 20
        assert len(response.json()["favoriteCategories"]) == 2
        assert client.get("/api/me/digests?lang=en", headers=headers).status_code == 200
    with TestClient(create_app(FakeReads(), verifier=auth, user_repository=store)) as client:
        assert client.patch("/api/me/preferences", headers=headers, json={}).status_code == 503
    auth.close()


def test_unknown_user_and_auth_outage_fail_closed(key, tmp_path):
    auth = verifier(key)
    store = LocalState(tmp_path / "empty.sqlite", {})
    with TestClient(create_app(FakeReads(), verifier=auth, workspace=store)) as client:
        assert client.get("/api/me", headers={"Authorization": token(key)}).status_code == 409
        assert store.read() == {}
    auth.close()

    class Unavailable:
        def verify(self, authorization):
            raise AuthUnavailable("private provider detail")

    with TestClient(create_app(FakeReads(), verifier=Unavailable(), workspace=store)) as client:
        response = client.get("/api/me")
        assert response.status_code == 503
        assert response.json() == {"error": "Authentication unavailable"}


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "https://example.com/path",
        "http://example.com",
        "https://user@example.com",
        "https://example.com?x=1",
    ],
)
def test_invalid_authorized_origins(origin):
    with pytest.raises(ValueError):
        ClerkVerifier(ISSUER, [origin])
