/** Offline oracle: actual TS domain code and installed RSS parser, no DB/AI/writes. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Parser from "rss-parser";
import { clusterBySimilarity, findBestCentroidMatch, pickCategory } from "../src/modules/dedup/domain/clustering";
import { computeImportanceScore } from "../src/modules/ranking/domain/scoring";
import type { Category } from "../src/generated/prisma/enums";
interface Article { id: string; embedding: number[]; source_category: Category | null; source_id: string; trust_score: number; published_at: string | null; }
interface Normalized { external_id: string; url: string; title: string; raw_content: string; published_at: string | null; }
interface Snapshot {
  as_of: string;
  articles: Article[];
  centroids: {story_id: string; centroid: number[]}[];
  ranking_stories: {id: string; articles: Article[]}[];
  sources: {id: string; url: string}[];
  feeds: {source_id: string; success: boolean; xml_file?: string; articles: Normalized[]}[];
}
async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Usage: tsx scripts/compare-python-pipeline.ts <artifact-dir>");
  const snapshot: Snapshot = JSON.parse(readFileSync(join(dir,"snapshot.json"),"utf8"));
  const python = JSON.parse(readFileSync(join(dir,"python.json"),"utf8"));
  const centroids = snapshot.centroids.map(s=>({storyId:s.story_id,centroid:s.centroid}));
  const attached: {article_id: string; story_id: string}[] = [], deferred: string[] = [], remaining: Article[] = [];
  const selected = snapshot.articles.slice(0,150);
  for (const article of selected) {
    if (!article.embedding.length) { deferred.push(article.id); continue; }
    const match = findBestCentroidMatch(article.embedding,centroids,0.83);
    if (match) attached.push({article_id:article.id,story_id:match}); else remaining.push(article);
  }
  const groups = clusterBySimilarity(remaining,0.83).map(g=>({article_ids:g.map(a=>a.id).sort(),category:pickCategory(g.map(a=>({sourceCategory:a.source_category})))})).sort((a,b)=>a.article_ids.join().localeCompare(b.article_ids.join()));
  const scores = Object.fromEntries(snapshot.ranking_stories.map(s=>{
    const trusts = new Map(s.articles.map(a=>[a.source_id,a.trust_score]));
    const dates = s.articles.flatMap(a=>a.published_at ? [new Date(a.published_at).getTime()] : []);
    return [s.id,computeImportanceScore({distinctSourceCount:trusts.size,avgTrustScore:[...trusts.values()].reduce((a,b)=>a+b,0)/trusts.size,mostRecentPublishedAt:dates.length ? new Date(Math.max(...dates)):null,now:new Date(snapshot.as_of)})];
  }));
  const plan = {selected:selected.length,deferred,attached,groups};
  const parser = new Parser();
  const feeds = [];
  for (const feed of snapshot.feeds.filter(f=>f.success)) {
    const url = snapshot.sources.find(s=>s.id===feed.source_id)!.url;
    const parsed = await parser.parseString(readFileSync(join(dir,feed.xml_file!),"utf8"));
    const normalized = parsed.items.map(i=>({external_id:i.guid ?? i.link ?? i.title ?? url,url:i.link ?? url,title:i.title ?? "(untitled)",raw_content:i.contentSnippet ?? i.content ?? i.summary ?? "",published_at:i.isoDate ? new Date(i.isoDate).toISOString():null}));
    const fields: (keyof Normalized)[] = ["external_id","url","title","raw_content","published_at"];
    feeds.push({source_id:feed.source_id,ts_count:normalized.length,python_count:feed.articles.length,differences:Object.fromEntries(fields.map(key=>[key,normalized.filter((a,i)=>a[key]!==feed.articles[i]?.[key]).length]))});
  }
  const report = {plan_matches:JSON.stringify(plan)===JSON.stringify(python.result.plan),scores_match:Object.entries(scores).every(([id,score])=>score===python.result.scores[id]),feeds};
  writeFileSync(join(dir,"comparison.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!report.plan_matches || !report.scores_match || feeds.some(f=>f.ts_count!==f.python_count || Object.values(f.differences).some(n=>n))) process.exitCode=1;
}
void main();
