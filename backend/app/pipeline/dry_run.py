"""Manual 2a runner: SELECT-only snapshot, public RSS GETs, local artifacts only."""

import argparse
import asyncio
import json
import time
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

from app.modules.ranking.domain.scoring import score_articles
from app.modules.scraper.application.fetch import fetch_sources
from app.modules.scraper.infrastructure.rss_fetcher import RssFetcher
from app.pipeline.application.replay import replay
from app.pipeline.infrastructure.snapshot import PostgresSnapshotReader
from app.shared.database import build_engine


async def fetch(sources):
    async with httpx.AsyncClient(
        timeout=20,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; GermanyDailyBot/0.1)"},
    ) as client:
        return await fetch_sources(sources, RssFetcher(client))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--run-id")
    args = parser.parse_args()
    # Explicit local output, never served by Next or FastAPI.
    args.output.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    load_dotenv()
    engine = build_engine()
    try:
        snapshot = PostgresSnapshotReader(engine).read(args.run_id)
    finally:
        engine.dispose()
    fetched = asyncio.run(fetch(snapshot["sources"]))
    for i, source in enumerate(fetched):
        xml = source.pop("xml", None)
        if xml is not None:
            filename = f"feed-{i}.xml"
            (args.output / filename).write_bytes(xml)
            source["xml_file"] = filename
    snapshot["feeds"] = fetched
    result = replay(snapshot)
    stored = sorted(sorted(a["id"] for a in s["articles"]) for s in snapshot["stored_stories"])
    planned = sorted(g["article_ids"] for g in result["plan"]["groups"])
    score_bounds_match = all(
        score_articles(s["articles"], datetime.fromisoformat(snapshot["finished_at"]))
        <= s["stored_score"]
        <= result["scores"][s["id"]]
        for s in snapshot["ranking_stories"]
    )
    report = {
        "run_id": snapshot["run_id"],
        "read_only": snapshot["transaction_read_only"],
        "ai_calls": 0,
        "writes": 0,
        "duration_seconds": round(time.perf_counter() - started, 3),
        "feeds": [
            {"source_id": f["source_id"], "success": f["success"], "count": len(f["articles"])}
            for f in fetched
        ],
        "historical_articles": len(snapshot["articles"]),
        "historical_groups": len(stored),
        "ranked_stories": len(snapshot["ranking_stories"]),
        "stored_scores_within_run_clock_bounds": score_bounds_match,
        "replayed_groups": len(planned),
        "stored_groups_match": stored == planned,
        "stored_attachments_match": sorted(
            result["plan"]["attached"], key=lambda a: a["article_id"]
        )
        == sorted(snapshot["expected_attachments"], key=lambda a: a["article_id"]),
        "historical_attachments": len(snapshot["expected_attachments"]),
        "result": result,
    }
    (args.output / "snapshot.json").write_text(json.dumps(snapshot))
    (args.output / "python.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "result"}, indent=2))


if __name__ == "__main__":
    main()
