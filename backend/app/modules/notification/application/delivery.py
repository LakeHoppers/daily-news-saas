from datetime import UTC, datetime
from typing import Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.modules.notification.domain.email import build_email
from app.shared.state import StateStore


class Sender(Protocol):
    def send(self, recipient: str, message: dict, idempotency_key: str) -> None: ...


def is_due(timezone, hour, now):
    try:
        return now.astimezone(ZoneInfo(timezone)).hour >= hour
    except (ZoneInfoNotFoundError, ValueError):
        return False


class DeliverDigest:
    def __init__(self, store: StateStore, sender: Sender):
        self.store, self.sender = store, sender

    def execute(self, now=None):
        now = now or datetime.now(UTC)
        data = self.store.read()
        users = {u["id"]: u for u in data.get("users", [])}
        result = {"delivered": 0, "failed": 0, "skipped": 0}
        for pref in data.get("preferences", []):
            if pref["paused"] or not is_due(pref["timezone"], pref["digestHour"], now):
                continue
            digest = data.get("digest")
            if digest:
                digest = digest | {
                    "items": [
                        i
                        for i in digest["items"]
                        if not pref["favoriteCategories"]
                        or i["category"] in pref["favoriteCategories"]
                    ]
                }
            if (
                not digest
                or not digest["items"]
                or digest["date"] != now.astimezone(UTC).date().isoformat()
            ):
                result["skipped"] += 1
                continue
            key = f"digest:{digest['digestId']}:{pref['userId']}:EMAIL"

            def claim(state, key=key):
                ledger = state.setdefault("deliveryLedger", {})
                old = ledger.get(key, {})
                if (
                    old.get("status") == "sent"
                    or old.get("status") == "sending"
                    and now.timestamp() - old.get("claimedAt", 0) < 300
                ):
                    return False
                ledger[key] = {"status": "sending", "claimedAt": now.timestamp()}
                return True

            if not self.store.transact(claim):
                result["skipped"] += 1
                continue
            try:
                self.sender.send(users[pref["userId"]]["email"], build_email(digest), key)
            except Exception:  # noqa: BLE001 - isolate provider failures per recipient, without logging PII
                self.store.transact(
                    lambda state, key=key: state["deliveryLedger"].update(
                        {key: {"status": "failed"}}
                    )
                )
                result["failed"] += 1
            else:
                self.store.transact(
                    lambda state, key=key: state["deliveryLedger"].update(
                        {key: {"status": "sent", "sentAt": now.isoformat()}}
                    )
                )
                result["delivered"] += 1
        return result
