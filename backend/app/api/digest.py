import re
from dataclasses import asdict
from datetime import date

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.digest.application.latest import GetDigestByDate, GetLatestDigest, GetStory


class WireModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class DigestItemResponse(WireModel):
    rank: int
    story_id: str
    category: str
    headline: str
    summary: str
    why_it_matters: str
    tags: list[str]
    source_urls: list[str]


class DigestResponse(WireModel):
    digest_id: str
    date: str
    items: list[DigestItemResponse]


router = APIRouter()


@router.get("/api/digests/latest", response_model=DigestResponse)
def latest_digest(request: Request, lang: str = "tr"):
    digest = GetLatestDigest(request.app.state.digest_repository).execute(
        "en" if lang == "en" else "tr"
    )
    if digest is None:
        return JSONResponse({"error": "No digest available yet"}, status_code=404)
    return DigestResponse.model_validate(asdict(digest))


@router.get("/api/digests/{day}", response_model=DigestResponse)
def dated_digest(day: str, request: Request):
    try:
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day):
            raise ValueError
        parsed = date.fromisoformat(day)
    except ValueError:
        return JSONResponse({"error": "date must be in YYYY-MM-DD format"}, status_code=400)
    digest = GetDigestByDate(request.app.state.digest_repository).execute(parsed)
    if digest is None:
        return JSONResponse({"error": "No digest for that date"}, status_code=404)
    return DigestResponse.model_validate(asdict(digest))


class StorySourceResponse(WireModel):
    title: str
    url: str
    published_at: str | None
    source_name: str


class StoryResponse(WireModel):
    story_id: str
    category: str
    importance_score: float
    headline: str | None
    summary: str | None
    why_it_matters: str | None
    tags: list[str]
    sources: list[StorySourceResponse]


@router.get("/api/stories/{story_id}", response_model=StoryResponse)
def story_detail(story_id: str, request: Request):
    story = GetStory(request.app.state.digest_repository).execute(story_id)
    if story is None:
        return JSONResponse({"error": "Story not found"}, status_code=404)
    return StoryResponse.model_validate(asdict(story))
