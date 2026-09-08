import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.modules.dedup.application.plan import plan_clusters
from app.modules.dedup.domain.clustering import average, best_match, category, cluster, cosine
from app.modules.parser.infrastructure.rss import parse_feed
from app.modules.ranking.domain.scoring import importance, score_articles
from app.modules.scraper.application.fetch import fetch_sources


def article(key, vector, **extra):
    return {"id": key, "embedding": vector, "source_category": "POLITICS", **extra}


def test_transitive_clusters_and_separate_event():
    # A-B and B-C clear 0.83; A-C does not. Preserve TS single-link behavior.
    items = [
        article("a", [1, 0]),
        article("b", [0.9, 0.4]),
        article("c", [0.65, 0.75]),
        article("d", [-1, 0]),
    ]
    assert [[a["id"] for a in g] for g in cluster(items)] == [["a", "b", "c"], ["d"]]
    assert cosine([], []) == cosine([0, 0], [1, 2]) == cosine([1], [1, 2]) == 0
    assert average([[1, 0], [0, 1]]) == [0.5, 0.5]


def test_existing_centroid_ties_and_category_ties_follow_input_order():
    assert (
        best_match(
            [1, 0], [{"story_id": "a", "centroid": [1, 0]}, {"story_id": "b", "centroid": [1, 0]}]
        )
        == "b"
    )
    assert category([{"source_category": "BERLIN"}, {"source_category": "ECONOMY"}]) == "BERLIN"
    assert category([{"source_category": None}]) == "SOCIETY"


def test_budget_deferred_embeddings_and_existing_attachment():
    items = [article("missing", []), article("existing", [1, 0]), article("new", [0, 1])]
    result = plan_clusters(items, [{"story_id": "old", "centroid": [1, 0]}], limit=2)
    assert result == {
        "selected": 2,
        "deferred": ["missing"],
        "attached": [{"article_id": "existing", "story_id": "old"}],
        "groups": [],
    }
    assert plan_clusters([article(str(i), [1, 0]) for i in range(151)], [])["selected"] == 150


def test_ranking_distinct_sources_recency_and_js_rounding():
    now = datetime(2026, 9, 8, tzinfo=UTC)
    assert importance(2, 90, now - timedelta(hours=2), now) == 84
    assert importance(1, 90, None, now) == 54
    assert importance(1, 90, now + timedelta(hours=1), now) == 79
    assert importance(1, 0.075, None, now) == 0.05  # bankers rounding would differ
    records = [{"source_id": "a", "trust_score": 90, "published_at": now.isoformat()}] * 2
    assert score_articles(records, now) == 78


def test_rss_identity_markup_and_invalid_dates():
    xml = b"<rss><channel><item><guid>x</guid><title>A</title><description>&lt;p&gt;Hi &amp;amp; bye&lt;/p&gt;</description><pubDate>nonsense</pubDate></item></channel></rss>"
    result = parse_feed(xml, "https://example.com/rss")[0]
    assert result.external_id == "x"
    assert result.url == "https://example.com/rss"
    assert result.raw_content == "Hi & bye"
    assert result.published_at is None


def test_atom_alternate_link_and_published_precedence():
    xml = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>unused-id</id><title>T</title><link rel="self" href="self"/><link rel="alternate" href="article"/><published>2026-09-08T10:00:00+02:00</published><updated>2026-09-09T10:00:00Z</updated><summary>Summary</summary></entry></feed>'
    result = parse_feed(xml, "feed")[0]
    assert result.external_id == result.url == "article"
    assert result.published_at == "2026-09-08T08:00:00.000Z"
    assert result.raw_content == "Summary"


@pytest.mark.parametrize("xml", [b"<!DOCTYPE rss><rss/>", b"<html/>", b"<rss>"])
def test_invalid_or_unsafe_feed_is_rejected(xml):
    with pytest.raises(ValueError if xml != b"<rss>" else Exception):
        parse_feed(xml, "feed")


def test_parallel_source_failure_isolation():
    class Fetcher:
        active = 0
        peak = 0

        async def fetch(self, url):
            self.active += 1
            self.peak = max(self.peak, self.active)
            await asyncio.sleep(0)
            self.active -= 1
            if url == "bad":
                raise ValueError("broken")
            return b"<rss/>", []

    fetcher = Fetcher()
    result = asyncio.run(
        fetch_sources([{"id": "a", "url": "ok"}, {"id": "b", "url": "bad"}], fetcher)
    )
    assert fetcher.peak == 2
    assert [r["success"] for r in result] == [True, False]
