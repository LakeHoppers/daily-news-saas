from collections import defaultdict

from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.modules.digest.domain.models import Digest, DigestItem
from app.modules.digest.infrastructure.models import (
    ArticleRow,
    DigestItemRow,
    DigestRow,
    StoryRow,
    SummaryRow,
)


def project_digest(digest, rows, summaries, articles) -> Digest:
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
                headline=summary.headline if summary else "",
                summary=summary.body if summary else "",
                why_it_matters=summary.why_it_matters if summary else "",
                tags=summary.tags if summary else [],
                source_urls=urls[item.story_id],
            )
        )
    return Digest(digest_id=digest.id, date=digest.date.isoformat(), items=items)


class SqlAlchemyDigestRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def latest(self) -> Digest | None:
        # One stable snapshot across queries, forced read-only even for a writer URL.
        with Session(self.engine) as session, session.begin():
            session.execute(text("SET TRANSACTION READ ONLY"))
            digest = session.scalar(select(DigestRow).order_by(DigestRow.date.desc()).limit(1))
            if digest is None:
                return None
            rows = session.execute(
                select(DigestItemRow, StoryRow)
                .join(StoryRow, StoryRow.id == DigestItemRow.story_id)
                .where(DigestItemRow.digest_id == digest.id)
                .order_by(DigestItemRow.rank)
            ).all()
            ids = [item.story_id for item, _ in rows]
            if not ids:
                return project_digest(digest, [], [], [])
            summaries = session.scalars(
                select(SummaryRow)
                .where(SummaryRow.story_id.in_(ids))
                .distinct(SummaryRow.story_id)
                .order_by(SummaryRow.story_id, SummaryRow.version.desc(), SummaryRow.id)
            ).all()
            articles = session.scalars(
                select(ArticleRow).where(ArticleRow.story_id.in_(ids)).order_by(ArticleRow.id)
            ).all()
            return project_digest(digest, rows, summaries, articles)
