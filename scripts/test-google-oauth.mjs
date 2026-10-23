import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = path.join(root, '.sites-runtime/google-oauth-tests');
mkdirSync(temp, { recursive: true });
const imports = { 'cloudflare:workers': './env.mjs', '@/app/chatgpt-auth': './auth.mjs' };
for (const name of ['life', 'store', 'google-oauth', 'google-tasks', 'google-direct', 'google-calendar-write', 'calendar-week', 'google-mail-page', 'mail-range', 'mail-learning', 'mail-ensemble', 'mail-message', 'cal-hacks-mail']) {
  imports[`./${name}`] = `./${name}.mjs`;
  imports[`@/lib/${name}`] = `./${name}.mjs`;
}
const files = Object.fromEntries(['life', 'store', 'google-oauth', 'google-tasks', 'google-direct', 'google-calendar-write', 'calendar-week', 'google-mail-page', 'mail-range', 'mail-learning', 'mail-ensemble', 'mail-message', 'cal-hacks-mail'].map(name => [name, `lib/${name}.ts`]));
Object.assign(files, { classifier:'app/api/mail-classifier/route.ts', route: 'app/api/google/route.ts', connect: 'app/api/google/connect/route.ts', callback: 'app/api/google/callback/route.ts' });
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
const oauth = await mod('google-oauth'), direct = await mod('google-direct');
const { env, sqlite } = await mod('env');
const { state } = await mod('store');
const auth = await mod('auth'), route = await mod('route'), connect = await mod('connect'), callback = await mod('callback');
const main = 'victorhui94@gmail.com', berk = 'huiv@berkeley.edu', hacks = 'vhui@hackberkeley.org';
const gmailScope = oauth.gmailModifyScope;
const calendarScopes = [oauth.calendarEventsScope, oauth.calendarListScope];
let failCalendar = '', emptyCalendars = false, failThreads = false;
let selectedEmail = berk, tokenScope = gmailScope, deny = false, gmailMismatch = false, calls = [];
globalThis.fetch = async (input, init = {}) => {
  assert.equal(init.redirect, 'manual', 'Google requests must use the Workers-supported manual redirect mode');
  const url = new URL(input); calls.push(url.href);
  const json = (data, status = 200) => Response.json(data, { status });
  if (url.hostname === 'oauth2.googleapis.com') {
    assert.equal(init.method, 'POST');
    const form = init.body;
    if (form.get('grant_type') === 'authorization_code') assert.ok(form.get('code_verifier'));
    return json({ access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', expires_in: 3600, scope: tokenScope });
  }
  if (url.pathname === '/oauth2/v2/userinfo') return json({ email: selectedEmail, verified_email: true });
  if (deny) return json({ error: { message: 'raw upstream secrets should never be shown' } }, 403);
  if (url.pathname.endsWith('/profile')) return json({ emailAddress: gmailMismatch ? main : selectedEmail });
  if(url.pathname.endsWith('/labels'))return json({labels:[{id:'label-spons',name:'sponsorship',type:'user'}]});
  if(url.pathname.includes('/threads/')&&failThreads)return json({},503);
  if(url.pathname.includes('/threads/'))return json({id:url.pathname.split('/').at(-1),messages:[{id:'sent1',labelIds:['SENT']},{id:'in1',labelIds:['label-spons'],payload:{headers:[{name:'To',value:'sponsorship@hackberkeley.org'}]}}]});
  if (url.pathname.endsWith('/messages')) return json({ messages: [{ id: 'abc123' }] });
  if (url.pathname.includes('/messages/')) return json({ id: 'abc123', threadId: 'thread', internalDate: String(Date.now()), labelIds: ['INBOX','UNREAD'], snippet: 'Hello &amp; welcome', payload: { headers: [{ name: 'From', value: 'Person <person@example.test>' }, { name: 'Subject', value: `Mail for ${selectedEmail}` }] } });
  if (url.pathname.endsWith('/calendarList')) {
    assert.equal(url.searchParams.get('minAccessRole'), 'reader');
    if (url.searchParams.get('pageToken') === 'calendar-page-2') return json({ items: [{ id: 'shared@group.calendar.google.com', summary: 'Shared schedule', accessRole: 'reader', selected: true }] });
    return json({ items: [
      { id: berk, summary: 'Berkeley primary', primary: true, accessRole: 'owner', backgroundColor: '#123abc' },
      { id: 'classes@group.calendar.google.com', summary: 'Classes', selected: true, accessRole: 'owner', backgroundColor: '#aabbcc' },
      { id: 'meetings@group.calendar.google.com', summary: 'Meetings', selected: true, accessRole: 'writer' },
      { id: 'unchecked', summary: 'Unchecked', selected: false, accessRole: 'reader' },
      { id: 'hidden', hidden: true, selected: true, accessRole: 'owner' },
      { id: 'deleted', deleted: true, selected: true, accessRole: 'owner' },
      { id: 'freebusy', selected: true, accessRole: 'freeBusyReader' },
    ], nextPageToken: 'calendar-page-2' });
  }
  if (url.pathname.endsWith('/events')) {
    const id = decodeURIComponent(url.pathname.split('/')[4]);
    assert.ok(!['unchecked', 'hidden', 'deleted', 'freebusy'].includes(id));
    if (id === failCalendar) return json({ error: { message: 'private upstream details' } }, 403);
    if (emptyCalendars) return json({ items: [] });
    if (url.searchParams.get('pageToken') === 'events-page-2') return json({ timeZone: 'America/Los_Angeles', items: [{ id: 'meeting-page-2', summary: 'Another meeting', start: { dateTime: '2026-11-02T10:00:00-08:00' }, end: { dateTime: '2026-11-02T11:00:00-08:00' } }] });
    return json({ timeZone: id.startsWith('shared') ? 'America/New_York' : 'America/Los_Angeles', items: [{ id: 'all-day', summary: 'DST day', start: { date: '2026-11-01' }, end: { date: '2026-11-02' } }, { id: 'cancelled', status: 'cancelled' }], ...(id.startsWith('meetings') ? { nextPageToken: 'events-page-2' } : {}) });
  }
  throw new Error(`Unexpected provider endpoint ${url.origin}${url.pathname}`);
};
const target = oauth.googleTarget('gmail', berk);
const startRequest = () => new Request('https://life.test/api/google/connect', { method: 'POST', headers: { Origin: 'https://life.test' }, body: new URLSearchParams(target) });
const begin = async (targetOverride = target) => oauth.beginGoogleConnection(targetOverride, 'owner', startRequest());
const finish = (pending, browser = pending.browser, owner = 'owner', extra = '') => oauth.finishGoogleConnection(new Request(`https://life.test/api/google/callback?state=${new URL(pending.url).searchParams.get('state')}&code=fixture-code${extra}`), owner, browser);
assert.equal(oauth.googleSetup().configured, true);
assert.throws(() => oauth.googleTarget('calendar', main));
await assert.rejects(() => oauth.beginGoogleConnection(target, 'owner', new Request('https://attacker.test/api/google/connect')));
const initial = await begin();
const authUrl = new URL(initial.url);
assert.equal(authUrl.searchParams.get('login_hint'), berk);
assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
assert.equal(authUrl.searchParams.get('access_type'), 'offline');
assert.ok(authUrl.searchParams.get('scope').includes(gmailScope));
await assert.rejects(() => finish(initial, 'wrong-browser'));
await assert.rejects(() => finish(initial, initial.browser, 'wrong-owner'));
const grant = await finish(initial);
await assert.rejects(() => finish(initial), /expired|already used/);
await oauth.saveGoogleGrant(grant);
const savedPrivate = sqlite.prepare("SELECT payload FROM life_records WHERE kind='google_private'").get().payload;
assert.ok(!savedPrivate.includes('fixture-access-token') && !savedPrivate.includes('fixture-refresh-token'));
assert.equal((await oauth.readGoogleGrant(target, 'owner')).account, berk);
await assert.rejects(() => oauth.readGoogleGrant(target, 'someone-else'));
assert.ok(!JSON.stringify(await state()).includes('fixture-access-token'));
selectedEmail = main;
const wrong = await begin();
await assert.rejects(() => finish(wrong), /Choose huiv@berkeley.edu/);
assert.equal((await oauth.readGoogleGrant(target, 'owner')).refreshToken, 'fixture-refresh-token');
selectedEmail = berk;
tokenScope = 'https://www.googleapis.com/auth/userinfo.email';
const missingScope = await begin();
await assert.rejects(() => finish(missingScope), /permission/);
tokenScope = gmailScope;
const cancelled = await begin();
await assert.rejects(() => finish(cancelled, cancelled.browser, 'owner', '&error=access_denied'), /cancelled/);
const expiredNow = Date.now;
Date.now = () => expiredNow() - 11 * 60000;
const expired = await begin(); Date.now = expiredNow;
await assert.rejects(() => finish(expired), /expired/);
// Read and replace just the verified account, preserving others and coursework.
const put = (id, kind, value) => sqlite.prepare('INSERT OR REPLACE INTO life_records VALUES (?,?,?,?)').run(id, kind, JSON.stringify(value), new Date().toISOString());
const oldMail = account => ({ id: 'abc123', account, sender: 'Fixture', subject: account, summary: '', receivedAt: new Date().toISOString(), priority: 'normal', url: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}#inbox/thread` });
put('mail:main', 'mail', oldMail(main)); put('mail:hacks', 'mail', oldMail(hacks));
put('canvas:snapshot', 'canvas_snapshot', { connected: true, status: 'synced', items: [{ id: 'course' }] });
const snapshot = await direct.readGoogleSnapshot(grant);
assert.equal(snapshot.emails[0].summary, 'Hello & welcome');
await direct.storeGoogleSnapshot(grant, snapshot);
assert.equal((await state()).emails.length, 3);
assert.equal((await state()).coursework.items.length, 1);
const connectionStatus = await (await route.GET()).json();
const connectedBerk = connectionStatus.connections.find(item => item.account === berk && item.resource === 'gmail');
assert.equal(connectedBerk.connected, true);
assert.equal(connectedBerk.count, 1);
assert.equal(connectedBerk.syncStatus, 'synced');
assert.ok(connectedBerk.lastSyncedAt);

gmailMismatch = true; calls = [];
await assert.rejects(() => direct.readGoogleSnapshot(grant), /identity/);
assert.ok(!calls.some(url => url.includes('/messages')));
gmailMismatch = false;
const oldTimestamp = (await state()).sources[`gmail:${berk}`].updatedAt;
deny = true;
const failure = await direct.refreshGoogle(target, 'owner', true);
assert.ok(failure.error && !failure.error.includes('upstream'));
assert.equal((await state()).emails.length, 3);
assert.equal((await state()).sources[`gmail:${berk}`].updatedAt, oldTimestamp);
deny = false;
const calendarTarget = oauth.googleTarget('calendar', berk);
const calendarPending = await begin(calendarTarget);
const requestedScopes = new URL(calendarPending.url).searchParams.get('scope').split(' ');
assert.ok(calendarScopes.every(scope => requestedScopes.includes(scope)));
tokenScope = calendarScopes.join(' ');
const calendarGrant = await finish(calendarPending);
tokenScope = gmailScope;
await oauth.saveGoogleGrant(calendarGrant);
const events = await direct.readGoogleSnapshot(calendarGrant);
assert.equal(events.events.length, 5, 'Combine selected calendars and paginate their events');
assert.equal(events.calendars.filter(calendar => calendar.enabled).length, 4);
assert.equal(events.calendars.find(calendar => calendar.id === 'unchecked').enabled, false);
assert.equal(events.calendars.some(calendar => ['hidden', 'deleted', 'freebusy'].includes(calendar.id)), false);
assert.equal(new Set(events.events.map(event => event.id)).size, 5, 'Identical provider IDs in different calendars must remain distinct');
const primaryEvent = events.events.find(event => event.calendarId === berk);
assert.equal(primaryEvent.start, '2026-11-01T07:00:00.000Z');
assert.equal(primaryEvent.end, '2026-11-02T08:00:00.000Z');
assert.equal(primaryEvent.calendarName, 'Berkeley primary');
assert.equal(primaryEvent.calendarColor, '#123abc');
assert.equal(events.events.find(event => event.calendarId.startsWith('shared')).start, '2026-11-01T04:00:00.000Z');
await direct.storeGoogleSnapshot(calendarGrant, events);
assert.ok((await state()).events.every(event => event.account === berk));
assert.equal((await state()).sources.calendar.calendars.length, 5);
const beforeCalendarFailure = JSON.stringify((await state()).events);
const calendarTimestamp = (await state()).sources.calendar.updatedAt;
failCalendar = 'classes@group.calendar.google.com';
const failedCalendar = await direct.refreshGoogle(calendarTarget, 'owner', true);
assert.ok(failedCalendar.error.includes('Classes'));
assert.equal(JSON.stringify((await state()).events), beforeCalendarFailure, 'A failed secondary calendar must preserve the whole saved agenda');
assert.equal((await state()).sources.calendar.updatedAt, calendarTimestamp);
failCalendar = '';
calls = [];
await assert.rejects(() => direct.readGoogleSnapshot({ ...calendarGrant, scopes: [calendarScopes[0]] }), error => error.requiresReconnect && /Reconnect Berkeley/.test(error.message));
assert.equal(calls.length, 0, 'An old grant must prompt for discovery consent before reading calendars');
await oauth.saveGoogleGrant({ ...calendarGrant, scopes: [calendarScopes[0]] });
assert.equal((await (await route.GET()).json()).connections.find(item => item.resource === 'calendar').requiresReconnect, true);
await oauth.saveGoogleGrant(calendarGrant);
emptyCalendars = true;
await direct.storeGoogleSnapshot(calendarGrant, await direct.readGoogleSnapshot(calendarGrant));
assert.equal((await state()).events.length, 0);
assert.equal((await state()).emails.length, 3, 'Empty calendars must not change inbox snapshots');
emptyCalendars = false;
// Callback succeeds, imports, clears browser cookie, and doesn't expose secrets/code.
const pendingResponse = await connect.POST(startRequest());
assert.equal(pendingResponse.status, 303);
assert.ok(pendingResponse.headers.get('set-cookie').includes('HttpOnly'));
const pendingLocation = new URL(pendingResponse.headers.get('location'));
const cookie = pendingResponse.headers.get('set-cookie').split(';')[0];
const callbackResponse = await callback.GET(new Request(`https://life.test/api/google/callback?state=${pendingLocation.searchParams.get('state')}&code=fixture-code`, { headers: { Cookie: cookie } }));
assert.equal(new URL(callbackResponse.headers.get('location')).searchParams.get('google_connection'), 'connected');
assert.ok(callbackResponse.headers.get('set-cookie').includes('Max-Age=0'));
assert.equal((await (await route.GET()).json()).lastResult.ok, true);
const failedPending = await begin();
const failedCallback = await callback.GET(new Request(`https://life.test/api/google/callback?state=${new URL(failedPending.url).searchParams.get('state')}&error=access_denied`, { headers: { Cookie: `${oauth.oauthCookie}=${failedPending.browser}` } }));
assert.equal(failedCallback.status, 303);
assert.equal((await (await route.GET()).json()).lastResult.ok, false);
assert.match((await (await route.GET()).json()).lastResult.message, /cancelled/);
assert.equal((await (await route.GET()).json()).connections.find(item => item.account === berk && item.resource === 'gmail').connected, true, 'Failed sign-in must retain an existing connection');
const realFetch = globalThis.fetch;
globalThis.fetch = async (_url, init) => { assert.equal(init.redirect, 'manual'); return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } }); };
await assert.rejects(() => oauth.googleJson('https://oauth2.googleapis.com/token'), /unexpected redirect/);
globalThis.fetch = realFetch;

