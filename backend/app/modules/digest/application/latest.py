from datetime import date
from typing import Literal, Protocol

from app.modules.digest.domain.models import Digest, HistoryEdition, Story

Locale = Literal["tr", "en"]


class DigestRepository(Protocol):
    def latest(self, locale: Locale = "tr") -> Digest | None: ...
    def by_date(self, day: date, locale: Locale = "tr") -> Digest | None: ...
    def story(self, story_id: str) -> Story | None: ...
    def history(
        self, categories: list[str], limit: int, locale: Locale = "tr"
    ) -> list[HistoryEdition]: ...


class GetLatestDigest:
    def __init__(self, repository: DigestRepository):
        self.repository = repository

    def execute(self, locale: Locale = "tr") -> Digest | None:
        return self.repository.latest(locale)


class GetDigestByDate:
    def __init__(self, repository: DigestRepository):
        self.repository = repository

    def execute(self, day: date) -> Digest | None:
        return self.repository.by_date(day)


class GetStory:
    def __init__(self, repository: DigestRepository):
        self.repository = repository

    def execute(self, story_id: str) -> Story | None:
        return self.repository.story(story_id)


class GetDigestHistory:
    def __init__(self, repository: DigestRepository):
        self.repository = repository

    def execute(
        self, categories: list[str], limit: int = 14, locale: Locale = "tr"
    ) -> list[HistoryEdition]:
        if not 1 <= limit <= 50:
            raise ValueError("limit must be between 1 and 50")
        return self.repository.history(categories, limit, locale)
