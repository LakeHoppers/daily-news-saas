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


@dataclass(frozen=True)
class StorySource:
    title: str
    url: str
    published_at: str | None
    source_name: str


@dataclass(frozen=True)
class Story:
    story_id: str
    category: str
    importance_score: float
    headline: str | None
    summary: str | None
    why_it_matters: str | None
    tags: list[str]
    sources: list[StorySource]


@dataclass(frozen=True)
class HistoryItem:
    rank: int
    story_id: str
    category: str
    headline: str


@dataclass(frozen=True)
class HistoryEdition:
    date: str
    items: list[HistoryItem]
