def select_digest(candidates):
    ranked = sorted(candidates, key=lambda s: (-s["score"], s["id"]))
    selected, counts = set(), {}
    for story in ranked:
        if len(selected) == 10:
            break
        cat = story["category"]
        if counts.get(cat, 0) < 4:
            selected.add(story["id"])
            counts[cat] = counts.get(cat, 0) + 1
    for story in ranked:
        if len(selected) == 10:
            break
        selected.add(story["id"])
    return [s["id"] for s in ranked if s["id"] in selected]
