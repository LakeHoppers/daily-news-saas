from datetime import UTC, datetime
from uuid import uuid4

from app.modules.user.domain.preferences import CATEGORIES
from app.shared.state import ConflictError, MissingError, StateStore


def timestamp():
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def audit(data, admin_id, action, target_id, metadata):
    data.setdefault("auditLogs", []).append(
        {
            "id": str(uuid4()),
            "adminId": admin_id,
            "action": action,
            "targetId": target_id,
            "metadata": metadata,
            "createdAt": timestamp(),
        }
    )


class AdminService:
    def __init__(self, store: StateStore):
        self.store = store

    def sources(self):
        return sorted(self.store.read().get("sources", []), key=lambda s: s["name"])

    def save_source(self, admin_id: str, body: dict, source_id: str | None = None):
        fields = {}
        for field in ("name", "url"):
            if isinstance(body.get(field), str) and body[field].strip():
                fields[field] = body[field]
            elif source_id is None:
                raise ValueError(f"{field} is required")
        if body.get("type") in ("RSS", "API", "SCRAPER"):
            fields["type"] = body["type"]
        elif source_id is None:
            raise ValueError("type must be one of: RSS, API, SCRAPER")
        category = body.get("category")
        if (
            isinstance(category, str)
            and category in CATEGORIES
            or "category" in body
            and category is None
        ):
            fields["category"] = category
        if type(body.get("active")) is bool:
            fields["active"] = body["active"]
        if type(body.get("trustScore")) in (int, float):
            if not float(body["trustScore"]).is_integer():
                raise ValueError("trustScore must be an integer")
            fields["trustScore"] = int(body["trustScore"])
        if "scrapeConfig" in body:
            fields["scrapeConfig"] = body["scrapeConfig"]

        def update(data):
            rows = data.setdefault("sources", [])
            existing = next((s for s in rows if s["id"] == source_id), None)
            if source_id is not None and existing is None:
                raise MissingError("Source not found")
            if "url" in fields and any(
                s["url"] == fields["url"] and s["id"] != source_id for s in rows
            ):
                raise ConflictError("A source with that URL already exists")
            if existing is None:
                existing = {
                    "id": str(uuid4()),
                    "category": None,
                    "trustScore": 50,
                    "active": True,
                    "scrapeConfig": None,
                    "createdAt": timestamp(),
                }
                rows.append(existing)
            existing.update(fields)
            existing["updatedAt"] = timestamp()
            audit(
                data,
                admin_id,
                "update_source" if source_id else "create_source",
                existing["id"],
                fields if source_id else {"name": existing["name"], "url": existing["url"]},
            )
            return existing

        return self.store.transact(update)

    def edit_summary(self, admin_id, summary_id, body):
        def edit(data):
            rows = data.setdefault("summaries", [])
            old = next((s for s in rows if s["id"] == summary_id), None)
            if old is None:
                raise MissingError("Summary not found")
            version = max(s["version"] for s in rows if s["storyId"] == old["storyId"]) + 1
            new = {
                k: old[k]
                for k in (
                    "storyId",
                    "headline",
                    "body",
                    "whyItMatters",
                    "tags",
                    "aiProvider",
                    "aiModel",
                )
            }
            for field in ("headline", "body", "whyItMatters"):
                if isinstance(body.get(field), str):
                    new[field] = body[field]
            if isinstance(body.get("tags"), list):
                new["tags"] = [t for t in body["tags"] if isinstance(t, str)]
            new.update(
                id=str(uuid4()),
                version=version,
                editedByAdmin=True,
                editedById=admin_id,
                headlineEn=None,
                bodyEn=None,
                whyItMattersEn=None,
                createdAt=timestamp(),
            )
            rows.append(new)
            audit(
                data,
                admin_id,
                "edit_summary",
                new["id"],
                {
                    "storyId": old["storyId"],
                    "previousVersion": old["version"],
                    "newVersion": version,
                },
            )
            return new

        return self.store.transact(edit)

    def logs(self, kind, limit=50, **filters):
        data = self.store.read()
        rows = data.get(kind, [])
        if kind == "runs" and filters.get("status") in (
            "RUNNING",
            "SUCCESS",
            "FAILED",
            "PARTIAL_FAILURE",
        ):
            rows = [r for r in rows if r["status"] == filters["status"]]
        if kind == "scrapeLogs":
            rows = [
                r
                for r in rows
                if (filters.get("source_id") is None or r["sourceId"] == filters["source_id"])
                and (filters.get("success") is None or r["success"] == filters["success"])
            ]
        rows = sorted(
            rows, key=lambda r: r["startedAt" if kind == "runs" else "createdAt"], reverse=True
        )[:limit]
        sources = {s["id"]: {"name": s["name"]} for s in data.get("sources", [])}
        users = {u["id"]: {"email": u["email"]} for u in data.get("users", [])}
        if kind == "runs":
            return [
                r
                | {
                    "scrapeLogs": [
                        {k: log[k] for k in ("success", "articleCount", "error")}
                        | {"source": sources[log["sourceId"]]}
                        for log in data.get("scrapeLogs", [])
                        if log["pipelineRunId"] == r["id"]
                    ]
                }
                for r in rows
            ]
        if kind == "scrapeLogs":
            return [r | {"source": sources[r["sourceId"]]} for r in rows]
        return [r | {"admin": users[r["adminId"]]} for r in rows]
