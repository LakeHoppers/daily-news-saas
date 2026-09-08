import 'dotenv/config';
import { prisma } from '../src/shared/prisma';
import { averageVectors, cosineSimilarity } from '../src/modules/dedup/domain/similarity';
async function main() {
 const ids = process.argv.slice(2);
 if(ids.length !== 2) throw new Error('Usage: tsx scripts/inspect-dedup.ts <story-id> <story-id>');
 const stories = await prisma.story.findMany({where:{id:{in:ids}},include:{rawArticles:true}});
 for(const s of stories) console.log(JSON.stringify({id:s.id,created:s.createdAt,articles:s.rawArticles.map(a=>({id:a.id,title:a.title,fetched:a.fetchedAt,published:a.publishedAt,length:a.rawContent.length}))}));
 if(stories.length===2){const [a,b]=stories;console.log('centroid',cosineSimilarity(averageVectors(a.rawArticles.map(x=>x.embedding)),averageVectors(b.rawArticles.map(x=>x.embedding))));for(const x of a.rawArticles) for(const y of b.rawArticles) console.log(JSON.stringify({a:x.title,b:y.title,similarity:cosineSimilarity(x.embedding,y.embedding)}));}
}
main().catch(()=>{console.error('Inspection failed');process.exitCode=1}).finally(()=>prisma.$disconnect());
