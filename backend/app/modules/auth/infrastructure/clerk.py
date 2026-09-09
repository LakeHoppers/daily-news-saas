import math
import threading
import time
from urllib.parse import urlsplit

import httpx
import jwt
from clerk_backend_api import AuthenticateRequestOptions, authenticate_request
from cryptography.hazmat.primitives import serialization
from jwt.algorithms import RSAAlgorithm

from app.modules.auth.application.ports import AuthUnavailable, InvalidSession


class ClerkVerifier:
    """Instance-local, bounded JWKS retrieval; cryptography remains in Clerk's SDK."""

    def __init__(
        self,
        issuer: str,
        authorized_parties: list[str],
        audience: str | None = None,
        client: httpx.Client | None = None,
        clock=time.monotonic,
    ):
        url = urlsplit(issuer)
        if (
            url.scheme != "https"
            or not url.netloc
            or url.username
            or url.query
            or url.fragment
            or url.path not in ("", "/")
        ):
            raise ValueError("An exact HTTPS Clerk issuer is required")
        if not authorized_parties:
            raise ValueError("Exact frontend origins are required")
        for party in authorized_parties:
            origin = urlsplit(party)
            if (
                not origin.netloc
                or origin.username
                or origin.path
                or origin.query
                or origin.fragment
                or "*" in party
                or origin.scheme not in ("https", "http")
                or origin.scheme == "http"
                and origin.hostname not in ("localhost", "127.0.0.1")
            ):
                raise ValueError("Exact frontend origins are required")
        self.issuer = issuer.rstrip("/")
        self.parties = authorized_parties
        self.audience = audience
        self.client = client or httpx.Client(timeout=5, follow_redirects=False)
        self.clock = clock
        self.keys = {}
        self.expires = 0.0
        self.last_attempt = float("-inf")
        self.lock = threading.RLock()

    def close(self):
        self.client.close()

    def _key(self, kid, refresh=False):
        with self.lock:
            now = self.clock()
            if not refresh and now < self.expires and kid in self.keys:
                return self.keys[kid]
            # Bound repeated unknown-kid/signature attacks and provider outages.
            if now - self.last_attempt < 5:
                if now >= self.expires:
                    raise AuthUnavailable("Authentication unavailable")
                raise InvalidSession("Invalid session")
            self.last_attempt = now
            try:
                response = self.client.get(f"{self.issuer}/.well-known/jwks.json")
                response.raise_for_status()
                if len(response.content) > 100_000:
                    raise ValueError("JWKS too large")
                records = response.json()["keys"]
                if (
                    not isinstance(records, list)
                    or len(records) > 32
                    or not all(isinstance(k, dict) for k in records)
                ):
                    raise ValueError("Invalid signing key set")
                keys = {}
                for key in records:
                    if (
                        key.get("kty") == "RSA"
                        and key.get("use", "sig") == "sig"
                        and key.get("alg", "RS256") == "RS256"
                    ):
                        keys[key["kid"]] = (
                            RSAAlgorithm.from_jwk(key)
                            .public_bytes(
                                serialization.Encoding.PEM,
                                serialization.PublicFormat.SubjectPublicKeyInfo,
                            )
                            .decode()
                        )
                if not keys:
                    raise ValueError("No signing keys")
                self.keys, self.expires = keys, now + 300
            except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
                raise AuthUnavailable("Authentication unavailable") from exc
            if kid not in self.keys:
                raise InvalidSession("Invalid session")
            return self.keys[kid]

    def verify(self, authorization: str | None) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise InvalidSession("Not signed in")
        token = authorization[7:]
        if len(token) > 16_384 or token.count(".") != 2:
            raise InvalidSession("Invalid session")
        try:
            header = jwt.get_unverified_header(token)
            if (
                header.get("alg") != "RS256"
                or not isinstance(header.get("kid"), str)
                or not header["kid"]
            ):
                raise InvalidSession("Invalid session")
            key = self._key(header["kid"])
            for attempt in range(2):
                state = authenticate_request(
                    httpx.Request("GET", self.issuer, headers={"Authorization": authorization}),
                    AuthenticateRequestOptions(
                        jwt_key=key,
                        authorized_parties=self.parties,
                        audience=self.audience,
                        accepts_token=["session_token"],
                        clock_skew_in_ms=0,
                    ),
                )
                if state.is_authenticated:
                    break
                if attempt == 0 and getattr(state.reason, "name", "") == "TOKEN_INVALID_SIGNATURE":
                    key = self._key(header["kid"], refresh=True)
                else:
                    raise InvalidSession("Invalid session")
            claims = state.payload or {}
            if claims.get("iss") != self.issuer or claims.get("sts", "active") != "active":
                raise InvalidSession("Invalid session")
            if not all(
                type(claims.get(k)) in (int, float) and math.isfinite(claims[k])
                for k in ("exp", "nbf", "iat")
            ):
                raise InvalidSession("Invalid session")
            subject, sid = claims.get("sub"), claims.get("sid")
            if (
                not isinstance(subject, str)
                or not subject.startswith("user_")
                or not isinstance(sid, str)
                or not sid.startswith("sess_")
            ):
                raise InvalidSession("Invalid session")
            return subject
        except (jwt.PyJWTError, ValueError, TypeError, KeyError) as exc:
            raise InvalidSession("Invalid session") from exc
