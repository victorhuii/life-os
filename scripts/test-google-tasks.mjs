import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = path.join(root, '.sites-runtime/google-tasks-tests');
mkdirSync(temp, { recursive: true });
const imports = { 'cloudflare:workers': './env.mjs', '@/app/chatgpt-auth': './auth.mjs' };
for (const name of ['life', 'store', 'google-oauth', 'google-tasks', 'google-direct', 'google-calendar-write', 'calendar-week', 'google-mail-page', 'mail-range', 'mail-learning', 'mail-ensemble', 'mail-message', 'cal-hacks-mail']) {
  imports[`./${name}`] = `./${name}.mjs`;
  imports[`@/lib/${name}`] = `./${name}.mjs`;
}
const files = Object.fromEntries(['life', 'store', 'google-oauth', 'google-tasks', 'google-direct', 'google-calendar-write', 'calendar-week', 'google-mail-page', 'mail-range', 'mail-learning', 'mail-ensemble', 'mail-message', 'cal-hacks-mail'].map(name => [name, `lib/${name}.ts`]));
Object.assign(files, { taskState:'app/api/state/route.ts', classifier:'app/api/mail-classifier/route.ts', route: 'app/api/google/route.ts', connect: 'app/api/google/connect/route.ts', callback: 'app/api/google/callback/route.ts' });
for (const [name, file] of Object.entries(files)) {
  const output = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from "([^"]+)"/g, (match, specifier) => imports[specifier] ? `from "${imports[specifier]}"` : match);
  writeFileSync(path.join(temp, `${name}.mjs`), output);
}
writeFileSync(path.join(temp, 'env.mjs'), `
import { DatabaseSync } from 'node:sqlite';
export const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE life_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
function statement(sql, values = []) { return { bind: (...args) => statement(sql, args), all: async () => ({results: sqlite.prepare(sql).all(...values)}), first: async () => sqlite.prepare(sql).get(...values) || null, run: async () => sqlite.prepare(sql).run(...values) }; }
export const env = { GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret', GOOGLE_REDIRECT_URI: 'https://life.test/api/google/callback', GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'), DB: { prepare: sql => statement(sql), batch: async statements => { sqlite.exec('BEGIN'); try { for (const item of statements) await item.run(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } } };
`);
writeFileSync(path.join(temp, 'auth.mjs'), `export let user = { userId: 'owner', email: 'owner@test.invalid' }; export const setUser = value => { user = value; }; export const getChatGPTUser = async () => user; export const chatGPTSignInPath = () => '/signin-with-chatgpt?return_to=%2F';`);
const mod = name => import(pathToFileURL(path.join(temp, `${name}.mjs`)).href);

