from datetime import date
from types import SimpleNamespace as Row

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.modules.digest.application.latest import GetDigestHistory
from app.modules.digest.domain.models import Digest, Story
from app.modules.digest.infrastructure.repository import project_digest
from app.modules.user.application.reads import ReadExistingUser, ReadUserHistory
from app.modules.user.domain.models import CurrentUser, Preference, Subscription, UserIdentity


class FakeReads:
    def __init__(self):
        self.calls = []

    def latest(self, locale="tr"):
        self.calls.append(locale)
        return Digest("latest", "2026-09-09", [])

    def by_date(self, day, locale="tr"):
        self.calls.append(day)
        return Digest("dated", day.isoformat(), []) if day == date(2026, 9, 8) else None

    def story(self, story_id):
        return (
            Story(story_id, "SOCIETY", 12, None, None, None, [], [])
            if story_id == "found"
            else None
        )

    def history(self, categories, limit, locale):
        self.calls.append((categories, limit, locale))
        return []


def test_latest_locale_and_route_precedence():
    repo = FakeReads()
    with TestClient(create_app(repo)) as client:
        assert client.get("/api/digests/latest?lang=en").json()["digestId"] == "latest"
        assert client.get("/api/digests/latest?lang=de").status_code == 200
    assert repo.calls == ["en", "tr"]


@pytest.mark.parametrize("day", ["bad", "2026-2-03", "2026-02-30", "2026-13-01", "0000-01-01"])
def test_invalid_dates_are_400_without_query(day):
    repo = FakeReads()
    with TestClient(create_app(repo)) as client:
        response = client.get(f"/api/digests/{day}")
        assert response.status_code == 400
    assert repo.calls == []


def test_date_and_story_contracts():
    with TestClient(create_app(FakeReads())) as client:
        assert client.get("/api/digests/2026-09-08").json() == {
            "digestId": "dated",
            "date": "2026-09-08",
            "items": [],
        }
        assert client.get("/api/digests/2000-01-01").json() == {"error": "No digest for that date"}
        missing = client.get("/api/stories/missing")
        assert missing.status_code == 404
        assert missing.json() == {"error": "Story not found"}
        story = client.get("/api/stories/found").json()
        assert story == {
            "storyId": "found",
            "category": "SOCIETY",
            "importanceScore": 12,
            "headline": None,
            "summary": None,
            "whyItMatters": None,
            "tags": [],
            "sources": [],
        }


def test_latest_summary_localizes_per_field_and_keeps_tags():
    args = (
        Row(id="d", date=date(2026, 9, 9)),
        [(Row(rank=1, story_id="s"), Row(category="ECONOMY"))],
        [
            Row(
                story_id="s",
                version=1,
                headline="old",
                body="old",
                why_it_matters="old",
                headline_en="old English",
                tags=[],
            ),
            Row(
                story_id="s",
                version=2,
                headline="Türkçe",
                body="Gövde",
                why_it_matters="Önem",
                headline_en="English",
                body_en=None,
                why_it_matters_en="",
                tags=["Türkçe etiket"],
            ),
        ],
        [],
    )
    item = project_digest(*args, locale="en").items[0]
    assert (item.headline, item.summary, item.why_it_matters, item.tags) == (
        "English",
        "Gövde",
        "Önem",
        ["Türkçe etiket"],
    )
    assert project_digest(*args).items[0].headline == "Türkçe"


@pytest.mark.parametrize(
    "path",
    [
        "/api/me",
        "/api/me/digests",
        "/api/me/preferences",
        "/api/admin/sources",
        "/api/billing/checkout",
        "/api/cron/deliver",
    ],
)
def test_protected_and_mutating_routes_are_not_exposed(path):
    with TestClient(create_app(FakeReads())) as client:
        assert client.get(path).status_code == 404
        assert client.post(path, json={}).status_code == 404
        assert client.patch(path, json={}).status_code == 404


def test_internal_user_history_is_identity_scoped_and_unknown_users_do_not_provision():
    identity = UserIdentity(
        "subject",
        False,
        CurrentUser(
            "u",
            "test@example.com",
            Preference("p", "u", ["ECONOMY"], 9, "Europe/Berlin", False, "now"),
            Subscription("FREE", "ACTIVE"),
        ),
    )

    class Users:
        def find_by_clerk_id(self, subject):
            return identity if subject == "subject" else None

    users = Users()
    digests = FakeReads()
    assert ReadExistingUser(users).execute("missing") is None
    with pytest.raises(ValueError):
        ReadExistingUser(users).execute("")
    with pytest.raises(LookupError):
        ReadUserHistory(users, digests).execute("missing")
    assert digests.calls == []
    assert ReadUserHistory(users, digests).execute("subject", 5, "en") == []
    assert digests.calls == [(["ECONOMY"], 5, "en")]
    with pytest.raises(ValueError):
        GetDigestHistory(digests).execute([], 100)
