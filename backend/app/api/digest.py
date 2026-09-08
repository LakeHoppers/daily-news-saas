from dataclasses import asdict

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.modules.digest.application.latest import GetLatestDigest


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
def latest_digest(request: Request):
    digest = GetLatestDigest(request.app.state.digest_repository).execute()
    if digest is None:
        return JSONResponse({"error": "No digest available yet"}, status_code=404)
    return DigestResponse.model_validate(asdict(digest))
