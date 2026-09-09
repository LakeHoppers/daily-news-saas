import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import httpx

from app.modules.admin.application.service import audit, timestamp
from app.modules.ai.infrastructure.openai import OpenAIProvider
from app.pipeline.application.local_run import run_local
from app.pipeline.dry_run import fetch
from app.shared.state import ConflictError, StateStore


class LocalPipeline:
    """Manually triggered pipeline; checkpoints only to the explicitly injected sandbox."""

    def __init__(self, store: StateStore):
        self.store = store

    async def run(self, admin_id):
        run_id = str(uuid4())

        def start(data):
            runs = data.setdefault("runs", [])
            if any(r["status"] == "RUNNING" and r.get("sandbox") for r in runs):
                raise ConflictError("A sandbox pipeline is already running")
            runs.append(
                {
                    "id": run_id,
                    "startedAt": timestamp(),
                    "finishedAt": None,
                    "status": "RUNNING",
                    "stats": None,
                    "sandbox": True,
                }
            )
            audit(data, admin_id, "run_pipeline", run_id, {"sandbox": True})

        self.store.transact(start)
        state = {}
        status = "FAILED"

        def checkpoint():
            self.store.transact(
                lambda data: data.setdefault("pipelineStates", {}).update({run_id: state})
            )

        try:
            async with asyncio.timeout(300):
                configured = [
                    s
                    for s in self.store.read().get("sources", [])
                    if s.get("active", True) and s["type"] == "RSS"
                ]
                feeds = await fetch(configured)
                for feed in feeds:
                    feed.pop("xml", None)
                data = {
                    "as_of": datetime.now(UTC).isoformat(),
                    "sources": configured,
                    "feeds": feeds,
                }
                async with httpx.AsyncClient() as client:
                    await run_local(data, state, OpenAIProvider(client), checkpoint)
            status = "SUCCESS" if state.get("complete") else "PARTIAL_FAILURE"
        except Exception:
            status = "FAILED"
            raise
        finally:

            def finish(data):
                run = next(r for r in data["runs"] if r["id"] == run_id)
                run.update(status=status, finishedAt=timestamp(), stats=state.get("stats", {}))

            self.store.transact(finish)
        return {"pipelineRunId": run_id, **state.get("stats", {})}