assert.ok(!JSON.stringify(await (await route.GET()).json()).includes('fixture-refresh-token'));
assert.equal((await connect.POST(new Request('https://life.test/api/google/connect', { method: 'POST', headers: { Origin: 'https://attacker.test' } }))).status, 403);
auth.setUser(null);
assert.equal((await route.GET()).status, 401);
assert.equal((await route.POST(new Request('https://life.test/api/google', { method: 'POST', headers: { Origin: 'https://life.test' }, body: '{}' }))).status, 401);
auth.setUser({ userId: 'owner' });
// Full selected-message reads use existing consent, check identity first, and never write Gmail labels.
const messageFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);
 if(url.searchParams.get('format')==='full'){
   calls.push(url.href);
   return Response.json({id:'abc123',payload:{mimeType:'multipart/alternative',headers:[{name:'From',value:'Fixture <fixture@example.test>'},{name:'To',value:berk}],parts:[{mimeType:'text/plain',body:{data:Buffer.from('Full message body\nFinal line well beyond the saved preview.').toString('base64url')}}]}});
 }
 return messageFetch(input,init);
};
await oauth.saveGoogleGrant({...grant,scopes:['https://www.googleapis.com/auth/gmail.readonly']});
selectedEmail=berk;calls=[];
const full=await direct.readGoogleMail(berk,'abc123','owner');
assert.match(full.text,/Final line well beyond/);
assert.equal(full.to,berk);
assert.ok(calls.some(url=>url.endsWith('/messages/abc123?format=full')));
assert.ok(!calls.some(url=>/modify|trash/.test(url)));
gmailMismatch=true;calls=[];
await assert.rejects(()=>direct.readGoogleMail(berk,'abc123','owner'),/identity/);
assert.ok(!calls.some(url=>url.includes('/messages')));
gmailMismatch=false;
await assert.rejects(()=>direct.readGoogleMail(berk,'abc123','someone-else'),/different/);
await assert.rejects(()=>direct.readGoogleMail(berk,'unknown','owner'),/verified/);
const fullRequest=origin=>new Request('https://life.test/api/google',{method:'POST',headers:{Origin:origin},body:JSON.stringify({action:'message',resource:'gmail',account:berk,id:'abc123'})});
assert.equal((await route.POST(fullRequest('https://attacker.test'))).status,403);
assert.equal((await route.POST(fullRequest('https://life.test'))).status,200);
globalThis.fetch=messageFetch;
await oauth.saveGoogleGrant(grant);
// Existing read-only grants still sync, but no provider write is attempted until upgraded.
assert.equal(oauth.googleScopesGranted('gmail',['https://www.googleapis.com/auth/gmail.readonly']),true);
await oauth.saveGoogleGrant({...grant,scopes:['https://www.googleapis.com/auth/gmail.readonly']}); calls=[];
await assert.rejects(()=>direct.trashGoogleMail(berk,'abc123','owner'),error=>error.requiresReconnect);
assert.equal(calls.length,0);
await oauth.saveGoogleGrant(grant);
gmailMismatch=true;calls=[];
await assert.rejects(()=>direct.trashGoogleMail(berk,'abc123','owner'),/identity/);
assert.ok(!calls.some(url=>url.includes('/messages')),'Verify mailbox identity before reading or changing messages');
gmailMismatch=false;
await assert.rejects(()=>direct.trashGoogleMail(berk,'abc123','someone-else'),/different/);
const trashRequest=origin=>new Request('https://life.test/api/google',{method:'POST',headers:{Origin:origin},body:JSON.stringify({action:'trash',resource:'gmail',account:berk,id:'abc123'})});
assert.equal((await route.POST(trashRequest('https://attacker.test'))).status,403);
const beforeTrash=(await state()).emails.length;
deny=true;
assert.equal((await route.POST(trashRequest('https://life.test'))).status,502);
assert.equal((await state()).emails.length,beforeTrash,'A failed provider write must not hide the message');
deny=false;calls=[];
assert.equal((await route.POST(trashRequest('https://life.test'))).status,200);
assert.equal(calls.filter(url=>url.endsWith('/messages/abc123/trash')).length,1);
assert.equal((await state()).emails.filter(mail=>mail.account===berk).length,0);
assert.equal((await state()).emails.filter(mail=>mail.account!==berk).length,2);
// A snapshot started before Trash cannot resurrect the message.
await direct.storeGoogleSnapshot(grant,snapshot);
assert.equal((await state()).emails.filter(mail=>mail.account===berk).length,0);
await direct.storeGoogleSnapshot(grant,{...snapshot,readStartedAt:new Date(Date.now()+1000).toISOString()});
assert.equal((await state()).emails.filter(mail=>mail.account===berk).length,1,'A later provider read can show a message restored in Gmail');
await oauth.removeGoogleGrant(target, 'owner');
assert.equal(await oauth.readGoogleGrant(target, 'owner'), null);
assert.equal((await state()).emails.length, 3);
const secret = env.GOOGLE_CLIENT_SECRET; delete env.GOOGLE_CLIENT_SECRET;
assert.equal(oauth.googleSetup().configured, false);
assert.ok(oauth.googleSetup().missing.includes('GOOGLE_CLIENT_SECRET'));
await assert.rejects(() => begin(), /setup/);
env.GOOGLE_CLIENT_SECRET = secret;

