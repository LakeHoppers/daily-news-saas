"""Manual read-only parity against a private TS oracle; never logs user payloads."""

import argparse
import json
from dataclasses import asdict
from pathlib import Path

import httpx
from dotenv import load_dotenv
from pydantic.alias_generators import to_camel
from sqlalchemy import text

from app.modules.digest.application.latest import GetDigestHistory
from app.modules.digest.infrastructure.repository import SqlAlchemyDigestRepository
from app.modules.user.application.reads import ReadExistingUser, ReadUserHistory
from app.modules.user.infrastructure.repository import SqlAlchemyUserRepository
from app.shared.database import build_engine


def wire(value):
    if isinstance(value, dict):
        return {to_camel(k): wire(v) for k, v in value.items()}
    if isinstance(value, list):
        return [wire(v) for v in value]
    return value


def normalize(value):
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, dict):
        result = {k: normalize(v) for k, v in value.items()}
        if "items" in result:
            result["items"] = sorted(
                result["items"], key=lambda item: (item["rank"], item["storyId"])
            )
        for key in ("sources", "sourceUrls"):
            if key in result:
                result[key] = sorted(result[key], key=lambda item: json.dumps(item, sort_keys=True))
        return result
    return value


def verify(reference, base_url):
    engine = build_engine()
    try:
        with engine.connect() as conn:
            assert conn.scalar(text("SHOW transaction_read_only")) == "on"
        assert reference["readonly"] == [{"transaction_read_only": "on"}]
        with httpx.Client(base_url=base_url, timeout=30) as client:
            for index, case in enumerate(reference["cases"]):
                response = client.get(case["path"])
                assert response.status_code == case["status"], f"Public status mismatch {index}"
                assert normalize(response.json()) == normalize(case["body"]), (
                    f"Public payload mismatch {index}"
                )
        digests = SqlAlchemyDigestRepository(engine)
        for index, case in enumerate(reference["histories"]):
            result = GetDigestHistory(digests).execute(
                case["categories"], case["limit"], case["locale"]
            )
            assert normalize(wire([asdict(d) for d in result])) == normalize(case["result"]), (
                f"History mismatch {index}"
            )
        users = SqlAlchemyUserRepository(engine)
        for index, case in enumerate(reference["users"]):
            identity = ReadExistingUser(users).execute(case["clerkId"])
            assert identity is not None
            assert identity.is_admin == case["isAdmin"]
            assert wire(asdict(identity.user)) == case["current"], (
                f"User projection mismatch {index}"
            )
            result = ReadUserHistory(users, digests).execute(case["clerkId"], locale="en")
            assert normalize(wire([asdict(d) for d in result])) == normalize(case["history"]), (
                f"User history mismatch {index}"
            )
        return {
            "publicCases": len(reference["cases"]),
            "histories": len(reference["histories"]),
            "users": len(reference["users"]),
            "allMatched": True,
            "readOnly": True,
        }
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:8013")
    args = parser.parse_args()
    load_dotenv()
    try:
        print(json.dumps(verify(json.loads(args.reference.read_text()), args.base_url)))
    except Exception as exc:  # noqa: BLE001 - sanitize every CLI failure; reference contains PII
        # The exception class helps diagnosis without leaking SQL, PII or credentials.
        print(json.dumps({"allMatched": False, "errorType": type(exc).__name__}))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
