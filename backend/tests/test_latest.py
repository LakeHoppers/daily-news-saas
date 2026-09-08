from datetime import date
from types import SimpleNamespace as Row

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.main import create_app
from app.modules.digest.application.latest import GetLatestDigest
from app.modules.digest.domain.models import Digest
from app.modules.digest.infrastructure.repository import project_digest


class FakeRepository:
    def __init__(self, digest=None):
        self.digest = digest

    def latest(self):
        return self.digest


def test_use_case_empty():
    assert GetLatestDigest(FakeRepository()).execute() is None


def test_not_found_contract():
    with TestClient(create_app(FakeRepository())) as client:
        response = client.get("/api/digests/latest")
    assert response.status_code == 404
    assert response.json() == {"error": "No digest available yet"}


def test_projection_and_http_contract():
    digest = project_digest(
        Row(id="digest", date=date(2026, 9, 7)),
        [
            (Row(rank=2, story_id="missing"), Row(category="SOCIETY")),
            (Row(rank=1, story_id="story"), Row(category="POLITICS")),
        ],
        [
            Row(
                story_id="story", version=1, headline="Old", body="old", why_it_matters="", tags=[]
            ),
            Row(
                story_id="story",
                version=2,
                headline="Türkçe başlık",
                body="Özet",
                why_it_matters="Önemli",
                tags=["Almanya"],
            ),
        ],
        [
            Row(story_id="story", url="https://example.de/a"),
            Row(story_id="story", url="https://example.de/b"),
        ],
    )
    with TestClient(create_app(FakeRepository(digest))) as client:
        response = client.get("/api/digests/latest")
    assert response.status_code == 200
    result = response.json()
    assert result["digestId"] == "digest"
    assert result["date"] == "2026-09-07"
    assert result["items"][0] == {
        "rank": 1,
        "storyId": "story",
        "category": "POLITICS",
        "headline": "Türkçe başlık",
        "summary": "Özet",
        "whyItMatters": "Önemli",
        "tags": ["Almanya"],
        "sourceUrls": ["https://example.de/a", "https://example.de/b"],
    }
    assert result["items"][1]["headline"] == ""
    assert result["items"][1]["tags"] == []


def test_empty_edition_is_200():
    with TestClient(create_app(FakeRepository(Digest("empty", "2026-09-07", [])))) as client:
        assert client.get("/api/digests/latest").json()["items"] == []


def test_database_error_is_sanitized():
    class BrokenRepository:
        def latest(self):
            raise OperationalError("secret SQL", {}, Exception("secret URL"))

    with TestClient(create_app(BrokenRepository())) as client:
        response = client.get("/api/digests/latest")
    assert response.status_code == 503
    assert response.json() == {"error": "Digest service unavailable"}


def test_no_write_route():
    with TestClient(create_app(FakeRepository())) as client:
        assert client.post("/api/digests/latest").status_code == 405
