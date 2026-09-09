/** Opt-in: execute actual TS mutation handlers on an isolated copy of real data. */
import { readFile, writeFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ data: {} as Record<string, any[]>, user: {} as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
vi.mock('@/shared/api-guards', () => ({ requireAdmin: async () => state.user, getOrCreateCurrentUser: async () => state.user, ForbiddenError: class extends Error {}, UnauthorizedError: class extends Error {} }));
vi.mock('@/shared/prisma', () => ({ prisma: {
  subscription: {findUnique: async () => state.data.subscriptions.find(s => s.userId === state.user.id)},
  userPreference: {update: async ({data}: {data: object}) => Object.assign(state.data.preferences.find(p => p.userId === state.user.id), data)},
  source: {
    create: async ({data}: {data: object}) => ({id:'new-source',category:null,trustScore:50,active:true,scrapeConfig:null,...Object.fromEntries(Object.entries(data).filter(([,value]) => value !== undefined))}),
    update: async ({where,data}: {where:{id:string};data:object}) => Object.assign(state.data.sources.find(s => s.id === where.id),data),
  },
  summary: {
    findUnique: async ({where}: {where:{id:string}}) => state.data.summaries.find(s => s.id === where.id),
    aggregate: async ({where}: {where:{storyId:string}}) => ({_max:{version:Math.max(...state.data.summaries.filter(s => s.storyId === where.storyId).map(s => s.version))}}),
    create: async ({data}: {data:object}) => ({id:'new-summary',headlineEn:null,bodyEn:null,whyItMattersEn:null,...data}),
  },
  adminAuditLog: {create: async ({data}: {data:object}) => data},
} }));
import { PATCH as preferences } from '@/app/api/me/preferences/route';
import { PATCH as sourceUpdate } from '@/app/api/admin/sources/[id]/route';
import { POST as sourceCreate } from '@/app/api/admin/sources/route';
import { PATCH as summaryUpdate } from '@/app/api/admin/summaries/[id]/route';

it.skipIf(!process.env.PHASE3_REFERENCE)('exports actual route behavior for the private Python comparison', async () => {
  const path = process.env.PHASE3_REFERENCE!;
  const snapshot = JSON.parse(await readFile(path,'utf8'));
  const cases = [];
  for (const plan of ['FREE','PRO']) {
    state.data=structuredClone(snapshot.state); state.user=state.data.users[0];
    state.data.subscriptions=[{userId:state.user.id,plan}];
    const body={favoriteCategories:['ECONOMY','SPORTS'],digestHour:21,timezone:'Europe/Berlin',paused:true};
    const response=await preferences(new Request('http://localhost/api/me/preferences',{method:'PATCH',body:JSON.stringify(body)}));
    expect(response.status).toBe(200);
    cases.push({kind:'preferences',plan,body,result:await response.json()});
  }
  state.data=structuredClone(snapshot.state); state.user=state.data.users[0];
  const sourceBody={name:'Python sandbox comparison',url:'https://example.com/phase3-rss',type:'RSS',category:'TECHNOLOGY',trustScore:85};
  const created=await sourceCreate(new Request('http://localhost/api/admin/sources',{method:'POST',body:JSON.stringify(sourceBody)}));
  cases.push({kind:'sourceCreate',body:sourceBody,result:await created.json()});
  const source=state.data.sources[0]; const patch={active:false,trustScore:83};
  const updated=await sourceUpdate(new Request('http://localhost',{method:'PATCH',body:JSON.stringify(patch)}),{params:Promise.resolve({id:source.id})});
  cases.push({kind:'sourceUpdate',id:source.id,body:patch,result:await updated.json()});
  const summary=state.data.summaries[0]; const summaryBody={headline:'Python migration comparison',tags:['test',123]};
  const edited=await summaryUpdate(new Request('http://localhost',{method:'PATCH',body:JSON.stringify(summaryBody)}),{params:Promise.resolve({id:summary.id})});
  cases.push({kind:'summary',id:summary.id,body:summaryBody,result:await edited.json()});
  await writeFile(path+'.mutations.json',JSON.stringify(cases),{flag:'wx',mode:0o600});
  expect(cases).toHaveLength(5);
});
