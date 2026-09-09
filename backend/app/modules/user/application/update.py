from datetime import UTC, datetime

from app.modules.user.domain.preferences import preference_patch
from app.shared.state import MissingError, StateStore


class UpdatePreferences:
    def __init__(self, store: StateStore):
        self.store = store

    def execute(self, user_id: str, body: dict):
        def update(data):
            pref = next((p for p in data.get("preferences", []) if p["userId"] == user_id), None)
            if pref is None:
                raise MissingError("Preferences not found")
            sub = next((s for s in data.get("subscriptions", []) if s["userId"] == user_id), {})
            pref.update(preference_patch(body, sub.get("plan", "FREE")))
            pref["updatedAt"] = (
                datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            )
            return pref

        return self.store.transact(update)
