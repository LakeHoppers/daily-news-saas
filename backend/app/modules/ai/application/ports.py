from typing import Protocol


class Embedder(Protocol):
    async def embed(self, value: str) -> list[float]: ...


class FactExtractor(Protocol):
    async def extract(self, articles: list[dict]) -> list[str]: ...


class Summarizer(Protocol):
    async def summarize(self, facts: list[str], urls: list[str], category: str) -> dict: ...


class Translator(Protocol):
    async def translate(self, summary: dict) -> dict: ...


class AIProvider(Embedder, FactExtractor, Summarizer, Translator, Protocol):
    pass
