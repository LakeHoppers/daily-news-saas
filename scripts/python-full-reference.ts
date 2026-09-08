/** Real TS use cases + live OpenAI, isolated in-memory repositories. No Prisma imports. */
import "dotenv/config";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {FetchArticlesUseCase} from "../src/modules/scraper/application/fetch-articles.use-case";
import {ClusterArticlesUseCase} from "../src/modules/dedup/application/cluster-articles.use-case";
import {RankStoriesUseCase} from "../src/modules/ranking/application/rank-stories.use-case";
import {SummarizeStoryUseCase} from "../src/modules/ai/summarizer/application/summarize-story.use-case";
import {BuildDigestUseCase} from "../src/modules/digest/application/build-digest.use-case";
import {TranslateStoriesUseCase} from "../src/modules/ai/translator/application/translate-stories.use-case";
import {OpenAIEmbedder} from "../src/modules/ai/providers/openai-embedder";
import {OpenAIFactExtractor} from "../src/modules/ai/providers/openai-fact-extractor";
import {OpenAISummarizer} from "../src/modules/ai/providers/openai-summarizer";
import {OpenAITranslator} from "../src/modules/ai/providers/openai-translator";
import type {Category} from "../src/generated/prisma/enums";
import type {FetchedArticle} from "../src/modules/scraper/domain/types";
import type {SummarizeOutput,TranslateOutput} from "../src/shared/ai-provider.interface";
interface Source {id:string;url:string;category:Category;trustScore:number}
interface Input {as_of:string;sources:Source[];feeds:{source_id:string;success:boolean;articles:{external_id:string;url:string;title:string;raw_content:string;published_at:string|null}[]}[]}
interface Article extends FetchedArticle {id:string;sourceId:string;embedding:number[];storyId?:string}
interface Story {id:string;category:Category;score:number;articles:Article[];summary?:SummarizeOutput;english?:TranslateOutput}
async function main(){
 const dir=process.argv[2];if(!dir)throw new Error("Artifact directory required");
 const input:Input=JSON.parse(readFileSync(join(dir,"input.json"),"utf8"));
 const nativeDate=Date;
 globalThis.Date=new Proxy(nativeDate,{construct(target,args){return Reflect.construct(target,args.length?args:[input.as_of]);},get(target,key){return key==="now"?()=>new nativeDate(input.as_of).getTime():Reflect.get(target,key);}});
 const realFetch=globalThis.fetch;const calls:unknown[]=[];
 globalThis.fetch=async(i,init)=>{const t=performance.now();const response=await realFetch(i,{...init,signal:AbortSignal.timeout(30000)});const data=await response.clone().json();calls.push({seconds:(performance.now()-t)/1000,model:data.model,usage:data.usage,status:response.status});return response;};
 const sources=new Map(input.sources.map(s=>[s.id,s]));const articles=new Map<string,Article>();const stories=new Map<string,Story>();let digest:string[]=[];
 const ranked=()=>[...stories.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const started=performance.now();
 const fetchResult=await new FetchArticlesUseCase({
  async getActiveRssSources(){return input.sources;},
  async upsertRawArticle(sourceId,article){const id=createHash('sha256').update(JSON.stringify([sourceId,article.externalId])).digest('hex').slice(0,24);if(!articles.has(id))articles.set(id,{...article,id,sourceId,embedding:[]});},
  async logScrapeResult(){},
 },{async fetch(url){const source=input.sources.find(s=>s.url===url)!;const feed=input.feeds.find(f=>f.source_id===source.id)!;if(!feed.success)throw new Error('Source failed');return feed.articles.map(a=>({externalId:a.external_id,url:a.url,title:a.title,rawContent:a.raw_content,publishedAt:a.published_at?new nativeDate(a.published_at):null}));}}).execute('local');
 const cluster=await new ClusterArticlesUseCase({
  async getUnclusteredArticles(limit){return [...articles.values()].filter(a=>!a.storyId).sort((a,b)=>(b.publishedAt?.getTime()??-Infinity)-(a.publishedAt?.getTime()??-Infinity)||b.id.localeCompare(a.id)).slice(0,limit).map(a=>({id:a.id,title:a.title,rawContent:a.rawContent,sourceCategory:sources.get(a.sourceId)!.category,existingEmbedding:a.embedding}));},
  async getRecentStoryCentroids(){return [];},
  async saveEmbedding(id,embedding){articles.get(id)!.embedding=embedding;},
  async attachArticlesToStory(id,ids){for(const i of ids){articles.get(i)!.storyId=id;stories.get(id)!.articles.push(articles.get(i)!);}},
  async createStory(category,ids){const id='local-'+[...ids].sort()[0];stories.set(id,{id,category,score:0,articles:ids.map(i=>articles.get(i)!)});for(const i of ids)articles.get(i)!.storyId=id;return id;},
 },new OpenAIEmbedder()).execute();
 const rank=await new RankStoriesUseCase({
  async getStoriesForRanking(ids){return ids.map(id=>{const s=stories.get(id)!;const trusts=new Map(s.articles.map(a=>[a.sourceId,sources.get(a.sourceId)!.trustScore]));const dates=s.articles.flatMap(a=>a.publishedAt?[a.publishedAt.getTime()]:[]);return {storyId:id,distinctSourceCount:trusts.size,avgTrustScore:[...trusts.values()].reduce((a,b)=>a+b,0)/trusts.size,mostRecentPublishedAt:dates.length?new nativeDate(Math.max(...dates)):null};});},
  async updateImportanceScore(id,score){stories.get(id)!.score=score;},
 }).execute(cluster.touchedStoryIds);
 const summarize=await new SummarizeStoryUseCase({
  async getStoriesNeedingSummary(limit){return ranked().filter(s=>!s.summary).slice(0,limit).map(s=>({storyId:s.id,candidateCategory:s.category,articles:s.articles.map(a=>({title:a.title,content:a.rawContent,sourceUrl:a.url}))}));},
  async saveSummary(id,output){stories.get(id)!.summary=output;stories.get(id)!.category=output.category;},
 },new OpenAIFactExtractor(),new OpenAISummarizer(),'openai','gpt-4o-mini').execute();
 const build=await new BuildDigestUseCase({
  async getUnusedSummarizedStories(hours,limit){const counts=new Map<string,number>();return ranked().filter(s=>{if(!s.summary||!s.articles.some(a=>a.publishedAt && a.publishedAt.getTime()>=new nativeDate(input.as_of).getTime()-hours*3600000))return false;const count=counts.get(s.category)??0;counts.set(s.category,count+1);return count<limit;}).map(s=>({storyId:s.id,category:s.category,importanceScore:s.score}));},
  async upsertDigestForDate(_date,ids){digest=ids;return {digestId:'local',itemCount:ids.length};},
 }).execute(new nativeDate(input.as_of));
 const translate=await new TranslateStoriesUseCase({
  async getUntranslatedSummaries(ids){return ids.filter(id=>!stories.get(id)!.english).map(id=>({summaryId:id,storyId:id,...stories.get(id)!.summary!}));},
  async getPublishedUntranslatedSummaries(){return [];},
  async saveTranslation(id,output){stories.get(id)!.english=output;},
 },new OpenAITranslator()).execute(digest);
 const report={seconds:(performance.now()-started)/1000,fetch:fetchResult,cluster,rank,summarize,build,translate,calls,stories:[...stories.values()]};
 writeFileSync(join(dir,'typescript.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({seconds:report.seconds,fetch:fetchResult,cluster,rank,summarize,build,translate}));
 if(fetchResult.failed||cluster.failed||summarize.failed||translate.failed||digest.length!==10)process.exitCode=1;
}
void main();
