import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = path.join(root, ".sites-runtime/jobs-tests");
mkdirSync(temp, { recursive: true });
const imports = { "./job-time":"./job-time.mjs", "./job-company-catalog.json": "./job-company-catalog.mjs", "./job-companies": "./job-companies.mjs", "./job-matching": "./job-matching.mjs", "./job-index": "./job-index.mjs", "./life": "./life.mjs", "./store": "./store.mjs", "./jobs": "./jobs.mjs", "./job-sources": "./job-sources.mjs", "@/lib/store": "./store.mjs", "@/lib/jobs": "./jobs.mjs", "@/lib/jobs-store": "./jobs-store.mjs", "@/app/chatgpt-auth": "./auth.mjs", "cloudflare:workers": "./test-env.mjs" };
for (const [name, file] of Object.entries({ "job-time":"lib/job-time.ts", "job-companies": "lib/job-companies.ts", "job-matching": "lib/job-matching.ts", "job-index": "lib/job-index.ts", life: "lib/life.ts", store: "lib/store.ts", jobs: "lib/jobs.ts", "job-sources": "lib/job-sources.ts", "jobs-store": "lib/jobs-store.ts", route: "app/api/jobs/route.ts", sync: "app/api/jobs/sync/route.ts" })) {
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from "([^"]+)"/g, (match, specifier) => imports[specifier] ? `from "${imports[specifier]}"` : match);
  writeFileSync(path.join(temp, `${name}.mjs`), output);
}
writeFileSync(path.join(temp, "job-company-catalog.mjs"), "export default " + readFileSync(path.join(root, "lib/job-company-catalog.json"), "utf8") + ";\n");
writeFileSync(path.join(temp, "auth.mjs"), "export async function getChatGPTUser(){return globalThis.testSignedIn ? {id:'owner'} : null;} export const chatGPTSignInPath = () => '/signin-with-chatgpt';\n");
writeFileSync(path.join(temp, "test-env.mjs"), `
import { DatabaseSync } from 'node:sqlite';
export const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE life_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
function statement(sql, values = []) { return { bind: (...args) => statement(sql, args), all: async () => ({results: sqlite.prepare(sql).all(...values)}), first: async () => sqlite.prepare(sql).get(...values) || null, run: async () => sqlite.prepare(sql).run(...values) }; }
export const env = { DB: { prepare: sql => statement(sql), batch: async statements => {const result=[]; for(const item of statements) result.push(await item.run()); return result;} } };
`);
const moduleAt = name => import(pathToFileURL(path.join(temp, `${name}.mjs`)).href);
const { parseJobFeed, companyJobSource, jobInRegion, jobLevel, jobUrl, graduateRequirement, jobCategory } = await moduleAt("jobs");
const { defaultJobSources, discoverJobSources } = await moduleAt("job-sources");
const { sqlite } = await moduleAt("test-env");
const { jobSources, pollJobs, readJobs: readJobsImpl, markJob, saveJobSource, setJobProgress, setCompanyGroup, setJobDiscovery } = await moduleAt("jobs-store");
const readJobs = (params = new URLSearchParams()) => { const query = new URLSearchParams(params); if (!query.has("group")) query.set("group", "all"); return readJobsImpl(query); };
const { reconcileJobRecords, employerJobIdentity } = await moduleAt("job-matching");
const { updateJobIndex, loadJobIndex } = await moduleAt("job-index");
const { classifyCompany, companyKey } = await moduleAt("job-companies");
const { reportedJobDates } = await moduleAt("jobs");
const { GET, POST } = await moduleAt("route");
await setJobDiscovery(false); // Existing refresh fixtures isolate automatic discovery.
const now = "2026-10-19T12:00:00.000Z";
const gh = companyJobSource("https://boards.greenhouse.io/test", "Fixture Co");
const ghBody = (title = "Software Engineer, New Grad") => JSON.stringify({ jobs: [{ id: 1, title, location: { name: "San Francisco, CA" }, absolute_url: "https://boards.greenhouse.io/test/jobs/1?utm_source=list", updated_at: "2026-10-18T00:00:00Z" }] });
let parsed = await parseJobFeed(gh, ghBody(), now);
assert.equal(parsed.jobs.length, 1);
assert.equal(parsed.jobs[0].publishedAt, undefined, "An update timestamp is not a posting timestamp");
assert.equal(parsed.jobs[0].level, "entry");
assert.equal(parsed.jobs[0].url, "https://job-boards.greenhouse.io/test/jobs/1");
assert.equal(jobUrl("https://job-boards.greenhouse.io/test/jobs/1?source=foo"), parsed.jobs[0].url);
assert.equal(jobLevel("Senior Software Engineer", "entry"), "other");
assert.equal(jobLevel("Data Scientist II", "entry"), "other");
assert.equal(jobLevel("Software Engineer Intern"), "internship");
assert.equal(jobInRegion({ location: "Berlin or London", remote: false }, "us"), false);
assert.equal(jobInRegion({ location: "Work in London", remote: false }, "us"), false);
assert.equal(jobInRegion({ location: "Portland, OR", remote: false }, "us"), true);
assert.equal(jobInRegion({ location: "Remote", remote: true }, "us"), true);
for (const invalid of ["http://boards.greenhouse.io/test", "https://boards.greenhouse.io.evil.test/test", "https://localhost/test", "https://user:pass@jobs.lever.co/test", "https://jobs.lever.co:444/test"]) assert.throws(() => companyJobSource(invalid, "No"));
assert.equal(companyJobSource("https://jobs.eu.lever.co/test", "EU").url.startsWith("https://api.eu.lever.co/"), true);
const ashby = companyJobSource("https://jobs.ashbyhq.com/test", "Ashby Co");
parsed = await parseJobFeed(ashby, JSON.stringify({ jobs: [{ title: "Data Scientist Intern", jobUrl: "https://jobs.ashbyhq.com/test/one", location: "New York", isRemote: true, publishedAt: now }, { title: "Software Engineer Intern", jobUrl: "https://jobs.ashbyhq.com/test/hidden", isListed: false }] }), now);
assert.equal(parsed.jobs.length, 1); assert.equal(parsed.jobs[0].category, "data-science"); assert.equal(parsed.jobs[0].publishedAt, now);
const lever = companyJobSource("https://jobs.lever.co/test", "Lever Co");
parsed = await parseJobFeed(lever, JSON.stringify([{ text: "Full Stack Engineer Intern", hostedUrl: "https://jobs.lever.co/test/one", categories: { location: "Boston, MA" }, createdAt: Date.now() }]), now);
assert.equal(parsed.jobs[0].category, "fullstack"); assert.equal(parsed.jobs[0].publishedAt, undefined);
const simplify = defaultJobSources.find(source => source.provider === "simplify");
const table = '<table><tr><td><a href="https://test.example">Company</a></td><td>Software Engineer</td><td>New York, NY<br>Seattle, WA</td><td><a href="https://job-boards.greenhouse.io/test/jobs/1?gh_src=abc">Apply</a></td><td>1d</td></tr><tr><td>↳</td><td>Data Analyst</td><td>Remote</td><td><a href="https://test.example/2">Apply</a></td><td>2d</td></tr><tr><td>Closed</td><td>Software Engineer</td><td>CA</td><td>🔒</td><td>3d</td></tr></table>';
parsed = await parseJobFeed(simplify, table, now);
assert.equal(parsed.jobs.length, 2); assert.equal(parsed.jobs[0].id, (await parseJobFeed(gh, ghBody(), now)).jobs[0].id); assert.equal(parsed.jobs[1].company, "Company"); assert.equal(parsed.jobs[1].level, "internship"); assert.equal(parsed.jobs[0].sourceDate, "1d");
const jobright = defaultJobSources.find(source => source.provider === "jobright");
parsed = await parseJobFeed(jobright, '| Company | Job Title | Location | Work Model | Date Posted |\n| **[Example](https://example.test)** | **[Data Analyst](https://jobright.ai/jobs/info/test)** | USA | Remote | Oct 19 |', now);
assert.equal(parsed.jobs.length, 1); assert.equal(parsed.jobs[0].remote, true); assert.equal(parsed.jobs[0].company, "Example");
const repeatedCompany = await parseJobFeed(jobright, '| **[Example](https://example.test)** | **[Data Analyst](https://jobright.ai/jobs/info/one)** | USA | Remote | Oct 19 |\n| ↳ | **[Software Engineer](https://jobright.ai/jobs/info/two)** | USA | Remote | Oct 19 |', now);
assert.deepEqual(repeatedCompany.jobs.map(job => job.company), ["Example", "Example"], "Continuation rows must inherit their employer before company grouping");
await assert.rejects(parseJobFeed(simplify, "Unexpected error page", now));
await assert.rejects(parseJobFeed(gh, '{"error":"changed"}', now));