// Cal Hacks reads verified labels and complete thread metadata, scoped to the authenticated account.
const hacksFilters=await mod('cal-hacks-mail');
selectedEmail=hacks;calls=[];
const hacksSnapshot=await direct.readGoogleSnapshot({...grant,account:hacks});
const hacksMail=hacksSnapshot.emails[0];
assert.equal(hacksMail.threadId,'thread');
assert.deepEqual(hacksMail.gmailLabels,['sponsorship']);
assert.equal(hacksMail.gmailThreadParticipated,true);
assert.equal(hacksMail.gmailSponsorship,true);
assert.equal(hacksSnapshot.mailProgress.metadataVersion,1);
assert.ok(calls.findIndex(url=>url.endsWith('/profile'))<calls.findIndex(url=>url.endsWith('/labels')));
failThreads=true;await assert.rejects(()=>direct.readGoogleSnapshot({...grant,account:hacks}));failThreads=false;
gmailMismatch=true;calls=[];await assert.rejects(()=>direct.readGoogleSnapshot({...grant,account:hacks}));assert.ok(!calls.some(url=>/\/(labels|messages|threads)/.test(url)));gmailMismatch=false;
const labels=[{id:'s',name:'sponsorship',type:'user'}];
const flags=messages=>hacksFilters.threadMailFlags(messages,labels);
assert.equal(flags([{labelIds:['SENT']}]).gmailThreadParticipated,true);
assert.equal(flags([{labelIds:['DRAFT']},{payload:{headers:[{name:'From',value:hacks}]}}]).gmailThreadParticipated,false,'A draft or From header is not evidence of sending');
assert.equal(flags([{labelIds:['TRASH','SENT']}]).gmailThreadParticipated,false);
assert.equal(flags([{labelIds:['s']}]).gmailSponsorship,true);
assert.equal(flags([{payload:{headers:[{name:'To',value:'Sponsor <SPONSORSHIP@hackberkeley.org>'}]}}]).gmailSponsorship,true);
assert.equal(flags([{payload:{headers:[{name:'Cc',value:'sponsorship@hackberkeley.org.evil'}]}}]).gmailSponsorship,false);
assert.equal(flags([{payload:{headers:[{name:'Subject',value:'sponsorship@hackberkeley.org'}]}}]).gmailSponsorship,false);
const conversation=[{...hacksMail,id:'new',receivedAt:'2026-10-21T12:00:00Z'},{...hacksMail,id:'old',receivedAt:'2026-10-20T12:00:00Z'},{...hacksMail,id:'unrelated',threadId:'other',gmailThreadParticipated:false,gmailSponsorship:false}];
assert.deepEqual(hacksFilters.inboxViewMail(conversation,hacks,'attention').map(m=>m.id),['new']);
assert.deepEqual(hacksFilters.inboxViewMail(conversation,hacks,'groups').map(m=>m.id),['new']);
assert.equal(hacksFilters.inboxViewMail(conversation.map(m=>({...m,unread:false})),hacks,'attention').length,0);
assert.equal(hacksFilters.inboxViewMail(conversation.map(m=>({...m,unread:false})),hacks,'groups').length,1,'Read sponsorship mail stays in Sponsorship');
assert.equal(hacksFilters.inboxViewMail(conversation.map(m=>({...m,hidden:true})),hacks,'groups').length,0);
assert.equal(hacksFilters.inboxViewMail(conversation.map(mail=>({...mail,account:berk})),berk,'attention').length,3,'Berk keeps its existing unread filter');
const attentionMail=['shopping','jobs','school','other'].map((label,i)=>({...hacksMail,account:main,id:label,receivedAt:`2026-10-${20+i}T12:00:00Z`,unread:true,hidden:false}));
const classifyAttention=mail=>({label:mail.id});
assert.deepEqual(hacksFilters.inboxViewMail(attentionMail,main,'attention',classifyAttention).map(mail=>mail.id).sort(),['jobs','school']);
assert.equal(hacksFilters.inboxViewMail(attentionMail,main,'attention').length,0,'Main does not flash unfiltered mail before classifications load');
assert.equal(hacksFilters.inboxViewMail(attentionMail,main,'all',classifyAttention).length,4,'Other Main categories remain accessible in All saved');
assert.equal(hacksFilters.inboxViewMail(attentionMail.map(mail=>({...mail,unread:false})),main,'attention',classifyAttention).length,0);
assert.equal(hacksFilters.inboxViewMail(attentionMail.map(mail=>({...mail,hidden:true})),main,'attention',classifyAttention).length,0);
assert.equal(hacksFilters.inboxViewMail(attentionMail.map(mail=>({...mail,unread:false,locallyRead:false})),main,'attention',classifyAttention).length,2,'Locally restored unread status is respected');
assert.equal(hacksFilters.inboxViewMail(attentionMail,main,'attention',()=>({label:'shopping'})).length,0,'Updated classifications immediately change attention eligibility');
assert.equal(hacksFilters.inboxViewMail([...attentionMail,...conversation],main,'attention',classifyAttention).length,2,'Other-account mail never leaks into Main');
selectedEmail=berk;
console.log('PASS: Cal Hacks profile-before-labels, exact sponsorship recipients/labels, SENT-thread evidence, deduplication, unread/local-hide handling and account isolation.');

