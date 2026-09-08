from dataclasses import dataclass


@dataclass(frozen=True)
class DigestItem:
    rank: int
    story_id: str
    category: str
    headline: str
    summary: str
    why_it_matters: str
    tags: list[str]
    source_urls: list[str]


@dataclass(frozen=True)
class Digest:
    digest_id: str
    date: str
    items: list[DigestItem]
