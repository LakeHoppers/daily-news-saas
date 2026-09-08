import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OpenAIEmbedder } from "../src/modules/ai/providers/openai-embedder";
import { OpenAIFactExtractor } from "../src/modules/ai/providers/openai-fact-extractor";
import { OpenAISummarizer } from "../src/modules/ai/providers/openai-summarizer";
import { OpenAITranslator } from "../src/modules/ai/providers/openai-translator";
import type { Category } from "../src/generated/prisma/enums";
interface Story { id: string; category: Category; articles: {title:string;raw_content:string;url:string}[] }
async function main() {
 const dir=process.argv[2]; if(!dir)throw new Error("Sample artifact directory required");
 const input: Story[]=JSON.parse(readFileSync(join(dir,"input.json"),"utf8"));
 const realFetch=globalThis.fetch;
 const calls: unknown[]=[];
 globalThis.fetch=async(input,init)=>{const started=performance.now();const r=await realFetch(input,{...init,signal:AbortSignal.timeout(30000)});const data=await r.clone().json();calls.push({seconds:(performance.now()-started)/1000,usage:data.usage,model:data.model,status:r.status});return r;};
 const start=performance.now();
 const stories=await Promise.all(input.map(async s=>{
   const a=s.articles[0];const embedding=await new OpenAIEmbedder().embed((a.title+"\n"+a.raw_content).slice(0,4000));
   const {facts}=await new OpenAIFactExtractor().extractFacts({articles:s.articles.map(a=>({title:a.title,content:a.raw_content.slice(0,2000),sourceUrl:a.url}))});
   const summary=await new OpenAISummarizer().summarize({sourceFacts:facts,sourceUrls:s.articles.map(a=>a.url),candidateCategory:s.category});
   const english=await new OpenAITranslator().translate(summary);
   return {id:s.id,facts,summary,english,embedding};
 }));
 const report={seconds:(performance.now()-start)/1000,calls,stories};
 writeFileSync(join(dir,"typescript.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({seconds:report.seconds,stories:stories.length,calls:calls.length}));
}
void main();