// Calendar writes use verified owner grants and exact saved Google event identities.
const calendarWrite=await mod('google-calendar-write'),weekHelpers=await mod('calendar-week');
assert.equal(weekHelpers.calendarTimeToISO('2026-10-19T09:00'),'2026-10-19T16:00:00.000Z');
assert.equal(weekHelpers.calendarTimeToISO('2026-12-01T09:00'),'2026-12-01T17:00:00.000Z');
assert.throws(()=>weekHelpers.calendarTimeToISO('2026-03-08T02:30'),/daylight saving/);
assert.equal(weekHelpers.addCalendarDays('2026-10-31',1),'2026-11-01');
assert.equal(oauth.googleScopesGranted('calendar',['https://www.googleapis.com/auth/calendar.events.readonly',oauth.calendarListScope]),true,'Existing read-only grants keep syncing');
assert.equal(oauth.calendarCanEdit(['https://www.googleapis.com/auth/calendar.events.readonly']),false);
await oauth.saveGoogleGrant(calendarGrant);
const providerFetch=globalThis.fetch,providerEvents=new Map();let writeDenied=false,calendarRole='owner',writes=0,deletes=[];
globalThis.fetch=async(input,init={})=>{
 const u=new URL(input),json=(v,status=200)=>Response.json(v,{status});
 if(u.pathname.includes('/calendarList/'))return json({id:decodeURIComponent(u.pathname.split('/').at(-1)),summary:'Fixture writable calendar',timeZone:'America/Los_Angeles',accessRole:calendarRole});
 if(u.pathname.includes('/calendar/v3/calendars/')){
   if(init.method==='POST'){writes++;if(writeDenied)return json({error:{}},403);const body=JSON.parse(init.body);if(providerEvents.has(body.id))return json({},409);providerEvents.set(body.id,body);return json(body);}
   const id=decodeURIComponent(u.pathname.split('/').at(-1));
   if(init.method==='DELETE'){deletes.push(u.href);if(writeDenied)return json({},403);providerEvents.delete(id);return new Response(null,{status:204});}
   if(providerEvents.has(id))return json(providerEvents.get(id));
 }
 return providerFetch(input,init);
};
const create={requestId:'a'.repeat(32),calendarId:'classes@group.calendar.google.com',title:'Fixture event',location:'Berkeley',allDay:false,start:'2026-10-20T16:00:00.000Z',end:'2026-10-20T17:00:00.000Z'};
const calendarRequest=(body,origin='https://life.test')=>new Request('https://life.test/api/google',{method:'POST',headers:{Origin:origin},body:JSON.stringify({resource:'calendar',account:berk,...body})});
const createBody={action:'createEvent',event:create};
assert.equal((await route.POST(calendarRequest(createBody,'https://attacker.test'))).status,403);
auth.setUser(null);assert.equal((await route.POST(calendarRequest(createBody))).status,401);auth.setUser({userId:'owner'});
assert.equal((await route.POST(calendarRequest({...createBody,account:main}))).status,400);
assert.equal((await route.POST(calendarRequest({...createBody,event:{...create,end:create.start}}))).status,400);
assert.equal((await route.POST(calendarRequest({...createBody,event:{...create,allDay:true,start:'2026-02-30',end:'2026-03-01'}}))).status,400);
await oauth.saveGoogleGrant({...calendarGrant,scopes:['https://www.googleapis.com/auth/calendar.events.readonly',oauth.calendarListScope]});
const readOnly=await route.POST(calendarRequest(createBody));assert.equal(readOnly.status,409);assert.equal((await readOnly.json()).requiresReconnect,true);assert.equal(writes,0);
await oauth.saveGoogleGrant(calendarGrant);
calendarRole='reader';assert.equal((await route.POST(calendarRequest(createBody))).status,403);assert.equal(writes,0);calendarRole='owner';
await assert.rejects(()=>calendarWrite.createCalendarEvent(create,'another-owner'),/different/);
writeDenied=true;assert.equal((await route.POST(calendarRequest(createBody))).status,502);assert.ok(!(await state()).events.some(e=>e.googleEventId===create.requestId));writeDenied=false;
let createdResponse=await route.POST(calendarRequest(createBody));assert.equal(createdResponse.status,200);const created=(await createdResponse.json()).event;
assert.equal(created.calendarId,create.calendarId);assert.equal(created.googleEventId,create.requestId);assert.equal(created.account,berk);assert.equal(created.canEdit,true);
assert.equal((await route.POST(calendarRequest({...createBody,event:{...create,title:'Changed after save'}}))).status,409);
const wrote=writes;assert.equal((await route.POST(calendarRequest(createBody))).status,200);assert.equal(writes,wrote,'Repeat form submission cannot duplicate an event');
const allDayInput={...create,requestId:'b'.repeat(32),allDay:true,start:'2026-10-31',end:'2026-11-02'};
const allDayEvent=(await(await route.POST(calendarRequest({action:'createEvent',event:allDayInput}))).json()).event;
assert.equal(allDayEvent.start,'2026-10-31T07:00:00.000Z');assert.equal(allDayEvent.end,'2026-11-02T08:00:00.000Z','All-day end crosses DST correctly');
// An uncertain provider success can be recovered using the client event ID.
const recoveredInput={...create,requestId:'c'.repeat(32)};providerEvents.set(recoveredInput.requestId,{id:recoveredInput.requestId,summary:recoveredInput.title,location:recoveredInput.location,start:{dateTime:recoveredInput.start},end:{dateTime:recoveredInput.end}});
assert.equal((await route.POST(calendarRequest({action:'createEvent',event:recoveredInput}))).status,200);
const beforeDelete=JSON.stringify((await state()).events);writeDenied=true;assert.equal((await route.POST(calendarRequest({action:'deleteEvent',id:created.id}))).status,502);assert.equal(JSON.stringify((await state()).events),beforeDelete);writeDenied=false;
assert.equal((await route.POST(calendarRequest({action:'deleteEvent',id:'unverified-id',calendarId:'arbitrary',googleEventId:'arbitrary'}))).status,409);
const withOccurrence={...created,recurring:true,googleEventId:'series_20261020T160000Z'};sqlite.prepare("UPDATE life_records SET payload=? WHERE kind='event' AND json_extract(payload,'$.id')=?").run(JSON.stringify(withOccurrence),created.id);
assert.equal((await route.POST(calendarRequest({action:'deleteEvent',id:created.id,calendarId:'attacker-calendar',googleEventId:'series'}))).status,200);
assert.ok(deletes.at(-1).includes(encodeURIComponent(create.calendarId)));assert.ok(deletes.at(-1).includes('series_20261020T160000Z'));assert.ok(deletes.at(-1).endsWith('sendUpdates=all'));
assert.ok(!(await state()).events.some(e=>e.id===created.id));
await direct.storeGoogleSnapshot(calendarGrant,{events:[{...created,id:created.id.slice(5)}],message:'Old snapshot',readStartedAt:'2000-01-01T00:00:00.000Z'});
assert.ok(!(await state()).events.some(e=>e.id===created.id),'Old sync must not resurrect a deleted event');
console.log('PASS: Calendar create/delete, writable subcalendars, owner/scope/auth/CSRF checks, validation, retry idempotency, 204 deletion, occurrence-only IDs, failures preserve data, stale sync protection and Pacific/DST conversion. No live provider writes.');

