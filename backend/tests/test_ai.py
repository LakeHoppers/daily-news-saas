import asyncio
import json

import httpx
import pytest

from app.modules.ai.application.stages import bounded, translate_stories
from app.modules.ai.domain.validation import (
    embedding_output,
    fact_list,
    summary_output,
    text_fields,
)
from app.modules.ai.infrastructure.openai import OpenAIProvider, ProviderError
from app.modules.digest.domain.selection import select_digest
from app.pipeline.application.local_run import run_local


@pytest.mark.parametrize(
    "value",
    [
        None,
        [],
        {"headline": 3, "body": "b", "whyItMatters": "c"},
        {"headline": "a", "body": " ", "whyItMatters": "c"},
    ],
)
def test_invalid_text_output(value):
    with pytest.raises(ValueError):
        text_fields(value)


def test_fact_and_embedding_validation():
    assert fact_list({"facts": ["fact", None, "  "]}) == ["fact"]
    with pytest.raises(ValueError):
        fact_list({"facts": []})
    for vector in ([0] * 256, [1] * 255, [float("nan")] * 256, [True] * 256):
        with pytest.raises(ValueError):
            embedding_output(vector)
    assert (
        summary_output(
            {"headline": "a", "body": "b", "whyItMatters": "c", "category": "BAD"}, "ECONOMY"
        )["category"]
        == "ECONOMY"
    )


def test_retry_transient_http_and_usage(monkeypatch):
    requests = []

    def handle(request):
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(429, headers={"retry-after": "0"})
        return httpx.Response(
            200, json={"data": [{"embedding": [1] + [0] * 255}], "usage": {"total_tokens": 100}}
        )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            ai = OpenAIProvider(client, "test")
            assert len(await ai.embed("sample")) == 256
            assert len(ai.calls) == 2
            assert ai.metrics()["estimated_usd"] == 0.000002

    asyncio.run(run())
    assert len(requests) == 2
    assert json.loads(requests[-1].content)["dimensions"] == 256


def test_permanent_error_no_retry_or_sensitive_response():
    count = 0

    def handle(request):
        nonlocal count
        count += 1
        return httpx.Response(401, json={"error": "sensitive"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            with pytest.raises(ProviderError, match="HTTP 401") as error:
                await OpenAIProvider(client, "test").embed("sample")
            assert "sensitive" not in str(error.value)

    asyncio.run(run())
    assert count == 1


def test_worker_limit_and_failure_isolation():
    active = peak = 0

    async def worker(item):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        if item["id"] == 3:
            raise ValueError("bad")

    result = asyncio.run(bounded([{"id": i} for i in range(12)], worker, 5))
    assert peak == 5 and result["succeeded"] == 11 and result["failed"] == 1


def test_digest_soft_cap_and_no_empty_slots():
    candidates = [
        {
            "id": str(i).zfill(2),
            "score": 100 - i,
            "category": "POLITICS" if i < 12 else "SPORTS" if i < 16 else "TECHNOLOGY",
        }
        for i in range(18)
    ]
    ids = select_digest(candidates)
    assert len(ids) == 10
    assert len([i for i in ids if int(i) < 12]) == 4
    assert len(select_digest(candidates[:12])) == 10


class FakeAI:
    def __init__(self):
        self.calls = 0
        self.fail = True

    async def embed(self, text):
        self.calls += 1
        i = int(text.split("\n")[0].split()[-1])
        return [int(j == i) for j in range(256)]

    async def extract(self, articles):
        self.calls += 1
        return [articles[0]["title"]]

    async def summarize(self, facts, urls, category):
        self.calls += 1
        if self.fail and facts[0] == "Story 0":
            raise ValueError("temporary")
        return {
            "headline": facts[0],
            "body": "Body",
            "whyItMatters": "Why",
            "category": category,
            "tags": [],
        }

    async def translate(self, summary):
        self.calls += 1
        return {k: summary[k] for k in ("headline", "body", "whyItMatters")}


def test_partial_run_resume_keeps_facts_versions_and_exact_digest():
    data = {
        "as_of": "2026-09-08T12:00:00+00:00",
        "sources": [{"id": "s", "category": "POLITICS", "trustScore": 90}],
        "feeds": [
            {
                "source_id": "s",
                "success": True,
                "articles": [
                    {
                        "external_id": str(i),
                        "url": f"https://example.com/{i}",
                        "title": f"Story {i}",
                        "raw_content": "Text",
                        "published_at": "2026-09-08T11:00:00+00:00",
                    }
                    for i in range(10)
                ],
            }
        ],
    }
    ai = FakeAI()
    state = {}
    asyncio.run(run_local(data, state, ai))
    assert state["complete"] is False and len(state["digest_ids"]) == 9
    state = json.loads(json.dumps(state))  # Exercise real local checkpoint representation.
    ai.fail = False
    asyncio.run(run_local(data, state, ai))
    assert state["complete"] is True and len(state["digest_ids"]) == 10
    assert all(len(s["summaries"]) == 1 for s in state["stories"].values())
    calls = ai.calls
    asyncio.run(run_local(data, state, ai))
    assert ai.calls == calls
    assert list(state["digests"].values()) == [state["digest_ids"]]


def test_translation_retries_latest_published_version_with_budget():
    stories = {
        str(i): {
            "id": str(i),
            "summaries": [
                {
                    "id": "old",
                    "version": 1,
                    "english": {"headline": "done", "body": "done", "whyItMatters": "done"},
                },
                {"id": "new", "version": 2, "headline": "A", "body": "B", "whyItMatters": "C"},
            ],
        }
        for i in range(7)
    }
    ai = FakeAI()
    result = asyncio.run(translate_stories(stories, [], set(stories), ai))
    assert result["succeeded"] == 5
    result = asyncio.run(translate_stories(stories, [], set(stories), ai))
    assert result["succeeded"] == 2


def test_embedding_failure_is_recovered_from_local_checkpoint():
    class EmbeddingFailure(FakeAI):
        def __init__(self):
            super().__init__()
            self.fail = False
            self.embed_fail = True

        async def embed(self, value):
            if self.embed_fail and value.startswith("Story 0\n"):
                raise ValueError("temporary")
            return await super().embed(value)

    data = {
        "as_of": "2026-09-08T12:00:00+00:00",
        "sources": [{"id": "s", "category": "POLITICS", "trustScore": 90}],
        "feeds": [
            {
                "source_id": "s",
                "success": True,
                "articles": [
                    {
                        "external_id": str(i),
                        "url": f"https://example.com/{i}",
                        "title": f"Story {i}",
                        "raw_content": "Text",
                        "published_at": "2026-09-08T11:00:00+00:00",
                    }
                    for i in range(10)
                ],
            }
        ],
    }
    state = {}
    ai = EmbeddingFailure()
    asyncio.run(run_local(data, state, ai))
    assert not state["complete"] and not state["clustered"]
    ai.embed_fail = False
    state = json.loads(json.dumps(state))
    asyncio.run(run_local(data, state, ai))
    assert state["complete"] and len(state["stories"]) == 10
    assert len(state["embedding_ids"]) == 10


def test_cancellation_is_not_swallowed_as_story_failure():
    async def worker(item):
        raise asyncio.CancelledError()

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(bounded([{"id": "a"}], worker, 1))
