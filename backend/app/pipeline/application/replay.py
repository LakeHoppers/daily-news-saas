from datetime import datetime
from typing import Protocol

from app.modules.dedup.application.plan import plan_clusters
from app.modules.ranking.domain.scoring import score_articles


class SnapshotReader(Protocol):
    def read(self, run_id: str | None = None) -> dict: ...


def replay(snapshot):
    now = datetime.fromisoformat(snapshot["as_of"])
    return {
        "plan": plan_clusters(snapshot["articles"], snapshot["centroids"]),
        "scores": {
            s["id"]: score_articles(s["articles"], now) for s in snapshot["ranking_stories"]
        },
    }
