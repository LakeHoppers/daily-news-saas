import asyncio
from dataclasses import asdict
from typing import Protocol

from app.modules.scraper.domain.models import Article


class FeedFetcher(Protocol):
    async def fetch(self, url: str) -> tuple[bytes, list[Article]]: ...


async def fetch_sources(sources: list[dict], fetcher: FeedFetcher) -> list[dict]:
    async def one(source):
        try:
            xml, articles = await fetcher.fetch(source["url"])
            return {
                "source_id": source["id"],
                "success": True,
                "xml": xml,
                "articles": [asdict(a) for a in articles],
            }
        except Exception as exc:  # noqa: BLE001 - per-source failure isolation
            # Isolate each source; never include connection strings or response bodies.
            return {
                "source_id": source["id"],
                "success": False,
                "error": type(exc).__name__,
                "articles": [],
            }

    return list(await asyncio.gather(*(one(s) for s in sources)))