const oauth=await mod('google-oauth'),tasks=await mod('google-tasks'),life=await mod('life'),{state}=await mod('store'),{sqlite}=await mod('env'),auth=await mod('auth'),api=await mod('taskState');
const account='huiv@berkeley.edu';
const grant={resource:'tasks',account,owner:'owner',accessToken:'fixture',refreshToken:'fixture-refresh',scopes:[oauth.tasksScope],expiresAt:Date.now()+3600000};
const lists=[{id:'default-list',title:'My Tasks'},{id:'other-list',title:'Classwork'}];
const remote=new Map([['default-list',[{id:'google-a',title:'A task from Google Calendar',due:'2026-10-24T00:00:00.000Z',status:'needsAction',etag:'a1'},{id:'google-done',title:'Already done',status:'completed',hidden:true,etag:'b1'}]],['other-list',[{id:'google-class',title:'Coursework task',due:'2026-10-25T00:00:00.000Z',status:'needsAction',etag:'c1'}]]]);
let calls=[],failList=false,loseCreate=false,creates=0,deleteCount=0,failPatch=false,pageCount=0;
const json=data=>Response.json(structuredClone(data));
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);calls.push({url:url.href,method:init.method||'GET',body:init.body});assert.equal(init.redirect,'manual');
 assert.equal(init.headers.Authorization,'Bearer fixture');
 if(url.hostname!=='tasks.googleapis.com')throw Error('Unexpected external request '+url);
 const method=init.method||'GET';
 if(url.pathname==='/tasks/v1/users/@me/lists'){
  if(method==='POST'){const list={id:'vector-list',...JSON.parse(init.body)};lists.push(list);remote.set(list.id,[]);return json(list);}
  if(failList)return new Response('',{status:503});return json({items:lists});
 }
 const match=url.pathname.match(/^\/tasks\/v1\/lists\/([^/]+)\/tasks(?:\/([^/]+))?$/);assert.ok(match,url.href);
 const list=decodeURIComponent(match[1]),id=match[2]?decodeURIComponent(match[2]):undefined,items=remote.get(list);assert.ok(items);
 if(method==='GET'){
  assert.equal(url.searchParams.get('showCompleted'),'true');assert.equal(url.searchParams.get('showHidden'),'true');assert.equal(url.searchParams.get('showDeleted'),'true');pageCount++;
  if(list==='default-list'&&!url.searchParams.get('pageToken'))return json({items:items.slice(0,1),nextPageToken:'page-2'});
  return json({items:list==='default-list'?items.slice(1):items});
 }
 if(method==='POST'){
  creates++;const task={id:'created-'+creates,...JSON.parse(init.body),etag:'v1'};items.push(task);
  if(loseCreate){loseCreate=false;throw Error('Lost response after Google accepted the insert');}return json(task);
 }
 const item=items.find(task=>task.id===id);if(!item)return new Response('',{status:404});
 if(method==='PATCH'){if(failPatch)return new Response('',{status:503});assert.equal(init.headers['If-Match'],item.etag);Object.assign(item,JSON.parse(init.body));item.etag+='x';return json(item);}
 if(method==='DELETE'){item.deleted=true;deleteCount++;return new Response(null,{status:204});}
 throw Error('Unexpected task method');
};
const post=(body,origin='https://life.test')=>api.POST(new Request('https://life.test/api/state',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)}));
const draft=(id,title)=>({id,title,done:false,due:'',createdAt:new Date().toISOString(),priority:'normal',category:'Personal',minutes:30});
// No connection still saves locally, with an outbox for eventual authorization.
assert.equal((await post({action:'task',value:draft('local','Local first task')})).status,200);assert.equal(calls.length,0);
assert.equal((await state()).tasks.find(t=>t.id==='local').due,life.dayKey());
assert.ok((await state()).tasks.find(t=>t.id==='local').googleSyncPending);
assert.throws(()=>oauth.googleTarget('tasks','victorhui94@gmail.com'));
assert.equal(oauth.googleScopesGranted('tasks',[oauth.calendarEventsScope]),false);
assert.equal(oauth.googleScopesGranted('tasks',[oauth.tasksScope]),true);
await oauth.saveGoogleGrant(grant);
let result=await tasks.syncGoogleTasks('owner',true);assert.ok(!result.error,JSON.stringify(result));assert.equal(creates,1);assert.ok(pageCount>=3,'All task pages and lists are read');
let snapshot=await state();assert.equal(snapshot.tasks.length,4);assert.equal(snapshot.tasks.find(t=>t.title==='Already done').done,true);
let original=snapshot.tasks.find(t=>t.id==='local');assert.equal(original.googleTask.listName,'V.E.C.T.O.R.');assert.equal(original.googleSyncPending,false);
assert.equal(remote.get('vector-list')[0].due,life.dayKey()+'T00:00:00.000Z');
// Rename/complete/reopen and due date edits flow out; unrelated Google notes are never overwritten.
await post({action:'task',value:{...original,title:'Renamed in Vector',done:true,due:'2026-11-02'}});
let target=remote.get('vector-list')[0];assert.equal(target.title,'Renamed in Vector');assert.equal(target.status,'completed');assert.equal(target.due,'2026-11-02T00:00:00.000Z');
await post({action:'task',value:{...(await state()).tasks.find(t=>t.id==='local'),done:false}});assert.equal(target.status,'needsAction');assert.equal(target.completed,null);
// Google changes flow in without creating duplicate local tasks or outgoing feedback writes.
target.title='Renamed in Google';target.due='2026-11-03T00:00:00.000Z';target.status='completed';const beforeCreates=creates;
await tasks.syncGoogleTasks('owner',true);original=(await state()).tasks.find(t=>t.id==='local');assert.equal(original.title,target.title);assert.equal(original.due,'2026-11-03');assert.equal(original.done,true);assert.equal(creates,beforeCreates);
// Local-only fields don't write Google and don't alter shopping lists.
const beforeCalls=calls.length;await post({action:'task',value:{...original,priority:'high'}});assert.equal(calls.length,beforeCalls);
await post({action:'shoppingItem',value:{...draft('shop','Buy milk'),group:'groceries'}});assert.equal(calls.length,beforeCalls);
// Task changes made through another app view/assistant also get detected.
const fromOtherView={...(await state()).tasks.find(t=>t.id==='local'),done:false};delete fromOtherView.googleTask;delete fromOtherView.googleSyncPending;
sqlite.prepare("UPDATE life_records SET payload=? WHERE id='task:local'").run(JSON.stringify(fromOtherView));await tasks.syncGoogleTasks('owner',true);assert.equal(target.status,'needsAction');
// Failed provider reads preserve every local task, and failed writes keep retryable pending changes.
const ids=(await state()).tasks.map(t=>t.id);failList=true;result=await tasks.syncGoogleTasks('owner',true);assert.ok(result.error);assert.deepEqual((await state()).tasks.map(t=>t.id),ids);failList=false;
failPatch=true;const update=await(await post({action:'task',value:{...(await state()).tasks.find(t=>t.id==='local'),title:'Offline rename'}})).json();assert.equal(update.ok,true);assert.ok(update.syncWarning);assert.equal((await state()).tasks.find(t=>t.id==='local').title,'Offline rename');assert.ok((await state()).tasks.find(t=>t.id==='local').googleSyncPending);
failPatch=false;await tasks.syncGoogleTasks('owner',true);assert.equal(target.title,'Offline rename');assert.equal((await state()).tasks.find(t=>t.id==='local').googleSyncPending,false);
// Ambiguous successful inserts reconcile via their stable reference, never a duplicate POST.
loseCreate=true;const uncertain=await(await post({action:'task',value:draft('uncertain','Recover an uncertain insert')})).json();assert.equal(uncertain.ok,true);assert.ok(uncertain.syncWarning);const createsAfterLoss=creates;
await tasks.syncGoogleTasks('owner',true);assert.equal(creates,createsAfterLoss);assert.equal((await state()).tasks.filter(t=>t.title==='Recover an uncertain insert').length,1);
// Remote deletions and removed lists flow inward; explicit local deletions flow outward.
remote.get('default-list')[0].deleted=true;await tasks.syncGoogleTasks('owner',true);assert.ok(!(await state()).tasks.some(t=>t.title==='A task from Google Calendar'));
const classTask=(await state()).tasks.find(t=>t.title==='Coursework task');lists.splice(lists.findIndex(l=>l.id==='other-list'),1);await tasks.syncGoogleTasks('owner',true);assert.ok(!(await state()).tasks.some(t=>t.id===classTask.id));
await post({action:'deleteTask',id:'uncertain'});assert.equal(deleteCount,1);assert.ok(!(await state()).tasks.some(t=>t.id==='uncertain'));
// Account/owner boundaries and origin/auth checks precede provider mutations.
await assert.rejects(()=>tasks.syncGoogleTasks('intruder',true),/different/);
const callCount=calls.length;assert.equal((await post({action:'task',value:draft('csrf','No')},'https://evil.test')).status,403);auth.setUser(null);assert.equal((await post({action:'task',value:draft('signedout','No')})).status,403);assert.equal(calls.length,callCount);auth.setUser({userId:'owner'});
await oauth.removeGoogleGrant({resource:'tasks',account},'owner');assert.equal((await state()).sources.tasks.status,'not_connected');assert.ok((await state()).tasks.length>0);
assert.equal((await tasks.syncGoogleTasks('owner',true)).connected,false);
console.log('PASS: paged Google Tasks import, local creation/default Pacific date, two-way title/date/completion/reopen, linked identity, stable retry after lost insert, retryable failures, deletion/list removal, local-only fields/shopping isolation, account/owner/auth/CSRF boundaries and disconnect preservation. No live Google writes.');

// Tasks OAuth requests a separate scope and verifies the exact Berkeley identity.
const network=globalThis.fetch;let identity=account;
globalThis.fetch=async(input,init={})=>{const url=new URL(input);if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'oauth-fixture',refresh_token:'refresh-fixture',expires_in:3600,scope:oauth.tasksScope});if(url.pathname==='/oauth2/v2/userinfo')return Response.json({email:identity,verified_email:true});return network(input,init);};
const begin=()=>oauth.beginGoogleConnection({resource:'tasks',account},'owner',new Request('https://life.test/api/google/connect'));
const finish=(start)=>oauth.finishGoogleConnection(new Request(`https://life.test/api/google/callback?state=${new URL(start.url).searchParams.get('state')}&code=fixture-code`),'owner',start.browser);
const started=await begin();assert.ok(new URL(started.url).searchParams.get('scope').includes(oauth.tasksScope));assert.ok(!new URL(started.url).searchParams.get('scope').includes(oauth.calendarEventsScope));assert.equal((await finish(started)).resource,'tasks');
identity='victorhui94@gmail.com';await assert.rejects(()=>begin().then(finish),/Choose huiv@berkeley.edu/);
console.log('PASS: separate Tasks OAuth scope, PKCE flow and exact account verification.');
