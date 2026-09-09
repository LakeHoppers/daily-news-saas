"""Explicit SQLite sandbox; never accepts a DATABASE_URL or connects to Postgres."""

import json
import os
import sqlite3
from pathlib import Path

from app.modules.user.domain.models import CurrentUser, Preference, Subscription, UserIdentity


class LocalState:
    def __init__(self, path: Path, snapshot: dict | None = None):
        self.path = path.resolve()
        if self.path.is_relative_to(Path(__file__).resolve().parents[3]):
            raise ValueError("Private sandbox must be outside the repository")
        if not self.path.exists():
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
        with sqlite3.connect(self.path) as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)"
            )
            conn.execute("INSERT OR IGNORE INTO state VALUES(1, ?)", (json.dumps(snapshot or {}),))

    def read(self):
        with sqlite3.connect(self.path) as conn:
            return json.loads(conn.execute("SELECT body FROM state WHERE id=1").fetchone()[0])

    def transact(self, operation):
        with sqlite3.connect(self.path, timeout=10) as conn:
            conn.execute("BEGIN IMMEDIATE")
            data = json.loads(conn.execute("SELECT body FROM state WHERE id=1").fetchone()[0])
            result = operation(data)
            conn.execute("UPDATE state SET body=? WHERE id=1", (json.dumps(data),))
            return result

    def find_by_clerk_id(self, clerk_id):
        data = self.read()
        user = next((u for u in data.get("users", []) if u["clerkId"] == clerk_id), None)
        if user is None:
            return None
        pref = next((p for p in data.get("preferences", []) if p["userId"] == user["id"]), None)
        sub = next((s for s in data.get("subscriptions", []) if s["userId"] == user["id"]), {})
        return UserIdentity(
            clerk_id,
            user["isAdmin"],
            CurrentUser(
                user["id"],
                user["email"],
                Preference(
                    pref["id"],
                    pref["userId"],
                    pref["favoriteCategories"],
                    pref["digestHour"],
                    pref["timezone"],
                    pref["paused"],
                    pref["updatedAt"],
                )
                if pref
                else None,
                Subscription(sub.get("plan", "FREE"), sub.get("status", "ACTIVE")),
            ),
        )
