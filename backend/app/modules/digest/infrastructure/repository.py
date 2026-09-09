from collections import defaultdict
from datetime import date

from sqlalchemy import String, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.modules.digest.application.latest import Locale
from app.modules.digest.domain.models import (
    Digest,
    DigestItem,
    HistoryEdition,
    HistoryItem,
    Story,
    StorySource,
)
from app.modules.digest.infrastructure.models import (
    ArticleRow,
    DigestItemRow,
    DigestRow,
    SourceRow,
    StoryRow,
    SummaryRow,
)


def localized(summary, field: str, locale: Locale):
    if summary is None:
        return ""
    english = getattr(summary, f"{field}_en", None)
    return english if locale == "en" and english else getattr(summary, field)


def project_digest(digest, rows, summaries, articles, locale: Locale = "tr") -> Digest:
    latest = {}
    for summary in summaries:
        previous = latest.get(summary.story_id)
        if previous is None or summary.version > previous.version:
            latest[summary.story_id] = summary
    urls = defaultdict(list)
    for article in articles:
        urls[article.story_id].append(article.url)
    items = []
    for item, story in sorted(rows, key=lambda row: row[0].rank):
        summary = latest.get(item.story_id)
        items.append(
            DigestItem(
                rank=item.rank,
                story_id=item.story_id,
                category=story.category,
                headline=localized(summary, "headline", locale),
                summary=localized(summary, "body", locale),
                why_it_matters=localized(summary, "why_it_matters", locale),
                tags=summary.tags if summary else [],
                source_urls=urls[item.story_id],
            )
        )
    return Digest(digest_id=digest.id, date=digest.date.isoformat(), items=items)


class SqlAlchemyDigestRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def latest(self, locale: Locale = "tr") -> Digest | None:
        return self._digest(select(DigestRow).order_by(DigestRow.date.desc()).limit(1), locale)

    def by_date(self, day: date, locale: Locale = "tr") -> Digest | None:
        return self._digest(select(DigestRow).where(DigestRow.date == day), locale)

    def _digest(self, query, locale: Locale) -> Digest | None:
        with Session(self.engine) as session, session.begin():
            session.execute(text("SET TRANSACTION READ ONLY"))
            digest = session.scalar(query)
            if digest is None:
                return None
            rows = session.execute(
                select(DigestItemRow, StoryRow)
                .join(StoryRow, StoryRow.id == DigestItemRow.story_id)
                .where(DigestItemRow.digest_id == digest.id)
                .order_by(DigestItemRow.rank, DigestItemRow.id)
            ).all()
            ids = [item.story_id for item, _ in rows]
            summaries = self._summaries(session, ids)
            articles = (
                session.scalars(
                    select(ArticleRow).where(ArticleRow.story_id.in_(ids)).order_by(ArticleRow.id)
                ).all()
                if ids
                else []
            )
            return project_digest(digest, rows, summaries, articles, locale)

    @staticmethod
    def _summaries(session, ids):
        return (
            session.scalars(
                select(SummaryRow)
                .where(SummaryRow.story_id.in_(ids))
                .distinct(SummaryRow.story_id)
                .order_by(SummaryRow.story_id, SummaryRow.version.desc(), SummaryRow.id)
            ).all()
            if ids
            else []
        )

    def history(
        self, categories: list[str], limit: int, locale: Locale = "tr"
    ) -> list[HistoryEdition]:
        with Session(self.engine) as session, session.begin():
            session.execute(text("SET TRANSACTION READ ONLY"))
            digests = session.scalars(
                select(DigestRow).order_by(DigestRow.date.desc()).limit(limit)
            ).all()
            query = (
                select(DigestItemRow, StoryRow)
                .join(StoryRow, StoryRow.id == DigestItemRow.story_id)
                .where(DigestItemRow.digest_id.in_([d.id for d in digests]))
                .order_by(DigestItemRow.rank, DigestItemRow.id)
            )
            if categories:
                # Prisma owns the PostgreSQL enum; cast for a read-only text projection.
                query = query.where(StoryRow.category.cast(String).in_(categories))
            rows = session.execute(query).all()
            summaries = {
                s.story_id: s for s in self._summaries(session, [i.story_id for i, _ in rows])
            }
            items = defaultdict(list)
            for item, story in rows:
                items[item.digest_id].append(
                    HistoryItem(
                        rank=item.rank,
                        story_id=item.story_id,
                        category=story.category,
                        headline=localized(summaries.get(item.story_id), "headline", locale),
                    )
                )
            # Preserve empty editions: TS limits editions before category filtering.
            return [HistoryEdition(d.date.isoformat(), items[d.id]) for d in digests]

    def story(self, story_id: str) -> Story | None:
        with Session(self.engine) as session, session.begin():
            session.execute(text("SET TRANSACTION READ ONLY"))
            row = session.get(StoryRow, story_id)
            if row is None:
                return None
            summaries = self._summaries(session, [story_id])
            summary = summaries[0] if summaries else None
            articles = session.execute(
                select(ArticleRow, SourceRow.name)
                .join(SourceRow, SourceRow.id == ArticleRow.source_id)
                .where(ArticleRow.story_id == story_id)
                .order_by(ArticleRow.id)
            ).all()
            return Story(
                story_id=row.id,
                category=row.category,
                importance_score=row.importance_score,
                headline=summary.headline if summary else None,
                summary=summary.body if summary else None,
                why_it_matters=summary.why_it_matters if summary else None,
                tags=summary.tags if summary else [],
                sources=[
                    StorySource(
                        a.title,
                        a.url,
                        a.published_at.isoformat(timespec="milliseconds") + "Z"
                        if a.published_at
                        else None,
                        name,
                    )
                    for a, name in articles
                ],
            )
