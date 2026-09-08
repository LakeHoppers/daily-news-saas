"""Read three real published stories and write AI samples only to a local artifact."""

import argparse
import asyncio
import json
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from sqlalchemy import text

from app.modules.ai.application.stages import embed_articles, summarize_stories, translate_stories
from app.modules.ai.infrastructure.openai import OpenAIProvider
from app.shared.database import build_engine


def sample_input():
    engine = build_engine()
    try:
        with engine.connect() as conn, conn.begin():
            conn.execute(text("SET TRANSACTION READ ONLY"))
            rows = conn.execute(
                text("""
                SELECT s.id, s.category FROM "DigestItem" d JOIN "Story" s ON s.id=d."storyId"
                WHERE d."digestId"=(SELECT id FROM "Digest" ORDER BY date DESC LIMIT 1)
                AND d.rank IN (1,2,4) ORDER BY d.rank
            """)
            ).mappings()
            stories = []
            for row in rows:
                articles = [
                    dict(a)
                    for a in conn.execute(
                        text("""
                    SELECT id,title,"rawContent" AS raw_content,url FROM "RawArticle"
                    WHERE "storyId"=:id ORDER BY id
                """),
                        {"id": row["id"]},
                    ).mappings()
                ]
                stories.append({**dict(row), "articles": articles})
            return stories
    finally:
        engine.dispose()


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    load_dotenv()
    stories = sample_input()
    if len(stories) != 3:
        raise ValueError("Expected three real sample stories")
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "input.json").write_text(json.dumps(stories))
    started = time.perf_counter()
    async with httpx.AsyncClient() as client:
        ai = OpenAIProvider(client)
        embedded = await embed_articles([s["articles"][0] for s in stories], ai)
        summarized = await summarize_stories(stories, ai)
        translated = await translate_stories(
            {s["id"]: s for s in stories}, [s["id"] for s in stories], set(), ai
        )
        report = {
            "seconds": time.perf_counter() - started,
            "embed": embedded,
            "summarize": summarized,
            "translate": translated,
            "metrics": ai.metrics(),
            "stories": stories,
        }
    (args.output / "python.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k not in ("stories", "metrics")}))
    print(json.dumps({"estimated_usd": report["metrics"]["estimated_usd"]}))
    if any(x["failed"] for x in (embedded, summarized, translated)):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
