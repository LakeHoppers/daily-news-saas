import asyncio

from app.modules.ai.domain.validation import js_slice


async def bounded(items, worker, concurrency):
    semaphore = asyncio.Semaphore(concurrency)

    async def one(item):
        async with semaphore:
            try:
                await worker(item)
                return None
            except Exception as exc:  # noqa: BLE001 - preserve per-item failure isolation
                return {"id": item["id"], "error": type(exc).__name__}

    errors = [e for e in await asyncio.gather(*(one(i) for i in items)) if e]
    return {"succeeded": len(items) - len(errors), "failed": len(errors), "errors": errors}


async def embed_articles(articles, ai):
    async def one(a):
        if not a.get("embedding"):
            a["embedding"] = await ai.embed(js_slice(a["title"] + "\n" + a["raw_content"], 4000))

    return await bounded(articles, one, 15)


async def summarize_stories(stories, ai):
    async def one(story):
        if story.get("summaries"):
            return
        articles = [
            {
                "title": a["title"],
                "content": js_slice(a["raw_content"], 2000),
                "sourceUrl": a["url"],
            }
            for a in story["articles"]
        ]
        # Keep successful extraction on local retries, tied to the immutable input snapshot.
        if not story.get("facts"):
            story["facts"] = await ai.extract(articles)
        output = await ai.summarize(
            story["facts"], [a["sourceUrl"] for a in articles], story["category"]
        )
        story["summaries"] = [{**output, "version": 1, "id": story["id"] + ":v1"}]
        story["category"] = output["category"]

    return await bounded(stories, one, 5)


def untranslated(story):
    if not story.get("summaries"):
        return False
    latest = max(story["summaries"], key=lambda s: s["version"])
    return any(
        not isinstance(latest.get("english", {}).get(k), str) or not latest["english"][k].strip()
        for k in ("headline", "body", "whyItMatters")
    )


async def translate_stories(stories, selected, published, ai):
    current = [stories[i] for i in selected if untranslated(stories[i])]
    retries = [
        s
        for s in stories.values()
        if s["id"] in published and s["id"] not in selected and untranslated(s)
    ]
    retries.sort(key=lambda s: (s.get("created_at", ""), s["id"]))

    async def one(story):
        summary = max(story["summaries"], key=lambda s: s["version"])
        summary["english"] = await ai.translate(summary)

    return await bounded(current + retries[:5], one, 5)
