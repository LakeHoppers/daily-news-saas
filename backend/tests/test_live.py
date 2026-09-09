import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import create_app
from app.shared.database import build_engine


@pytest.mark.live
@pytest.mark.skipif(os.getenv("RUN_LIVE_TESTS") != "1", reason="explicit opt-in required")
def test_real_neon_read_only_slice():
    engine = build_engine()
    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SHOW transaction_read_only")) == "on"
            assert connection.scalar(text("SHOW transaction_isolation")) == "repeatable read"
        with TestClient(create_app()) as client:
            response = client.get("/api/digests/latest")
        assert response.status_code == 200
        digest = response.json()
        assert digest["digestId"] and digest["items"]
        assert any(item["headline"] for item in digest["items"])
        assert [i["rank"] for i in digest["items"]] == sorted(i["rank"] for i in digest["items"])
    finally:
        engine.dispose()


@pytest.mark.live
@pytest.mark.skipif(os.getenv("RUN_LIVE_TESTS") != "1", reason="explicit opt-in required")
def test_real_pipeline_snapshot_is_read_only():
    from app.pipeline.application.replay import replay
    from app.pipeline.infrastructure.snapshot import PostgresSnapshotReader

    engine = build_engine()
    try:
        snapshot = PostgresSnapshotReader(engine).read()
        assert snapshot["transaction_read_only"] is True
        assert snapshot["articles"] and snapshot["ranking_stories"]
        result = replay(snapshot)
        assert result["plan"]["selected"] <= 150
        assert len(result["scores"]) == len(snapshot["ranking_stories"])
    finally:
        engine.dispose()


@pytest.mark.live
@pytest.mark.skipif(os.getenv("RUN_LIVE_TESTS") != "1", reason="explicit opt-in required")
def test_real_localized_history_and_public_details():
    from app.modules.digest.application.latest import GetDigestHistory
    from app.modules.digest.infrastructure.repository import SqlAlchemyDigestRepository
    from app.modules.user.infrastructure.repository import SqlAlchemyUserRepository

    engine = build_engine()
    try:
        repo = SqlAlchemyDigestRepository(engine)
        with TestClient(create_app(repo)) as client:
            latest = client.get("/api/digests/latest?lang=en").json()
            dated = client.get(f"/api/digests/{latest['date']}")
            assert dated.status_code == 200
            assert dated.json()["digestId"] == latest["digestId"]
            first = latest["items"][0]
            story = client.get(f"/api/stories/{first['storyId']}")
            assert story.status_code == 200
            assert story.json()["category"] == first["category"]
            assert story.json()["sources"]
        history = GetDigestHistory(repo).execute(["ECONOMY"], 14, "en")
        assert history
        assert all(item.category == "ECONOMY" for edition in history for item in edition.items)
        # Unknown identity is not provisioned, even with a production writer URL.
        assert (
            SqlAlchemyUserRepository(engine).find_by_clerk_id("phase3a-nonexistent-test-subject")
            is None
        )
    finally:
        engine.dispose()
