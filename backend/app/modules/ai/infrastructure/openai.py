import asyncio
import json
import os
import time

import httpx

from app.modules.ai.domain.validation import (
    embedding_output,
    fact_list,
    summary_output,
    text_fields,
)
from app.modules.ai.infrastructure import prompts


class ProviderError(RuntimeError):
    pass


class OpenAIProvider:
    def __init__(self, client: httpx.AsyncClient, api_key=None):
        self.client = client
        self.key = api_key if api_key is not None else os.environ.get("OPENAI_API_KEY", "")
        self.calls = []

    async def request(self, path, payload, stage):
        if not self.key:
            raise ProviderError("OPENAI_API_KEY is required")
        for attempt in range(2):
            started = time.perf_counter()
            try:
                async with asyncio.timeout(30):
                    response = await self.client.post(
                        "https://api.openai.com/v1/" + path,
                        json=payload,
                        headers={"Authorization": "Bearer " + self.key},
                        timeout=30,
                    )
                self.calls.append(
                    {
                        "stage": stage,
                        "model": payload["model"],
                        "seconds": time.perf_counter() - started,
                        "status": response.status_code,
                        "usage": response.json().get("usage", {}) if response.is_success else {},
                    }
                )
                if response.is_success:
                    return response.json()
                retry = response.status_code == 429 or response.status_code >= 500
                if not retry or attempt:
                    raise ProviderError(f"OpenAI {stage} HTTP {response.status_code}")
                try:
                    delay = min(2.0, max(0.0, float(response.headers.get("retry-after", "1"))))
                except ValueError:
                    delay = 1.0
            except (httpx.TransportError, TimeoutError) as exc:
                self.calls.append(
                    {
                        "stage": stage,
                        "model": payload["model"],
                        "seconds": time.perf_counter() - started,
                        "status": "timeout/network",
                        "usage": {},
                    }
                )
                if attempt:
                    raise ProviderError(f"OpenAI {stage} transport failure") from exc
                delay = 1.0
            await asyncio.sleep(delay)
        raise AssertionError("unreachable")

    async def chat(self, stage, system, user, temperature):
        response = await self.request(
            "chat/completions",
            {
                "model": "gpt-4o-mini",
                "temperature": temperature,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
            stage,
        )
        try:
            content = response["choices"][0]["message"]["content"]
            return json.loads(content)
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderError("Malformed chat response") from exc

    async def embed(self, value):
        response = await self.request(
            "embeddings",
            {"model": "text-embedding-3-small", "input": value, "dimensions": 256},
            "embed",
        )
        try:
            return embedding_output(response["data"][0]["embedding"])
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderError("Malformed embedding response") from exc

    async def extract(self, articles):
        user = "\n---\n".join(
            f"Source {i + 1} ({a['sourceUrl']}):\nTitle: {a['title']}\n{a['content']}"
            for i, a in enumerate(articles)
        )
        return fact_list(await self.chat("extract", prompts.EXTRACT, user, 0.2))

    async def summarize(self, facts, urls, category):
        user = "\n".join(
            [
                f"Candidate category: {category or 'unknown'}",
                "Facts:",
                *[f"- {f}" for f in facts],
                "Source URLs:",
                *[f"- {u}" for u in urls],
            ]
        )
        return summary_output(await self.chat("summarize", prompts.SUMMARIZE, user, 0.4), category)

    async def translate(self, summary):
        user = json.dumps(text_fields(summary), ensure_ascii=False, separators=(",", ":"))
        return text_fields(await self.chat("translate", prompts.TRANSLATE, user, 0.3))

    def metrics(self):
        # USD estimate at published 2026-09-08 standard rates; not a billing invoice.
        cost = 0.0
        for call in self.calls:
            u = call["usage"]
            tokens = u.get("prompt_tokens", u.get("total_tokens", 0))
            if call["stage"] == "embed":
                cost += tokens * 0.02 / 1_000_000
            else:
                cached = u.get("prompt_tokens_details", {}).get("cached_tokens", 0)
                cost += (
                    (tokens - cached) * 0.15 + cached * 0.075 + u.get("completion_tokens", 0) * 0.60
                ) / 1_000_000
        return {"calls": self.calls, "estimated_usd": round(cost, 8)}
