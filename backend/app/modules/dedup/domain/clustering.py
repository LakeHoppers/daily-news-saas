"""Parity port: preserve the TS threshold, union-find and tie behavior."""

import math


def cosine(a, b):
    if not a or len(a) != len(b):
        return 0.0
    dot = norm_a = norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b)) if norm_a and norm_b else 0.0


def average(vectors):
    if not vectors:
        return []
    return [sum(v[i] for v in vectors) / len(vectors) for i in range(len(vectors[0]))]


def best_match(embedding, centroids, threshold=0.83):
    best, score = None, threshold
    for candidate in centroids:
        similarity = cosine(embedding, candidate["centroid"])
        if similarity >= score:
            best, score = candidate["story_id"], similarity
    return best


def cluster(items, threshold=0.83):
    parents = {item["id"]: item["id"] for item in items}

    def find(key):
        root = key
        while parents[root] != root:
            root = parents[root]
        parents[key] = root
        return root

    for i, a in enumerate(items):
        for b in items[i + 1 :]:
            if cosine(a["embedding"], b["embedding"]) >= threshold:
                ra, rb = find(a["id"]), find(b["id"])
                if ra != rb:
                    parents[ra] = rb
    groups = {}
    for item in items:
        groups.setdefault(find(item["id"]), []).append(item)
    return list(groups.values())


def category(items):
    counts = {}
    for item in items:
        if item.get("source_category"):
            key = item["source_category"]
            counts[key] = counts.get(key, 0) + 1
    return max(counts, key=counts.get) if counts else "SOCIETY"