// Exercise the actual persistence, polling and HTTP route code against SQLite.
await jobSources();
for (const source of defaultJobSources) await saveJobSource({ ...source, enabled: false });
await saveJobSource(gh);
let mode = "ok", requests = [];
globalThis.fetch = async (input, options) => {
  requests.push({ input: String(input), options });
  assert.equal(options.redirect, "manual");
  if(String(input).endsWith("/jobs/1"))return Response.json({id:1});
  if (mode === "fail") return new Response("Unavailable", { status: 503 });
  if (mode === "304") { assert.equal(options.headers["If-None-Match"], '"v1"'); return new Response(null, { status: 304 }); }
  if (mode === "empty") return new Response('{"jobs":[]}');
  if (mode === "large-ashby") return new Response(' '.repeat(13 * 1024 * 1024) + '{"jobs":[]}');
  if (mode === "lever") { const skip = new URL(input).searchParams.get("skip"); return new Response(JSON.stringify(skip ? [{ text: "Software Engineer Intern", hostedUrl: "https://jobs.lever.co/test/last", categories: { location: "CA" } }] : Array.from({ length: 100 }, (_, index) => ({ text: "Software Engineer Intern", hostedUrl: `https://jobs.lever.co/test/${index}`, categories: { location: "CA" } })))); }
  return new Response(ghBody(), { headers: { ETag: '"v1"' } });
};
const due = id => { const row = sqlite.prepare("SELECT payload FROM life_records WHERE id=?").get(`job-source:${id}`); const record = JSON.parse(row.payload); record.snapshot.nextCheck = "2000-01-01T00:00:00Z"; sqlite.prepare("UPDATE life_records SET payload=? WHERE id=?").run(JSON.stringify(record), `job-source:${id}`); };
assert.equal((await pollJobs()).checked, 1);
let feed = await readJobs(); assert.equal(feed.total, 1); const original = feed.jobs[0];
assert.equal((await pollJobs()).checked, 0, "Polling honors source intervals");
const legacyRow = JSON.parse(sqlite.prepare("SELECT payload FROM life_records WHERE id=?").get(`job-source:${gh.id}`).payload);
delete legacyRow.snapshot.parserVersion; legacyRow.snapshot.lastAttempt = "2000-01-01T00:00:00Z";
sqlite.prepare("UPDATE life_records SET payload=? WHERE id=?").run(JSON.stringify(legacyRow), `job-source:${gh.id}`);
requests = []; assert.equal((await pollJobs()).checked, 1); assert.equal(requests[0].options.headers["If-None-Match"], undefined, "Parser upgrades must fetch fresh data even before nextCheck");
mode = "304"; due(gh.id); await pollJobs(); feed = await readJobs(); assert.equal(feed.jobs[0].firstSeenAt, original.firstSeenAt);
mode = "fail"; due(gh.id); const failed = await pollJobs(); assert.match(failed.results[0].error, /503/); assert.equal((await readJobs()).total, 1, "Failed refresh preserves jobs");
await markJob(original.id, "saved");
mode = "empty"; due(gh.id); await pollJobs();
feed = await readJobs(new URLSearchParams({ status: "saved" })); assert.equal(feed.jobs.length, 1); assert.equal(feed.jobs[0].unavailable, true, "Saved jobs survive a listing being removed"); assert.equal((await readJobs()).total, 0);
await markJob(original.id, "applied"); assert.equal((await readJobs(new URLSearchParams({ status: "applied" }))).total, 1);
await markJob(original.id, "none"); assert.equal((await readJobs(new URLSearchParams({ status: "applied" }))).total, 0);
await saveJobSource({ ...gh, enabled: false }); await saveJobSource(lever); mode = "lever"; requests = []; await pollJobs(); assert.equal(requests.length, 2); assert.equal((await readJobs()).total, 101, "Lever pagination must not drop jobs after page one");
assert.equal((await readJobs(new URLSearchParams({ region: "all", q: "no-match" }))).total, 0);
await saveJobSource({ ...lever, enabled: false }); await saveJobSource(ashby); mode = "large-ashby";
assert.equal((await pollJobs()).results[0].count, 0, "Large real-world Ashby feeds must fit the bounded import size");
sqlite.prepare("INSERT INTO life_records VALUES ('job:poll','job_control',?,?)").run(JSON.stringify("other-run"), new Date().toISOString()); assert.equal((await pollJobs()).busy, true); sqlite.prepare("DELETE FROM life_records WHERE id='job:poll'").run();
const request = (body, origin = "https://vector.test") => new Request("https://vector.test/api/jobs", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
globalThis.testSignedIn = false;
assert.equal((await GET(new Request("https://vector.test/api/jobs"))).status, 401);
assert.equal((await POST(request({ action: "refresh" }))).status, 401);
globalThis.testSignedIn = true;
assert.equal((await GET(new Request('https://vector.test/api/jobs?since=invalid'))).status,400);
assert.equal((await GET(new Request('https://vector.test/api/jobs?since=2026-01-01T00:00:00Z&until=invalid'))).status,400);
assert.equal((await GET(new Request('https://vector.test/api/jobs?since=2026-01-02T00:00:00Z&until=2026-01-01T00:00:00Z'))).status,400);

assert.equal((await POST(request({ action: "refresh" }, "https://evil.test"))).status, 403);
assert.equal((await POST(request({ action: "source", name: "Invalid", url: "https://localhost/" }))).status, 400);
assert.equal((await GET(new Request("https://vector.test/api/jobs"))).status, 200);
const { state } = await moduleAt("store"); assert.deepEqual((await state()).tasks, []); assert.equal(JSON.stringify(await state()).includes("jobs.lever.co"), false, "Jobs snapshots stay outside personal context and dashboard exports");
// Cross-source reconciliation must preserve identity, history and independent progress.
const baseJob = { ...original, id: "a".repeat(32), company: "Fixture Co", publishedAt: "2026-10-18T10:00:00.000Z", dateEvidence: undefined };
const sameJob = { ...baseJob, id: "b".repeat(32), company: "Fixture Co Inc.", url: "https://careers.fixture.example/apply?gh_jid=1", publishedAt: "2026-10-15T00:00:00.000Z" };
const otherJob = { ...baseJob, id: "c".repeat(32), url: "https://job-boards.greenhouse.io/test/jobs/2", publishedAt: undefined };
const makeRecord = (source, jobs) => ({ source, snapshot: { jobs, lastSuccess: now } });
let reconciled = reconcileJobRecords([makeRecord(gh, [baseJob, otherJob]), makeRecord(simplify, [sameJob])], [], now);
assert.equal(reconciled.stats.activeJobs, 2, "A matching title cannot merge different requisitions");
let unified = reconciled.jobs.find(job => job.aliases.includes(baseJob.id));
assert.deepEqual(unified.aliases, [baseJob.id, sameJob.id]);
assert.equal(unified.postedAt, sameJob.publishedAt, "The oldest supported date wins");
assert.equal(unified.dateStatus, "confirmed");
assert.equal(unified.possibleMatches, 1);
assert.equal(reconciled.stats.mergedListings, 1);
const nextHistory = reconcileJobRecords([makeRecord(gh, [{ ...baseJob, publishedAt: "2026-10-19T10:00:00.000Z" }])], reconciled.jobs, "2026-10-20T12:00:00.000Z");
assert.equal(nextHistory.jobs.find(job => !job.unavailable).postedAt, sameJob.publishedAt, "Earlier evidence survives a source disappearing or a repost");
assert.equal(nextHistory.jobs.find(job => !job.unavailable).dateStatus, "confirmed", "Prior verified identity evidence remains available");
const moved = { ...baseJob, id: "d".repeat(32), url: "https://another.fixture.example/jobs?gh_jid=1", publishedAt: "2026-10-19T10:00:00.000Z" };
const movedResult = reconcileJobRecords([makeRecord(gh, [moved])], nextHistory.jobs, "2026-10-21T12:00:00.000Z");
assert.equal(movedResult.jobs.find(job => !job.unavailable).id, unified.id, "Changing a URL must not change a verified requisition's stable ID");
assert.equal(movedResult.jobs.find(job => !job.unavailable).postedAt, sameJob.publishedAt);
assert.equal(employerJobIdentity(baseJob), employerJobIdentity(sameJob));
assert.notEqual(employerJobIdentity(baseJob), employerJobIdentity({ ...sameJob, company: "Another employer" }));
const leverVariant = { ...baseJob, url: "https://jobs.lever.co/test/fixture-id" };
assert.equal(employerJobIdentity(leverVariant), employerJobIdentity({ ...leverVariant, url: leverVariant.url + "/apply" }));
assert.equal(reportedJobDates(gh.id, baseJob.url, undefined, "2d", now)[0].kind, "estimated");
assert.equal(reportedJobDates("jobright:test", baseJob.url, undefined, "Oct 19", now)[0].yearInferred, true);
assert.deepEqual(reportedJobDates("jobright:test", baseJob.url, undefined, "Nov 19", now), []);
assert.deepEqual(reportedJobDates(gh.id, baseJob.url, "2026-02-30T10:00:00Z", undefined, now), [], "Invalid calendar dates must not become confirmed evidence");
assert.deepEqual(reportedJobDates(gh.id, baseJob.url, "October 15", undefined, now), [], "A non-ISO publication field must not silently acquire a guessed year");
const estimated = { ...sameJob, publishedAt: undefined, dateEvidence: reportedJobDates(simplify.id, sameJob.url, undefined, "10d", now) };
const withEstimate = reconcileJobRecords([makeRecord(gh, [baseJob]), makeRecord(simplify, [estimated])], [], now).jobs[0];
assert.equal(withEstimate.postedAt, baseJob.publishedAt, "Age estimates must never backdate the confirmed date");
assert.equal(withEstimate.dateStatus, "confirmed", "A matched employer's explicit date is sufficient evidence");
assert.equal(companyKey("Fixture Co Inc."), companyKey("Fixture Co"));
assert.equal(classifyCompany("Microsoft Corporation").group, "big");
assert.equal(classifyCompany("Stripe").group, "big", "Big-name grouping takes precedence over YC membership");
assert.equal(classifyCompany("Supabase").group, "growth"); assert.match(classifyCompany("Supabase").reason, /Y Combinator/);
assert.equal(classifyCompany("Unknown tiny company").group, "startup"); assert.match(classifyCompany("Unknown tiny company").reason, /not verified/);
for (const source of await jobSources()) await saveJobSource({ ...source.source, enabled: false });
await saveJobSource(gh); await saveJobSource(simplify);
const replaceSnapshot = (source, jobs) => sqlite.prepare("UPDATE life_records SET payload=? WHERE id=?").run(JSON.stringify(makeRecord(source, jobs)), `job-source:${source.id}`);
replaceSnapshot(gh, [baseJob, otherJob]); replaceSnapshot(simplify, [sameJob]);
await updateJobIndex(await jobSources(), true);
await markJob(sameJob.id, "saved");
await setJobProgress(baseJob.id, { applied: true });
feed = await readJobs(new URLSearchParams({ status: "saved" }));
assert.equal(feed.total, 1); assert.equal(feed.jobs[0].applied, true); assert.equal(feed.jobs[0].saved, true);
await setJobProgress(sameJob.id, { applied: false });
assert.equal((await readJobs(new URLSearchParams({ status: "saved" }))).total, 1, "Unchecking Applied must retain its bookmark");
assert.equal((await readJobs(new URLSearchParams({ status: "applied" }))).total, 0);
await setJobProgress(sameJob.id, { applied: true });
replaceSnapshot(simplify, []); await updateJobIndex(await jobSources(), true);
assert.equal((await readJobs(new URLSearchParams({ status: "applied" }))).total, 1, "Application state survives source expiry and index rebuilds");
assert.equal((await readJobsImpl()).selectedGroup, "big"); assert.equal((await readJobsImpl()).total, 0);
await setCompanyGroup("Fixture Co", "big");
assert.equal((await readJobsImpl()).total, 2); assert.equal((await readJobsImpl()).groups.big, 2);
await setCompanyGroup("Fixture Co Inc.", "auto");
assert.equal((await readJobsImpl()).total, 0);
await setCompanyGroup("Fixture Co", "growth");
assert.equal((await readJobs(new URLSearchParams({ group: "growth" }))).total, 2);
assert.equal((await loadJobIndex()).metadata.matchedJobs, 1);
const unknownLast = await readJobs(new URLSearchParams({ sort: "posted_oldest" }));
assert.equal(unknownLast.jobs[0].postedAt, sameJob.publishedAt);
assert.equal(unknownLast.jobs.at(-1).postedAt, undefined, "Unknown dates sort last even in ascending order");
const thirdDate = { ...baseJob, id: "f".repeat(32), url: "https://job-boards.greenhouse.io/test/jobs/3", publishedAt: "2026-10-17T00:00:00.000Z" };
replaceSnapshot(gh, [baseJob, otherJob, thirdDate]); await updateJobIndex(await jobSources(), true);
assert.deepEqual((await readJobs(new URLSearchParams({ sort: "posted_oldest" }))).jobs.map(job => job.postedAt), [sameJob.publishedAt, thirdDate.publishedAt, undefined]);
assert.deepEqual((await readJobs(new URLSearchParams({ sort: "posted" }))).jobs.map(job => job.postedAt), [thirdDate.publishedAt, sameJob.publishedAt, undefined]);
const beforeProgressError = JSON.stringify(sqlite.prepare("SELECT * FROM life_records ORDER BY id").all());
assert.equal((await POST(request({ action: "progress", id: baseJob.id, applied: "yes" }))).status, 400);
assert.equal(JSON.stringify(sqlite.prepare("SELECT * FROM life_records ORDER BY id").all()), beforeProgressError);
assert.equal((await POST(request({ action: "progress", id: baseJob.id, applied: false }))).status, 200);
assert.equal((await readJobs(new URLSearchParams({ status: "saved" }))).total, 1);

// Exact source times, faster polling migration, optional detail enrichment and safe story destinations.
const {formatJobTimestamp,observedJobDelay,jobPollMinutes,jobMatchesFreshness,jobDetectedSince}=await moduleAt('job-time');
const summaryNow=Date.parse('2026-10-22T00:00:00Z'),summarySince='2026-10-21T22:00:00Z';
assert.equal(jobDetectedSince({firstSeenAt:'2026-10-21T23:00:00Z',baseline:false},summarySince,summaryNow),true);
assert.equal(jobDetectedSince({firstSeenAt:'2026-10-21T23:00:00Z',baseline:true},summarySince,summaryNow),false);
assert.equal(jobDetectedSince({firstSeenAt:summarySince,baseline:false},summarySince,summaryNow),false);
assert.equal(jobDetectedSince({firstSeenAt:'2026-10-23T00:00:00Z'},summarySince,summaryNow),false);
assert.equal(jobDetectedSince({firstSeenAt:'2026-10-21T23:00:00Z'},'invalid',summaryNow),false);
assert.equal(jobDetectedSince({firstSeenAt:'2026-10-21T23:00:00Z'},summarySince,summaryNow,'2026-10-21T23:00:00Z'),false);
assert.equal(jobDetectedSince({firstSeenAt:'2026-10-21T23:00:00Z'},summarySince,summaryNow,'2026-10-21T23:30:00Z'),true);
assert.match(formatJobTimestamp('2026-10-20T16:23:45Z','instant'),/9:23:45 AM PDT/);
assert.match(formatJobTimestamp('2026-12-20T16:23:45Z','instant'),/8:23:45 AM PST/);
assert.equal(formatJobTimestamp('2026-10-20T00:00:00Z','day'),'Oct 20, 2026');
assert.equal(observedJobDelay({baseline:false,postedAt:'2026-10-20T16:00:00Z',postedPrecision:'instant',dateStatus:'source',firstSeenAt:'2026-10-20T16:00:43Z'}),'43s');
assert.equal(observedJobDelay({baseline:true,postedAt:'2026-10-20T16:00:00Z',postedPrecision:'instant',dateStatus:'source',firstSeenAt:'2026-10-20T16:00:43Z'}),null,'Initial bulk import must not imply fast detection');
assert.equal(observedJobDelay({baseline:false,postedAt:'2026-10-20T00:00:00Z',postedPrecision:'day',dateStatus:'source',firstSeenAt:'2026-10-20T16:00:43Z'}),null,'Date-only posts have no measurable delay');
const freshFixture={firstSeenAt:'2026-10-20T16:00:00Z',postedAt:'2026-10-20T16:00:00Z',postedPrecision:'instant',dateStatus:'source'};
assert.equal(jobMatchesFreshness(freshFixture,'posted_hour',Date.parse('2026-10-20T16:30:00Z')),true);assert.equal(jobMatchesFreshness({...freshFixture,postedPrecision:'day'},'posted_hour',Date.parse('2026-10-20T16:30:00Z')),false);assert.equal(jobMatchesFreshness({...freshFixture,postedAt:'2026-10-20T17:00:00Z'},'posted_hour',Date.parse('2026-10-20T16:30:00Z')),false);
assert.equal(jobPollMinutes('greenhouse'),1);assert.equal(jobPollMinutes('simplify'),5);
assert.equal(companyJobSource('https://l.instagram.com/?u='+encodeURIComponent('https://jobs.ashbyhq.com/test/role-id'),'Story company').url,'https://api.ashbyhq.com/posting-api/job-board/test');
assert.equal(companyJobSource('https://boards.greenhouse.io/embed/job_app?for=test&token=123','Embedded').slug,'test');
for(const url of ['http://127.0.0.1/private','https://attacker.test/redirect','https://user:pass@jobs.lever.co/test','https://jobs.lever.co:444/test'])assert.throws(()=>companyJobSource('https://l.instagram.com/?u='+encodeURIComponent(url),'Unsafe'));
for(const record of await jobSources())await saveJobSource({...record.source,enabled:false});
await saveJobSource({...gh,intervalMinutes:5});let record=JSON.parse(sqlite.prepare("SELECT payload FROM life_records WHERE id=?").get('job-source:'+gh.id).payload);record.snapshot.lastAttempt=new Date(Date.now()-70000).toISOString();record.snapshot.lastSuccess=record.snapshot.lastAttempt;record.snapshot.nextCheck=new Date(Date.now()+4*60000).toISOString();record.snapshot.error=undefined;record.snapshot.jobs=[];record.snapshot.parserVersion=3;sqlite.prepare('UPDATE life_records SET payload=? WHERE id=?').run(JSON.stringify(record),'job-source:'+gh.id);
assert.ok(Date.parse((await jobSources()).find(r=>r.source.id===gh.id).snapshot.nextCheck)<Date.now(),'Old five-minute checks accelerate immediately');
let detailCount=0,detailRateLimited=false,listCalls=0,detailId=1;
globalThis.fetch=async(input,options)=>{assert.equal(options.redirect,'manual');const u=new URL(input);if(/\/jobs\/\d+$/.test(u.pathname)){detailCount++;if(detailRateLimited)return new Response(null,{status:429,headers:{'Retry-After':'600'}});return Response.json({id:detailId,first_published:'2026-10-19T12:34:56Z',updated_at:'2026-10-20T12:00:00Z'});}listCalls++;return new Response(ghBody(),{headers:{ETag:'"speed-test"'}});};
await pollJobs();record=(await jobSources()).find(r=>r.source.id===gh.id);assert.equal(record.source.intervalMinutes,1);assert.equal(detailCount,1);assert.equal(record.snapshot.jobs[0].publishedAt,'2026-10-19T12:34:56.000Z');assert.equal(record.snapshot.jobs[0].dateEvidence[0].precision,'instant');assert.ok(Date.parse(record.snapshot.nextCheck)-Date.now()<=60000);
due(gh.id);await pollJobs();assert.equal(detailCount,1,'Already-known publication dates do not re-fetch detail pages');
record=(await jobSources()).find(r=>r.source.id===gh.id);record.snapshot.error='Rate limited';record.snapshot.nextCheck=new Date(Date.now()+600000).toISOString();sqlite.prepare('UPDATE life_records SET payload=? WHERE id=?').run(JSON.stringify(record),'job-source:'+gh.id);assert.ok(Date.parse((await jobSources()).find(r=>r.source.id===gh.id).snapshot.nextCheck)>Date.now()+590000,'Cadence upgrades preserve retry backoff');
record.snapshot.error=undefined;record.snapshot.jobs=[];record.snapshot.nextCheck='2000-01-01T00:00:00Z';sqlite.prepare('UPDATE life_records SET payload=? WHERE id=?').run(JSON.stringify(record),'job-source:'+gh.id);detailRateLimited=true;await pollJobs();record=(await jobSources()).find(r=>r.source.id===gh.id);assert.equal(record.snapshot.jobs.length,1,'A failed date lookup must not delay/suppress new listings');assert.ok(Date.parse(record.snapshot.dateRetryAt)>Date.now()+590000);const beforeRetry=detailCount;due(gh.id);await pollJobs();assert.equal(detailCount,beforeRetry,'429 detail lookup respects Retry-After');
console.log('PASS: precise Pacific posted times/day-only dates, honest measured delays, 1-minute source migration/backoff, employer detail publication timestamps/reuse, rate-limited detail fallback and safe Instagram story destination URLs.');
// Graduate-only eligibility is excluded without blocking bachelor's-level new graduates.
for(const title of ['Software Engineer Intern - PhD','Data Scientist Intern (Masters)','Software Engineer M.S. Intern','Graduate Student Software Engineer','Software Engineer MBA Internship'])assert.ok(graduateRequirement(title),title);
for(const title of ['Software Engineer, New Grad','Graduate Software Engineer','Master Data Engineer','Software Engineer Intern (BS/MS/PhD)'])assert.equal(graduateRequirement(title),undefined,title);
for(const text of ["Master's degree required in Computer Science.","<h3>Minimum Qualifications</h3><ul><li>M.S. in Computer Science</li></ul>","You must currently be enrolled in graduate school.","Currently pursuing a PhD in computer science.","&lt;p&gt;Master&#8217;s degree required.&lt;/p&gt;"])assert.ok(graduateRequirement('Software Engineer Intern',text),text);
for(const text of ["Bachelor's degree or Master's degree required.","PhD preferred.","Master's degree or equivalent practical experience.","<h3>Preferred Qualifications</h3><ul><li>Master's degree in Computer Science.</li></ul>","Bachelor's degree required. Master's degree preferred.","You will support PhD researchers.","PhD not required."])assert.equal(graduateRequirement('Software Engineer Intern',text),undefined,text);
const degreeJobs=await parseJobFeed(gh,JSON.stringify({jobs:[{id:9001,title:'Software Engineer Intern',location:{name:'San Francisco, CA'},absolute_url:'https://job-boards.greenhouse.io/fixture/jobs/9001',content:"<h3>Requirements</h3><p>Currently pursuing a master's degree.</p>"},{id:9002,title:'Software Engineer, New Grad',location:{name:'San Francisco, CA'},absolute_url:'https://job-boards.greenhouse.io/fixture/jobs/9002',content:"Bachelor's degree required. Master's degree preferred."}]}),new Date().toISOString());
assert.equal(degreeJobs.jobs.find(j=>j.providerJobId==='9001').graduateRequired,true);
assert.equal(degreeJobs.jobs.find(j=>j.providerJobId==='9002').graduateRequired,false);
replaceSnapshot(gh,degreeJobs.jobs);await updateJobIndex(await jobSources(),true);
const eligible=await readJobs(new URLSearchParams({group:'all',level:'all'}));
assert.ok(!eligible.jobs.some(j=>j.providerJobId==='9001'),'Graduate-only descriptions are filtered from feed and summary totals');
assert.ok(eligible.jobs.some(j=>j.providerJobId==='9002'),'Bachelor-level new-grad remains eligible');
assert.ok(reconcileJobRecords([makeRecord(gh,degreeJobs.jobs)],[],new Date().toISOString()).jobs.some(j=>j.graduateRequired),'Degree evidence survives reconciliation');
console.log('PASS: graduate-only title/description filters, preferred/alternative degrees retained, encoded employer HTML, merged evidence and feed counts.');

// Discover employer feeds safely and without re-enabling paused boards.
const community = defaultJobSources.find(source => source.provider === 'simplify');
const communityJob = {...degreeJobs.jobs[1],sources:[community.id],url:'https://jobs.ashbyhq.com/newfixture/abc',company:'New Fixture'};
const communityRecord = makeRecord(community,[communityJob,{...communityJob,url:'https://jobs.ashbyhq.com/newfixture/xyz'},{...communityJob,url:'https://127.0.0.1/unsafe'},{...communityJob,url:'https://jobs.lever.co/senior/abc',level:'other'},{...communityJob,url:'https://job-boards.greenhouse.io/grad/jobs/1',graduateRequired:true}]);
assert.deepEqual(discoverJobSources([communityRecord]).map(source=>source.id),['ashby:newfixture']);
assert.equal(discoverJobSources([communityRecord])[0].discoveredFrom,community.id);
assert.equal(discoverJobSources([communityRecord,makeRecord({...companyJobSource(communityJob.url,'New Fixture'),enabled:false},[])]).length,0,'Discovery must not re-enable paused boards');
assert.equal(discoverJobSources([communityRecord],0).length,0);
assert.equal(discoverJobSources([communityRecord,...Array.from({length:24},(_,i)=>makeRecord({...gh,id:'existing:'+i,discoveredFrom:community.id},[]))]).length,0,'Automatic source expansion is bounded');
for(const item of await jobSources())await saveJobSource({...item.source,enabled:false});
await saveJobSource(community);replaceSnapshot(community,[communityJob]);await setJobDiscovery(true);
globalThis.fetch=async()=>Response.json({jobs:[{title:'Software Engineer',employmentType:'Intern',location:'San Francisco, CA',jobUrl:communityJob.url,isListed:true}]});
const expanded=await pollJobs();assert.equal(expanded.discovered,1);
assert.ok((await jobSources()).some(record=>record.source.id==='ashby:newfixture'&&record.snapshot.lastSuccess));
assert.equal((await readJobs(new URLSearchParams({q:'Fixture Engineer',level:'early'}))).total,1,'Search terms match across company/title in any order');
assert.equal((await readJobs(new URLSearchParams({q:'Fixture impossible'}))).total,0,'All search words are required');
await setJobDiscovery(false);assert.equal((await readJobs()).discovery.enabled,false);
// A due community list may not be starved by newly due direct boards.
for(const item of await jobSources())await saveJobSource({...item.source,enabled:false});
await saveJobSource(community);replaceSnapshot(community,[]);due(community.id);
for(let i=0;i<8;i++){const board=companyJobSource('https://job-boards.greenhouse.io/fair'+i,'Fair '+i);await saveJobSource(board);const row=(await jobSources()).find(record=>record.source.id===board.id);row.snapshot.nextCheck='2020-01-01T00:00:00Z';row.snapshot.parserVersion=5;sqlite.prepare('UPDATE life_records SET payload=? WHERE id=?').run(JSON.stringify(row),'job-source:'+board.id);}
const order=[];globalThis.fetch=async input=>{order.push(String(input));return String(input).includes('raw.githubusercontent.com')?new Response('<table></table>'):Response.json({jobs:[]});};
await pollJobs();assert.ok(order[0].includes('raw.githubusercontent.com'),'Oldest due feed runs first, regardless of provider');
assert.equal(jobLevel('Software Engineer',undefined,'','Intern'),'internship');
assert.equal(jobLevel('Software Engineer',undefined,'','Internship'),'internship');
assert.equal(jobLevel('Senior Software Engineer',undefined,'','Intern'),'other');
assert.equal(jobLevel('Software Engineer',undefined,'This position is open to recent graduates.'),'entry');
assert.equal(jobLevel('Software Engineer',undefined,'You will mentor recent graduates.'),'other');
assert.equal(jobLevel('Software Engineer',undefined,'This role is a paid internship.'),'internship');
const structured=await parseJobFeed(companyJobSource('https://jobs.lever.co/metadata','Metadata'),JSON.stringify([{text:'Data Engineer',hostedUrl:'https://jobs.lever.co/metadata/1',categories:{location:'Seattle, WA',commitment:'Intern'}}]),now);
assert.equal(structured.jobs[0].level,'internship');
assert.equal(structured.jobs[0].category,'software');
console.log('PASS: bounded automatic employer discovery, safe destinations, paused-source retention, discovery switch, structured internships, explicit entry-level descriptions, multiword search and fair source scheduling.');

// Large employer feeds retain degree checks instead of losing the whole board.
for(const item of await jobSources())await saveJobSource({...item.source,enabled:false});
const largeBoard=companyJobSource('https://job-boards.greenhouse.io/largefixture','Large Fixture');await saveJobSource(largeBoard);
let changed=false;const largeCalls=[];
globalThis.fetch=async input=>{const url=new URL(input);largeCalls.push(url.href);if(/\/jobs\/\d+$/.test(url.pathname)){const id=Number(url.pathname.split('/').pop());return Response.json({id,content:id===1&&!changed?"Master's degree required.":"Bachelor's degree required.",first_published:'2026-10-19T00:00:00Z'});}if(url.searchParams.get('content')==='true')return new Response('too big',{headers:{'Content-Length':String(17*1024*1024)}});return Response.json({jobs:Array.from({length:5},(_,i)=>({id:i+1,title:'Software Engineer Intern',absolute_url:'https://job-boards.greenhouse.io/largefixture/jobs/'+(i+1),location:{name:'San Francisco, CA'},first_published:'2026-10-19T00:00:00Z',updated_at:changed&&i===0?'2026-10-22T00:00:00Z':'2026-10-20T00:00:00Z'}))});};
await pollJobs();let largeRecord=(await jobSources()).find(r=>r.source.id===largeBoard.id);
assert.equal(largeRecord.snapshot.compact,true);assert.equal(largeRecord.snapshot.jobs.filter(j=>j.descriptionPending).length,2);
assert.equal((await readJobs()).total,2,'Unchecked descriptions and graduate-only role remain out of results');
assert.equal(largeCalls.filter(url=>/\/jobs\/\d+$/.test(new URL(url).pathname)).length,3,'Description work is bounded per board');
largeCalls.length=0;due(largeBoard.id);await pollJobs();
assert.equal((await readJobs()).total,4);assert.ok(!largeCalls.some(url=>url.includes('content=true')),'Oversized full feed is not repeatedly downloaded');
assert.equal(largeCalls.filter(url=>/\/jobs\/\d+$/.test(new URL(url).pathname)).length,2,'Successful checks are reused');
changed=true;largeCalls.length=0;due(largeBoard.id);await pollJobs();assert.equal((await readJobs()).total,5,'Changed employer requirements are rechecked immediately');
console.log('PASS: oversized Greenhouse fallback, bounded description queue, graduate exclusion while pending, cached checks, and immediate rechecks for updated postings.');

// Business and decision-insight roles flow through the existing analytics filters.
for(const title of ['Business Analyst Intern','Business Systems Analyst I','Associate Business Analyst','Product Analyst, New Grad','Marketing Analytics Intern','Customer Insights Analyst','Decision Scientist Intern','Quantitative Analyst Intern','Operations Research Analyst I'])assert.equal(jobCategory(title),'data-analysis',title);
for(const title of ['Financial Analyst Intern','Risk Analyst I','Operations Analyst Intern','Supply Chain Analyst I','Strategy Analyst Intern']){
 assert.equal(jobCategory(title,'Use SQL and Python to build dashboards and turn data into business insights.'),'data-analysis',title);
 assert.equal(jobCategory(title,'Process paperwork and coordinate customer appointments.'),undefined,title+' without analytical evidence');
}
assert.equal(jobCategory('Recruiting Coordinator','SQL and dashboards'),undefined);
assert.equal(jobCategory('Account Executive','Python and statistical analysis'),undefined);
assert.equal(jobLevel('Associate Business Analyst'),'entry');
assert.equal(jobLevel('Senior Business Analyst'),'other');
const businessParsed=await parseJobFeed(gh,JSON.stringify({jobs:[
 {id:101,title:'Business Analyst Intern',location:{name:'New York, NY'},absolute_url:'https://job-boards.greenhouse.io/test/jobs/101',content:"Bachelor's degree required."},
 {id:102,title:'Operations Analyst I',location:{name:'San Francisco, CA'},absolute_url:'https://job-boards.greenhouse.io/test/jobs/102',content:'Use SQL for forecasting and business insights.'},
 {id:103,title:'Financial Analyst Intern',location:{name:'New York, NY'},absolute_url:'https://job-boards.greenhouse.io/test/jobs/103',content:'Process invoices and file documents.'},
 {id:104,title:'Business Analyst Intern - PhD',location:{name:'New York, NY'},absolute_url:'https://job-boards.greenhouse.io/test/jobs/104',content:'PhD required.'}
]}),now);
assert.equal(businessParsed.jobs.length,3);assert.ok(businessParsed.jobs.every(job=>job.category==='data-analysis'));
for(const item of await jobSources())await saveJobSource({...item.source,enabled:false});
await saveJobSource(gh);replaceSnapshot(gh,businessParsed.jobs);await updateJobIndex(await jobSources(),true);
const businessFeed=await readJobs(new URLSearchParams({role:'data-analysis',level:'early',q:'Analyst'}));
assert.equal(businessFeed.total,2,'Business/analytical operations roles appear in the early-career analytics feed; graduate-only role remains excluded');
console.log('PASS: business/product/marketing/decision-insight titles, contextual financial/risk/operations matching, associate/senior levels, feed integration and graduate exclusion.');

sqlite.close();
console.log("PASS: five feed parsers, closed/unlisted filtering, early-career and location defaults, safe source URLs, deduplication, posting-time semantics, conditional refresh, first-seen retention, failed-feed preservation, saved/applied persistence, pagination, poll lock, authentication and origin checks; confirmed requisition matching, ambiguity separation, earliest-date history, unknown-last sorting, company grouping/overrides, independent bookmarks and application checkboxes.");
