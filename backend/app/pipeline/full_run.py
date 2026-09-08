"""Manual 2c verification: real RSS/OpenAI, SELECT-only source config, local state."""

import argparse
import asyncio
import hashlib
import json
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from sqlalchemy import text

from app.modules.ai.infrastructure.openai import OpenAIProvider
from app.pipeline.application.local_run import run_local
from app.pipeline.dry_run import fetch
from app.shared.database import build_engine


def sources():
    engine = build_engine()
    try:
        with engine.connect() as c, c.begin():
            c.execute(text("SET TRANSACTION READ ONLY"))
            return [
                dict(r)
                for r in c.execute(
                    text(
                        'SELECT id,name,url,category,"trustScore" FROM "Source" WHERE active AND type=\'RSS\' ORDER BY id'
                    )
                ).mappings()
            ]
    finally:
        engine.dispose()


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    load_dotenv()
    args.output.mkdir(parents=True, exist_ok=True)
    statefile = args.output / "state.json"
    if statefile.exists() and not args.resume:
        raise ValueError("Existing local state: use a fresh output directory or --resume")
    state = json.loads(statefile.read_text()) if args.resume else {}
    state.pop("fatal_error", None)
    started = time.perf_counter()

    def checkpoint():
        temporary = statefile.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, ensure_ascii=False))
        temporary.replace(statefile)

    async with httpx.AsyncClient() as client:
        ai = OpenAIProvider(client)
        try:
            async with asyncio.timeout(300):
                if args.resume:
                    data = json.loads((args.output / "input.json").read_text())
                elif args.input:
                    data = json.loads(args.input.read_text())
                else:
                    configured = sources()
                    feeds = await fetch(configured)
                    for f in feeds:
                        f.pop("xml", None)
                    data = {
                        "as_of": datetime.now(UTC).isoformat(timespec="milliseconds"),
                        "sources": configured,
                        "feeds": feeds,
                    }
                (args.output / "input.json").write_text(json.dumps(data, ensure_ascii=False))
                await run_local(data, state, ai, checkpoint)
        except TimeoutError:
            state["fatal_error"] = "300s deadline exceeded"
            state["complete"] = False
        finally:
            checkpoint()
            result = {
                "seconds": time.perf_counter() - started,
                "complete": state.get("complete", False),
                "stats": state.get("stats", {}),
                "metrics": ai.metrics(),
                "input_sha256": hashlib.sha256(
                    (args.output / "input.json").read_bytes()
                ).hexdigest()
                if (args.output / "input.json").exists()
                else None,
            }
            (args.output / "report.json").write_text(json.dumps(result, indent=2))
        print(json.dumps({k: v for k, v in result.items() if k != "metrics"}))
        print(json.dumps({"estimated_usd": result["metrics"]["estimated_usd"]}))
        if not result["complete"]:
            raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
