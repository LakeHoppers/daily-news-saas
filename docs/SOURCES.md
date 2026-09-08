# Additional RSS coverage — 2026-09-08

Seven feeds added to the seed, bringing the configured catalog to 15. Each was
found on a publisher page and fetched directly with HTTP 200, then parsed with
our installed rss-parser. No article-page scraping or new AI calls were needed.
Counts below are a verification snapshot and will change.

| Source | Category | Trust | Items parsed | Feed |
|---|---|---:|---:|---|
| heise online | TECHNOLOGY | 90 | 156 | https://www.heise.de/rss/heise-atom.xml |
| Sportschau | SPORTS | 90 | 79 | https://www.sportschau.de/index~rss2.xml |
| Deutschlandfunk Gesellschaft | SOCIETY | 90 | 100 | https://www.deutschlandfunk.de/gesellschaft-106.rss |
| Handelsblatt Unternehmen | BUSINESS | 85 | 20 | https://feeds.cms.handelsblatt.com/unternehmen |
| BAMF Aktuelle Meldungen | IMMIGRATION | 90 | 20 | https://www.bamf.de/SiteGlobals/Functions/RSS/DE/Feed/RSSNewsfeed_Meldungen.xml?nn=282672 |
| Berliner Zeitung Mensch & Metropole | BERLIN | 80 | 50 | https://www.berliner-zeitung.de/feed.id_mensch_und_metropole.xml |
| Deutschlandfunk Europa | EUROPE | 90 | 30 | https://www.deutschlandfunk.de/europa-112.rss |

Trust scores are editorial inputs, not measured accuracy probabilities: established
specialist/public broadcasters at 90, Handelsblatt matches its existing 85, and
Berliner Zeitung at 80. BAMF is a primary source for its own migration/integration
announcements, not an independent assessment of government policy. Its latest item
at verification was August 27 local time; the feed is valid but low-frequency and
may contribute nothing in the 48-hour freshness window. Europa's latest entry was
September 5 local time, so it too need not supply an item every day.

Publisher directories:
- https://www.heise.de/news-extern/news.html
- https://www.sportschau.de/service/rssfeeds-sp-102.html
- https://www.deutschlandfunk.de/rss-angebot-102.html
- https://www.handelsblatt.com/rss-feeds/
- https://www.bamf.de/DE/Service/Abonnieren/RSS/rss_node.html
- https://www.berliner-zeitung.de/article/rss-feeds-der-berliner-zeitung-25605

Berlin now has Tagesspiegel and Berliner Zeitung; Europe has DW and Deutschlandfunk.
A second feed from the same publisher is not independent corroboration. The current
ranking code still counts source records; publisher-level deduplication and shared
wire-service attribution remain separate follow-ups. Categories on feeds are
initial hints; the summarizer can assign a story to another category.

The selection pool now reads at most 10 unused, recently published, summarized
stories per category (90 total) rather than only the global top 10. Selection
prefers at most 4 per category, then fills unoccupied slots by importance. Both
passes use score descending, story ID ascending ties; final ranks use that same
order. If only one category is available, the top ten still fill the digest.

This policy acts only on already summarized candidates. The unchanged 15-story
summarization budget can still limit variety; more feeds also increase ingestion
and embedding work. No extra summarization calls were added. Re-measure full-run
time/cost on a normal day after these feeds start contributing.
