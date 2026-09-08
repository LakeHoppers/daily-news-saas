import math
from datetime import datetime


def importance(source_count, average_trust, published_at, now):
    age = (now - published_at).total_seconds() / 3600 if published_at else 72
    score = average_trust * 0.6 + max(0, source_count - 1) * 8 + max(0, 24 - age)
    # JS Math.round, not Python's bankers rounding.
    return math.floor(score * 100 + 0.5) / 100


def score_articles(articles, now):
    trust = {a["source_id"]: a["trust_score"] for a in articles}
    published = [datetime.fromisoformat(a["published_at"]) for a in articles if a["published_at"]]
    if not trust:
        raise ValueError("A ranked story must have at least one article")
    return importance(
        len(trust), sum(trust.values()) / len(trust), max(published) if published else None, now
    )
