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
