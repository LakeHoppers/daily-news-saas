"""Read projections onto Prisma-owned tables; never call create_all on this metadata."""

from datetime import date, datetime

from sqlalchemy import ARRAY, Date, DateTime, Float, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class DigestRow(Base):
    __tablename__ = "Digest"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[date] = mapped_column(Date)


class DigestItemRow(Base):
    __tablename__ = "DigestItem"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    digest_id: Mapped[str] = mapped_column("digestId", String)
    story_id: Mapped[str] = mapped_column("storyId", String)
    rank: Mapped[int] = mapped_column(Integer)


class StoryRow(Base):
    __tablename__ = "Story"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    category: Mapped[str] = mapped_column(String)
    importance_score: Mapped[float] = mapped_column("importanceScore", Float)


class SummaryRow(Base):
    __tablename__ = "Summary"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    story_id: Mapped[str] = mapped_column("storyId", String)
    version: Mapped[int] = mapped_column(Integer)
    headline: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(String)
    why_it_matters: Mapped[str] = mapped_column("whyItMatters", String)
    headline_en: Mapped[str | None] = mapped_column("headlineEn", String)
    body_en: Mapped[str | None] = mapped_column("bodyEn", String)
    why_it_matters_en: Mapped[str | None] = mapped_column("whyItMattersEn", String)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String))


class ArticleRow(Base):
    __tablename__ = "RawArticle"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    story_id: Mapped[str | None] = mapped_column("storyId", String)
    url: Mapped[str] = mapped_column(String)

    title: Mapped[str] = mapped_column(String)
    source_id: Mapped[str] = mapped_column("sourceId", String)
    published_at: Mapped[datetime | None] = mapped_column("publishedAt", DateTime)


class SourceRow(Base):
    __tablename__ = "Source"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
