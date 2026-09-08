from datetime import timedelta

from sqlalchemy import text

from app.modules.dedup.domain.clustering import average


class PostgresSnapshotReader:
    def __init__(self, engine):
        self.engine = engine

    def read(self, run_id=None):
        with self.engine.connect() as conn, conn.begin():
            conn.execute(text("SET TRANSACTION READ ONLY"))
            assert conn.scalar(text("SHOW transaction_read_only")) == "on"
            run = (
                conn.execute(
                    text("""
                SELECT id, "startedAt", "finishedAt", stats FROM "PipelineRun"
                WHERE status IN ('SUCCESS', 'PARTIAL_FAILURE') AND "finishedAt" IS NOT NULL
                  AND CAST(COALESCE(stats->'cluster'->>'newStories', '0') AS integer) > 0
                  AND (CAST(:id AS text) IS NULL OR id = :id)
                ORDER BY "startedAt" DESC LIMIT 1
            """),
                    {"id": run_id},
                )
                .mappings()
                .first()
            )
            if not run:
                raise ValueError("No completed run with new stories found")
            sources = [
                dict(r)
                for r in conn.execute(
                    text(
                        """SELECT id, name, url FROM "Source" WHERE active AND type = 'RSS' ORDER BY id"""
                    )
                ).mappings()
            ]
            params = {
                "start": run["startedAt"],
                "end": run["finishedAt"],
                "since": run["startedAt"] - timedelta(hours=48),
            }
            rows = conn.execute(
                text("""
                SELECT a.id, a."storyId" AS story_id, a."sourceId" AS source_id,
                  a."externalId" AS external_id, a."fetchedAt" AS fetched_at, a.embedding, a."publishedAt" AS published_at,
                  s.category AS source_category, s."trustScore" AS trust_score,
                  t."createdAt" AS story_created, t."importanceScore" AS stored_score
                FROM "RawArticle" a JOIN "Source" s ON s.id = a."sourceId"
                JOIN "Story" t ON t.id = a."storyId"
                WHERE t."createdAt" >= :since AND t."createdAt" <= :end
                  AND a."fetchedAt" <= :end
                ORDER BY a."publishedAt" DESC NULLS LAST, a.id
            """),
                params,
            ).mappings()
            current, old = {}, {}
            for row in rows:
                article = dict(row)
                target = current if row["story_created"] >= run["startedAt"] else old
                group = target.setdefault(
                    row["story_id"],
                    {"id": row["story_id"], "stored_score": row["stored_score"], "articles": []},
                )
                article.pop("story_created")
                article.pop("stored_score")
                article["fetched_at"] = article["fetched_at"].isoformat()
                if article["published_at"]:
                    article["published_at"] = article["published_at"].isoformat()
                group["articles"].append(article)
            articles = [a for s in current.values() for a in s["articles"]]
            attachments = [
                a
                for s in old.values()
                for a in s["articles"]
                if a["fetched_at"] >= run["startedAt"].isoformat()
            ]
            articles.extend(attachments)
            articles.sort(key=lambda a: (a["published_at"] or "", a["id"]), reverse=True)
            centroids = []
            for s in old.values():
                vectors = [
                    a["embedding"]
                    for a in s["articles"]
                    if a["embedding"] and a["fetched_at"] < run["startedAt"].isoformat()
                ]
                if vectors:
                    centroids.append({"story_id": s["id"], "centroid": average(vectors)})
            logs = [
                dict(r)
                for r in conn.execute(
                    text(
                        'SELECT "sourceId" AS source_id, success, "articleCount" AS article_count '
                        'FROM "ScrapeLog" WHERE "pipelineRunId" = :id'
                    ),
                    {"id": run["id"]},
                ).mappings()
            ]
            return {
                "run_id": run["id"],
                "as_of": run["startedAt"].isoformat(),
                "finished_at": run["finishedAt"].isoformat(),
                "run_stats": run["stats"],
                "transaction_read_only": True,
                "sources": sources,
                "scrape_logs": logs,
                "articles": articles,
                "centroids": centroids,
                "stored_stories": list(current.values()),
                "ranking_stories": list(current.values())
                + [s for key, s in old.items() if key in {a["story_id"] for a in attachments}],
                "expected_attachments": [
                    {"article_id": a["id"], "story_id": a["story_id"]} for a in attachments
                ],
            }
