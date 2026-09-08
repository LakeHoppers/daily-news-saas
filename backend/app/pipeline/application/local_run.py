"""Full pipeline over caller-owned local state. No database or scheduling imports."""

import hashlib
import json
from datetime import datetime, timedelta

from app.modules.ai.application.ports import AIProvider
from app.modules.ai.application.stages import embed_articles, summarize_stories, translate_stories
from app.modules.dedup.application.plan import plan_clusters
from app.modules.dedup.domain.clustering import average
from app.modules.digest.domain.selection import select_digest
from app.modules.ranking.domain.scoring import score_articles


def article_id(source, external):
    return hashlib.sha256(
        json.dumps([source, external], separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()[:24]


async def run_local(data: dict, state: dict, ai: AIProvider, checkpoint=lambda: None):
    now = datetime.fromisoformat(data["as_of"])
    articles = state.setdefault("articles", {})
    stories = state.setdefault("stories", {})
    digests = state.setdefault("digests", {})
    stats = state.setdefault("stats", {})
    if state.get("complete"):
        return state
    if not state.get("ingested"):
        source_by_id = {s["id"]: s for s in data["sources"]}
        for feed in data["feeds"]:
            if not feed["success"]:
                continue
            source = source_by_id[feed["source_id"]]
            for item in feed["articles"]:
                key = article_id(source["id"], item["external_id"])
                articles.setdefault(
                    key,
                    {
                        **item,
                        "id": key,
                        "source_id": source["id"],
                        "source_category": source["category"],
                        "trust_score": source["trustScore"],
                        "embedding": [],
                        "story_id": None,
                    },
                )
        stats["fetch"] = {
            "succeeded": sum(f["success"] for f in data["feeds"]),
            "failed": sum(not f["success"] for f in data["feeds"]),
            "articlesFetched": sum(len(f["articles"]) for f in data["feeds"] if f["success"]),
        }
        state["ingested"] = True
        checkpoint()
    if not state.get("clustered"):
        if "embedding_ids" not in state:
            state["embedding_ids"] = [
                a["id"]
                for a in sorted(
                    [a for a in articles.values() if not a["story_id"]],
                    key=lambda a: (a["published_at"] or "", a["id"]),
                    reverse=True,
                )[:150]
            ]
        pending = [articles[i] for i in state["embedding_ids"] if not articles[i]["story_id"]]
        stats["embed"] = await embed_articles(pending, ai)
        centroids = []
        for s in stories.values():
            if datetime.fromisoformat(s["created_at"]) < now - timedelta(hours=48):
                continue
            vectors = [a["embedding"] for a in s["articles"] if a["embedding"]]
            if vectors:
                centroids.append({"story_id": s["id"], "centroid": average(vectors)})
        plan = plan_clusters(pending, centroids)
        for attached in plan["attached"]:
            a = articles[attached["article_id"]]
            sid = attached["story_id"]
            a["story_id"] = sid
            stories[sid]["articles"].append(a)
        for group in plan["groups"]:
            sid = "local-" + min(group["article_ids"])
            # Preserve input order when presenting snippets to the AI.
            members = [a for a in pending if a["id"] in group["article_ids"]]
            stories[sid] = {
                "id": sid,
                "category": group["category"],
                "created_at": data["as_of"],
                "articles": members,
                "summaries": [],
            }
            for a in members:
                a["story_id"] = sid
        state["plan"] = plan
        state["clustered"] = not stats["embed"]["failed"]
        checkpoint()
    # Rank at a frozen clock for meaningful same-input TS comparison.
    for story in stories.values():
        story["score"] = score_articles(story["articles"], now)
    ranked = sorted(stories.values(), key=lambda s: (-s["score"], s["id"]))
    completed = [s["id"] for s in ranked if s.get("summaries")]
    pending_summaries = [s["id"] for s in ranked if not s.get("summaries")]
    state["summary_ids"] = completed + pending_summaries[: max(0, 15 - len(completed))]
    stats["summarize"] = await summarize_stories([stories[i] for i in state["summary_ids"]], ai)
    checkpoint()
    # Rebuild the same logical edition after a partial-run resume.
    used = {sid for date, ids in digests.items() if date != data["as_of"][:10] for sid in ids}
    candidates = [
        s
        for s in stories.values()
        if s.get("summaries")
        and s["id"] not in used
        and any(
            a["published_at"]
            and datetime.fromisoformat(a["published_at"]) >= now - timedelta(hours=48)
            for a in s["articles"]
        )
    ]
    state["digest_ids"] = select_digest(candidates)
    # Assignment replaces stale items, including an empty selection.
    digests[data["as_of"][:10]] = state["digest_ids"]
    checkpoint()
    published = {sid for ids in digests.values() for sid in ids}
    stats["translate"] = await translate_stories(stories, state["digest_ids"], published, ai)
    stats["digest"] = {"itemCount": len(state["digest_ids"]), "storyIds": state["digest_ids"]}
    state["complete"] = (
        not any(s.get("failed", 0) for s in stats.values()) and len(state["digest_ids"]) == 10
    )
    checkpoint()
    return state
