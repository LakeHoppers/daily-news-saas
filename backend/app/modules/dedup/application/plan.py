from app.modules.dedup.domain.clustering import best_match, category, cluster

MAX_ARTICLES_PER_RUN = 150


def plan_clusters(articles, centroids, limit=MAX_ARTICLES_PER_RUN):
    """Read-only plan. Missing embeddings are deferred, never generated in 2a.

    Caller supplies newest-first order, just like the TS repository. Existing
    centroids remain fixed during the run to preserve current production behavior.
    """
    selected = articles[:limit]
    remaining, attached, deferred = [], [], []
    for article in selected:
        if not article["embedding"]:
            deferred.append(article["id"])
            continue
        story = best_match(article["embedding"], centroids)
        if story is None:
            remaining.append(article)
        else:
            attached.append({"article_id": article["id"], "story_id": story})
    groups = [
        {"article_ids": sorted(a["id"] for a in group), "category": category(group)}
        for group in cluster(remaining)
    ]
    return {
        "selected": len(selected),
        "deferred": deferred,
        "attached": attached,
        "groups": sorted(groups, key=lambda g: g["article_ids"]),
    }
