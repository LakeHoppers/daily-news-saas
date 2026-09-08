from dataclasses import dataclass


@dataclass(frozen=True)
class Article:
    external_id: str
    url: str
    title: str
    raw_content: str
    published_at: str | None
