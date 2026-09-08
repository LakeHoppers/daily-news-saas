"""Compare independent live runs over identical immutable feed input."""

import argparse
import hashlib
import json
from pathlib import Path


def estimate(calls):
    cost = 0
    for c in calls:
        u = c.get("usage") or {}
        if (c.get("model") or "").startswith("text-embedding"):
            cost += u.get("total_tokens", 0) * 0.02 / 1e6
        else:
            cached = u.get("prompt_tokens_details", {}).get("cached_tokens", 0)
            cost += (
                (u.get("prompt_tokens", 0) - cached) * 0.15
                + cached * 0.075
                + u.get("completion_tokens", 0) * 0.60
            ) / 1e6
    return round(cost, 8)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", required=True, type=Path)
    parser.add_argument("--typescript", required=True, type=Path)
    args = parser.parse_args()
    py = json.loads((args.python / "state.json").read_text())
    report = json.loads((args.python / "report.json").read_text())
    ts = json.loads((args.typescript / "typescript.json").read_text())
    py_stories = py["stories"]
    ts_stories = {s["id"]: s for s in ts["stories"]}
    digest = py["digest_ids"]
    result = {
        "input_identical": json.loads((args.python / "input.json").read_text())
        == json.loads((args.typescript / "input.json").read_text()),
        "input_sha256": hashlib.sha256((args.python / "input.json").read_bytes()).hexdigest(),
        "cluster_groups_identical": {
            i: sorted(a["id"] for a in s["articles"]) for i, s in py_stories.items()
        }
        == {i: sorted(a["id"] for a in s["articles"]) for i, s in ts_stories.items()},
        "ranking_identical": {i: s["score"] for i, s in py_stories.items()}
        == {i: s["score"] for i, s in ts_stories.items()},
        "selected_story_ids_identical": digest == ts["build"]["storyIds"],
        "summary_category_differences": [
            i
            for i, s in py_stories.items()
            if s.get("summaries") and s["category"] != ts_stories.get(i, {}).get("category")
        ],
        "python_seconds": report["seconds"],
        "typescript_seconds_excluding_rss_download": ts["seconds"],
        "python_estimated_usd": report["metrics"]["estimated_usd"],
        "typescript_estimated_usd": estimate(ts["calls"]),
        "python_calls": len(report["metrics"]["calls"]),
        "typescript_calls": len(ts["calls"]),
        "groups": len(py_stories),
        "digest_count": len(digest),
        "category_counts": {
            cat: sum(py_stories[i]["category"] == cat for i in digest)
            for cat in sorted({py_stories[i]["category"] for i in digest})
        },
    }
    (args.python / "comparison.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    if not all(
        result[k] for k in ("input_identical", "cluster_groups_identical", "ranking_identical")
    ):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