// Import every page of the past week, then browse older mail without Gmail mutations.
const mailPages=await mod('google-mail-page'),learning=await mod('mail-learning'),classifier=await mod('classifier'),ranges=await mod('mail-range');
const bulkNow=Date.now(),weekly=Array.from({length:64},(_,i)=>({id:'dd'+i.toString(16).padStart(3,'0'),receivedAt:bulkNow-86400000-i*60000,index:i})),older=Array.from({length:41},(_,i)=>({id:'ee'+i.toString(16).padStart(3,'0'),receivedAt:bulkNow-14*86400000-i*60000,index:i}));
const bulkCalls=[];let failBulk=false;
globalThis.fetch=async(input,init={})=>{
 const u=new URL(input);bulkCalls.push({url:u,method:init.method||'GET'});
 if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:berk});
 if(u.pathname.endsWith('/messages')){assert.equal(init.method,undefined);assert.equal(u.searchParams.get('maxResults'),'25');assert.equal(u.searchParams.get('includeSpamTrash'),'false');assert.equal(u.searchParams.has('labelIds'),false,'Include received Gmail-archived mail');const q=u.searchParams.get('q');assert.ok(q.includes('-in:sent')&&q.includes('-in:drafts'));const data=q.includes('after:')?weekly:older;const from=Number(u.searchParams.get('pageToken')||0),page=data.slice(from,from+25);return Response.json({messages:page.map(({id})=>({id})),...(from+25<data.length?{nextPageToken:String(from+25)}:{})});}
 if(u.pathname.includes('/messages/')){if(failBulk)return Response.json({}, {status:503});const id=u.pathname.split('/').at(-1),row=[...weekly,...older].find(m=>m.id===id),group=learning.mailGroups[row.index%4],seed=learning.starterExamples.find(e=>e.label===group.id);return Response.json({id,threadId:id,internalDate:String(row.receivedAt),snippet:seed.summary||'Reviewed fixture',labelIds:row.index%2?['INBOX','UNREAD']:['IMPORTANT'],payload:{headers:[{name:'From',value:'Person <person-'+row.index+'@fixture.test>'},{name:'Subject',value:seed.subject+' example '+row.index}]}});}
 throw Error('Unexpected bulk provider request '+u);
};
await oauth.saveGoogleGrant(grant);await databaseResetProgress();
async function databaseResetProgress(){sqlite.prepare("UPDATE life_records SET payload=json_remove(payload,?) WHERE id='sources'").run('$."gmail:'+berk+'".mailSync');}
const mailPageRequest=(range,reset=false)=>new Request('https://life.test/api/google',{method:'POST',headers:{Origin:'https://life.test'},body:JSON.stringify({action:'mailPage',resource:'gmail',account:berk,range,reset})});
const firstPage=await direct.readGoogleSnapshot(grant);assert.equal(firstPage.emails.length,25);assert.equal(firstPage.mailProgress.complete,false);await direct.storeGoogleSnapshot(grant,firstPage);
let progress=(await state()).sources['gmail:'+berk].mailSync;assert.equal(progress.nextPageToken,'25');
failBulk=true;assert.equal((await route.POST(mailPageRequest('week'))).status,502);assert.equal((await state()).sources['gmail:'+berk].mailSync.nextPageToken,'25','Failed page must not advance the cursor');failBulk=false;
for(let i=0;i<2;i++)assert.equal((await route.POST(mailPageRequest('week'))).status,200);
const allWeek=(await state()).emails.filter(m=>m.account===berk&&ranges.mailInRange(m,'week',bulkNow));assert.equal(allWeek.length,64,'No latest-30 truncation');assert.equal((await state()).sources['gmail:'+berk].mailSync.complete,true);assert.equal((await state()).sources['gmail:'+berk].mailSync.loaded,64);
assert.ok((await state()).emails.some(m=>m.account===main),'Importing Berk must preserve Main');
const beforeNoop=bulkCalls.length;assert.equal((await route.POST(mailPageRequest('week'))).status,200);assert.equal(bulkCalls.length,beforeNoop,'A complete import does not refetch its pages');
assert.equal((await route.POST(mailPageRequest('older'))).status,200);assert.equal((await state()).sources['gmail:'+berk].mailHistory.nextPageToken,'25');assert.equal((await route.POST(mailPageRequest('older'))).status,200);assert.equal((await state()).sources['gmail:'+berk].mailHistory.complete,true);
assert.equal((await state()).emails.filter(m=>m.account===berk&&ranges.mailInRange(m,'older',bulkNow)&&m.id.startsWith('ee')).length,41);assert.equal((await state()).emails.filter(m=>m.account===berk&&ranges.mailInRange(m,'week',bulkNow)).length,64);
assert.ok(bulkCalls.every(call=>call.method==='GET'),'Range changes and local archiving never modify Gmail');
assert.equal(ranges.mailInRange({receivedAt:new Date(bulkNow-ranges.mailWeekMs).toISOString()},'week',bulkNow),true);assert.equal(ranges.mailInRange({receivedAt:new Date(bulkNow-ranges.mailWeekMs-1).toISOString()},'older',bulkNow),true);
// Review and train on 64 emails, then age the messages out of the weekly view.
const labelRequest=(mail,index)=>new Request('https://life.test/api/mail-classifier',{method:'POST',headers:{Origin:'https://life.test'},body:JSON.stringify({action:'label',account:berk,id:mail.id,label:['school','jobs','other'][index%3]})});
for(const [index,mail]of allWeek.entries())assert.equal((await classifier.POST(labelRequest(mail,index))).status,200);
const reviewed=(await(await classifier.GET()).json()).labels.filter(l=>l.account===berk),personal=learning.trainPersonalModel(reviewed.map(l=>({...l.features,key:l.key,label:l.label})),berk);assert.equal(personal.examples,64);
for(const mail of allWeek){const aged={...mail,receivedAt:new Date(bulkNow-20*86400000).toISOString()};sqlite.prepare("UPDATE life_records SET payload=? WHERE id=?").run(JSON.stringify(aged),'mail:'+berk+':'+mail.id);}
assert.equal((await state()).emails.filter(m=>m.account===berk&&ranges.mailInRange(m,'week',bulkNow)).length,0);assert.equal((await classifier.POST(new Request('https://life.test/api/mail-classifier',{method:'POST',headers:{Origin:'https://life.test'},body:JSON.stringify({action:'model',account:berk,model:personal})}))).status,200,'Training uses all saved reviewed labels, including Archive');assert.equal((await(await classifier.GET()).json()).modelsByAccount[berk].examples,64);
console.log('PASS: all 64 weekly messages across three pages, 41 older messages, cursor retry/resume/completion, account isolation, no Gmail archive/mutation, seven-day boundary, and 64-example personal training after messages leave the weekly view.');
sqlite.close();
console.log('PASS: Gmail Trash consent/identity/CSRF/failure/account isolation/refresh races/restoration; OAuth state, PKCE, browser/owner binding, replay and expiry, exact account and scope checks, encrypted tokens, safe callback, isolated imports, preserved failures, DST all-day events, disconnect, CSRF, authentication and setup gating.');
