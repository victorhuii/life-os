import {directJobSource,jobPollMinutes,jobMatchesFreshness,jobDetectedSince} from "./job-time";
import { database, save } from "./store";
import { defaultJobSources, discoverJobSources, autoBoardLimit } from "./job-sources";
import { JobFeedError, jobLevel, graduateRequirement, jobInRegion, parseJobFeed, reportedJobDates,jobParserVersion, type Job, type JobSource, type JobSourceRecord } from "./jobs";
import { loadJobIndex, updateJobIndex } from "./job-index";
import { reconcileJobRecords } from "./job-matching";
import { classifyCompany, companyKey } from "./job-companies";
import type { JobCompanyGroup } from "./jobs";

export async function jobSources() {
  const rows = await database().prepare("SELECT id,payload FROM life_records WHERE kind='job_source'").all<{ id: string; payload: string }>();
  const existing = new Set(rows.results.map(row => row.id));
  const missing = defaultJobSources.filter(source => !existing.has(`job-source:${source.id}`));
  if (missing.length) await database().batch(missing.map(source => database().prepare("INSERT OR IGNORE INTO life_records (id,kind,payload,updated_at) VALUES (?,'job_source',?,?)").bind(`job-source:${source.id}`, JSON.stringify({ source, snapshot: { jobs: [] } }), new Date().toISOString())));
  return [...rows.results.map(row => JSON.parse(row.payload) as JobSourceRecord), ...missing.map(source => ({ source, snapshot: { jobs: [] } } as JobSourceRecord))].map(record=>{
    const intervalMinutes=jobPollMinutes(record.source.provider),snapshot={...record.snapshot};
    if(!snapshot.error&&snapshot.lastAttempt&&snapshot.nextCheck){const accelerated=Date.parse(snapshot.lastAttempt)+intervalMinutes*60000;if(accelerated<Date.parse(snapshot.nextCheck))snapshot.nextCheck=new Date(accelerated).toISOString();}
    return {...record,source:{...record.source,intervalMinutes},snapshot};
  });
}
export async function setJobDiscovery(enabled: boolean) {
  await save("job:discovery", "job_control", {enabled});
}
async function jobDiscovery() {
  const row = await database().prepare("SELECT payload FROM life_records WHERE id='job:discovery'").first<{payload:string}>();
  return {enabled: row ? JSON.parse(row.payload).enabled !== false : true, limit: autoBoardLimit};
}
class JobFeedSizeError extends JobFeedError {}
async function readBody(response: Response) {
  const max = 16 * 1024 * 1024;
  if (Number(response.headers.get("content-length") || 0) > max || !response.body) { await response.body?.cancel(); throw new JobFeedSizeError("This feed is too large to read. Saved listings are preserved."); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw new JobFeedSizeError("This feed exceeded the size limit. Saved listings are preserved."); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
async function downloadSource(record: JobSourceRecord, budget: { remaining: number }) {
  const headers: Record<string, string> = { Accept: record.source.provider === "simplify" || record.source.provider === "jobright" ? "text/plain" : "application/json", "User-Agent": "V.E.C.T.O.R.-Jobs/1.0" };
  if (record.snapshot.parserVersion === jobParserVersion && record.snapshot.etag) headers["If-None-Match"] = record.snapshot.etag;
  if (record.snapshot.parserVersion === jobParserVersion && record.snapshot.lastModified) headers["If-Modified-Since"] = record.snapshot.lastModified;
  let url = record.source.url, page = 0, listings: Record<string, unknown>[] = [];
  let compact = !!record.snapshot.compact;
  if(record.source.provider==="greenhouse"){const contentUrl=new URL(url);contentUrl.searchParams.set("content",compact ? "false" : "true");url=contentUrl.href;}
  const signal = AbortSignal.timeout(20000);
  while (true) {
    let result: Response;
    if (budget.remaining-- <= 0) throw new JobFeedError("This refresh reached its request budget. Saved jobs are preserved until the next check.");
    try { result = await fetch(url, { headers, redirect: "manual", signal }); }
    catch { throw new JobFeedError("Source couldn’t be reached. Saved listings are preserved."); }
    if (result.status === 304 && !page) return { notModified: true as const };
    if (result.status === 429) { const retry = result.headers.get("retry-after"); const seconds = Number(retry) || (retry ? (Date.parse(retry) - Date.now()) / 1000 : 0); throw new JobFeedError("Source rate limited this request. V.E.C.T.O.R. will retry later.", Math.min(7200, Math.max(300, seconds || 300))); }
    if (!result.ok) { await result.body?.cancel(); throw new JobFeedError(`Source returned HTTP ${result.status}. Saved listings are preserved.`, result.status === 404 ? 3600 : 300); }
    let body: string;
    try { body = await readBody(result); }
    catch (error) {
      if (!(error instanceof JobFeedSizeError) || record.source.provider !== "greenhouse" || compact) throw error;
      compact = true;
      const compactUrl = new URL(record.source.url); compactUrl.searchParams.set("content", "false"); url = compactUrl.href;
      delete headers["If-None-Match"]; delete headers["If-Modified-Since"];
      continue;
    }
    if (compact && record.source.provider === "greenhouse") body = JSON.stringify({...JSON.parse(body), _vectorCompact:true});
    if (record.source.provider !== "lever") return { body, compact, etag: result.headers.get("etag") || undefined, lastModified: result.headers.get("last-modified") || undefined };
    const parsed = JSON.parse(body); if (!Array.isArray(parsed)) throw new JobFeedError("Lever returned an unexpected response.");
    listings.push(...parsed);
    if (parsed.length < 100) return { body: JSON.stringify(listings) };
    if (++page >= 12) throw new JobFeedError("Lever has more pages than the current import limit. Saved listings are preserved.");
    const next = new URL(record.source.url); next.searchParams.set("skip", String(page * 100)); url = next.href;
    delete headers["If-None-Match"]; delete headers["If-Modified-Since"];
  }
}
async function greenhouseDates(record:JobSourceRecord,jobs:Job[],budget:{remaining:number},now:string){
 if(record.source.provider!=="greenhouse")return undefined;
 const previous=new Map(record.snapshot.jobs.map(job=>[job.id,job]));
 for(const job of jobs){const old=previous.get(job.id);job.dateCheckedAt=old?.dateCheckedAt;
  if(job.descriptionPending&&old&&old.changedAt!==job.changedAt)job.dateCheckedAt=undefined;
  if(job.descriptionPending&&old&&!old.descriptionPending&&old.changedAt===job.changedAt&&record.snapshot.parserVersion===jobParserVersion){job.descriptionPending=false;job.graduateRequired=old.graduateRequired;job.educationReason=old.educationReason;job.level=old.level;}
if(!job.publishedAt&&old?.publishedAt){job.publishedAt=old.publishedAt;job.dateEvidence=old.dateEvidence;}}
 if(Date.parse(record.snapshot.dateRetryAt||'1970-01-01')>Date.now())return record.snapshot.dateRetryAt;
 const candidates=jobs.filter(job=>(job.descriptionPending||!job.publishedAt)&&/^\d+$/.test(job.providerJobId||'')&&(!job.dateCheckedAt||Date.now()-Date.parse(job.dateCheckedAt)>(job.descriptionPending?300000:86400000))).sort((a,b)=>Number(a.level==='other')-Number(b.level==='other')||Number(!!b.descriptionPending)-Number(!!a.descriptionPending)||Number(previous.has(a.id))-Number(previous.has(b.id)));
 for(const job of candidates.slice(0,3)){
  if(budget.remaining<=8)break;budget.remaining--;job.dateCheckedAt=now;
  try{const response=await fetch(record.source.url+'/'+encodeURIComponent(job.providerJobId!),{headers:{Accept:'application/json','User-Agent':'V.E.C.T.O.R.-Jobs/1.0'},redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(response.status===429){const retry=response.headers.get('retry-after'),delay=Number(retry)||Math.max(300,(Date.parse(retry||'')-Date.now())/1000)||300;await response.body?.cancel();return new Date(Date.now()+Math.min(7200,Math.max(300,delay))*1000).toISOString();}
   if(!response.ok){await response.body?.cancel();continue;}
   const item=JSON.parse(await readBody(response));if(String(item.id)!==job.providerJobId)continue;
   if(job.descriptionPending&&typeof item.content==='string'){job.educationReason=graduateRequirement(job.title,item.content);job.graduateRequired=!!job.educationReason;job.level=jobLevel(job.title,record.source.defaultLevel,item.content);job.descriptionPending=false;}
   const evidence=reportedJobDates(record.source.id,job.url,item.first_published,undefined,now);if(evidence.length){job.publishedAt=evidence[0].date;job.dateEvidence=evidence;}
  }catch{/* A date lookup must never suppress a newly discovered role. */}
 }
 return undefined;
}
export async function pollJobs(force = false) {
  const now = new Date().toISOString(), lock = crypto.randomUUID();
  const claimed = await database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES ('job:poll','job_control',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE life_records.updated_at < ? RETURNING id").bind(JSON.stringify(lock), now, new Date(Date.now() - 120000).toISOString()).first();
  if (!claimed) return { busy: true, checked: 0, remainingDue: 0 };
  try {
    const records = await jobSources();
    const discovery = await jobDiscovery();
    const added = discovery.enabled ? discoverJobSources(records) : [];
    if (added.length) {
      await database().batch(added.map(source => database().prepare("INSERT OR IGNORE INTO life_records (id,kind,payload,updated_at) VALUES (?,'job_source',?,?)").bind(`job-source:${source.id}`, JSON.stringify({source, snapshot:{jobs:[]}}), now)));
      records.push(...added.map(source => ({source, snapshot:{jobs:[]}})));
    }
    const firstSeen = new Map<string, string>();
    for (const record of records) for (const job of record.snapshot.jobs) { const old = firstSeen.get(job.id); if (!old || old > job.firstSeenAt) firstSeen.set(job.id, job.firstSeenAt); }
    const due = records.filter(record => record.source.enabled && ((record.snapshot.parserVersion !== jobParserVersion && !record.snapshot.error && Date.now() - Date.parse(record.snapshot.lastAttempt || "1970-01-01") > 60000) || (force ? Date.now() - Date.parse(record.snapshot.lastAttempt || "1970-01-01") > 60000 : Date.parse(record.snapshot.nextCheck || "1970-01-01") <= Date.now()))).sort((a,b)=>(a.snapshot.nextCheck||"").localeCompare(b.snapshot.nextCheck||"")||Number(directJobSource(b.source.provider))-Number(directJobSource(a.source.provider)));
    // Lever may need several pages; a bounded batch prevents one run monopolizing the Worker.
    const batch = due.slice(0, 8);
    if(!batch.length)return {checked:0,remainingDue:0,results:[]};
    const results: { source: string; count?: number; error?: string }[] = [];
    const budget = { remaining: 40 };
    // Description-rich boards run serially to bound Worker memory.
    const concurrency = batch.some(record => ["ashby","greenhouse"].includes(record.source.provider)) ? 1 : 2;
    for (let i = 0; i < batch.length; i += concurrency) {
      await Promise.all(batch.slice(i, i + concurrency).map(async record => {
        const attempt = new Date().toISOString();
        try {
          const downloaded = await downloadSource(record, budget);
          if (downloaded.notModified) {const dateRetryAt=await greenhouseDates(record,record.snapshot.jobs,budget,attempt);record.snapshot = { ...record.snapshot, lastAttempt: attempt, lastSuccess: new Date().toISOString(), nextCheck: new Date(Date.now() + record.source.intervalMinutes * 60000).toISOString(), failures: 0, error: undefined,dateRetryAt };}
          else {
            const parsed = await parseJobFeed(record.source, downloaded.body!, attempt);
            const observedAt=new Date().toISOString();
            const dateRetryAt=await greenhouseDates(record,parsed.jobs,budget,attempt);
            for (const job of parsed.jobs) { job.firstSeenAt = firstSeen.get(job.id) || observedAt; job.baseline = !record.snapshot.lastSuccess && !firstSeen.has(job.id); }
            record.snapshot = { jobs: parsed.jobs, lastAttempt: attempt, lastSuccess: attempt, nextCheck: new Date(Date.now() + record.source.intervalMinutes * 60000).toISOString(), failures: 0, totalListings: parsed.total, etag: downloaded.etag, lastModified: downloaded.lastModified, parserVersion: jobParserVersion,dateRetryAt,compact:downloaded.compact };
          }
          results.push({ source: record.source.id, count: record.snapshot.jobs.length });
        } catch (error) {
          const failures = (record.snapshot.failures || 0) + 1;
          const wait = Math.min(7200, Math.max(error instanceof JobFeedError ? error.retrySeconds : 300, 60 * Math.pow(2, failures)));
          record.snapshot = { ...record.snapshot, lastAttempt: attempt, nextCheck: new Date(Date.now() + wait * 1000).toISOString(), failures, error: error instanceof JobFeedError ? error.message : "Couldn’t parse the source. Saved listings are preserved." };
          results.push({ source: record.source.id, error: record.snapshot.error });
        }
        await save(`job-source:${record.source.id}`, "job_source", record);
      }));
    }
    await save("job:last-poll", "job_control", { at: new Date().toISOString(), checked: batch.length });
    const reconciliation = await updateJobIndex(records);
    return { checked: batch.length, remainingDue: Math.max(0, due.length - batch.length), discovered: added.length, results, reconciliation };
  } finally { await database().prepare("DELETE FROM life_records WHERE id='job:poll' AND payload=?").bind(JSON.stringify(lock)).run(); }
}
type JobProgress = { saved: boolean; applied: boolean; hidden: boolean };
type StoredMark = { job: Job; mark?: "saved" | "applied" | "hidden"; saved?: boolean; applied?: boolean; hidden?: boolean; at?: string };
function progress(mark: StoredMark): JobProgress { return { saved: mark.saved ?? mark.mark === "saved", applied: mark.applied ?? mark.mark === "applied", hidden: mark.hidden ?? mark.mark === "hidden" }; }
async function savedMarks() { const rows = await database().prepare("SELECT payload FROM life_records WHERE kind='job_mark'").all<{ payload: string }>(); return rows.results.map(row => JSON.parse(row.payload) as StoredMark); }
async function indexedJobs(records: JobSourceRecord[]) { const index = await loadJobIndex(); return index || { jobs: reconcileJobRecords(records).jobs, metadata: null }; }
function applyProgress(jobs: Job[], marks: StoredMark[]) {
  const byAlias = new Map<string, Job>();
  const copies = jobs.map(job => ({ ...job }));
  for (const job of copies) for (const id of [job.id, ...(job.aliases || [])]) byAlias.set(id, job);
  for (const mark of marks) {
    let job = [mark.job.id, ...(mark.job.aliases || [])].map(id => byAlias.get(id)).find(Boolean);
    if (!job) { job = { ...mark.job, unavailable: true }; copies.push(job); for (const id of [job.id, ...(job.aliases || [])]) byAlias.set(id, job); }
    const flags = progress(mark);
    job.saved = !!job.saved || flags.saved; job.applied = !!job.applied || flags.applied; job.hidden = !!job.hidden || flags.hidden;
    job.mark = job.hidden ? "hidden" : job.applied ? "applied" : job.saved ? "saved" : undefined;
  }
  return copies;
}
export async function readJobs(params = new URLSearchParams()) {
  const records = await jobSources();
  const index = await indexedJobs(records);
  const all = applyProgress(index.jobs, await savedMarks()).filter(job=>!job.descriptionPending&&!job.graduateRequired&&!graduateRequirement(job.title));
  const overrides = await database().prepare("SELECT payload FROM life_records WHERE id LIKE 'job-company:%' AND kind='job_control'").all<{ payload: string }>();
  const groupMap = new Map(overrides.results.map(row => { const value = JSON.parse(row.payload); return [value.key, value.group as JobCompanyGroup] as const; }));
  for (const job of all) { const company = classifyCompany(job.company, groupMap.get(companyKey(job.company))); job.companyGroup = company.group; job.companyGroupReason = company.reason; job.companyGroupSource = company.source; job.companyGroupOverride = company.override; }
  const query = (params.get("q") || "").trim().toLowerCase().slice(0, 200), category = params.get("role") || "all", level = params.get("level") || "early", region = params.get("region") || "us", status = params.get("status") || "all", source = params.get("source") || "all", group = params.get("group") || "big";
  const freshness=params.get("fresh")||"all";
  const matching = all.filter(job => !job.hidden && (!job.unavailable || ["saved", "applied"].includes(status)) && (status === "all" || (status === "saved" ? job.saved : status === "applied" ? job.applied : false)) && (category === "all" || category === job.category) && (level === "all" || (level === "early" ? ["internship", "entry"].includes(job.level) : job.level === level)) && jobInRegion(job, region) && (source === "all" || job.sources.includes(source)) && (!query || query.split(/\s+/).every(word => `${job.company} ${job.title} ${job.location}`.toLowerCase().includes(word))) && jobMatchesFreshness(job,freshness)&&(!params.has("since")||jobDetectedSince(job,params.get("since")!,Date.now(),params.get("until")||undefined)));
  const groups = { big: matching.filter(job => job.companyGroup === "big").length, growth: matching.filter(job => job.companyGroup === "growth").length, startup: matching.filter(job => job.companyGroup === "startup").length };
  const filtered = matching.filter(job => group === "all" || job.companyGroup === group);
  const sort = params.get("sort") || "posted";
  filtered.sort((a, b) => {
    if (sort === "detected") return b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id);
    if (!a.postedAt || !b.postedAt) return a.postedAt ? -1 : b.postedAt ? 1 : b.firstSeenAt.localeCompare(a.firstSeenAt) || a.id.localeCompare(b.id);
    return (sort === "posted_oldest" ? a.postedAt.localeCompare(b.postedAt) : b.postedAt.localeCompare(a.postedAt)) || a.id.localeCompare(b.id);
  });
  const page = Math.max(1, Math.min(1000, Math.floor(Number(params.get("page")) || 1))), size = 40;
  const background = await database().prepare("SELECT payload FROM life_records WHERE id='job:background'").first<{ payload: string }>();
  return { jobs: filtered.slice((page - 1) * size, page * size), total: filtered.length, page, pages: Math.ceil(filtered.length / size), groups, selectedGroup: group, reconciliation: index.metadata, stats: { indexed: all.filter(job => !job.unavailable && !job.hidden).length, saved: all.filter(job => job.saved && !job.hidden).length, applied: all.filter(job => job.applied && !job.hidden).length, sources: records.filter(record => record.source.enabled).length, healthy: records.filter(record => record.source.enabled && record.snapshot.lastSuccess && !record.snapshot.error).length }, discovery: { ...await jobDiscovery(), added: records.filter(record => record.source.discoveredFrom).length }, sources: records.map(({ source, snapshot }) => ({ ...source, url: undefined, count: snapshot.jobs.filter(job=>!job.descriptionPending).length, pendingDescriptions: snapshot.jobs.filter(job=>job.descriptionPending).length, totalListings: snapshot.totalListings, lastSuccess: snapshot.lastSuccess, lastAttempt: snapshot.lastAttempt, nextCheck: snapshot.nextCheck, error: snapshot.error })), background: background ? JSON.parse(background.payload) : null, checkedAt: new Date().toISOString() };
}
export async function setJobProgress(id: string, patch: Partial<JobProgress>) {
  const records = await jobSources(), index = await indexedJobs(records), marks = await savedMarks();
  const job = applyProgress(index.jobs, marks).find(job => job.id === id || job.aliases?.includes(id));
  if (!job) throw new JobFeedError("This listing is no longer in the feed. Refresh Jobs and try again.");
  const aliases = new Set([job.id, ...(job.aliases || [])]);
  const flags = { saved: !!job.saved, applied: !!job.applied, hidden: !!job.hidden, ...patch };
  const statements = marks.filter(mark => aliases.has(mark.job.id)).map(mark => database().prepare("DELETE FROM life_records WHERE id=? AND kind='job_mark'").bind(`job-mark:${mark.job.id}`));
  if (flags.saved || flags.applied || flags.hidden) statements.push(database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES (?,'job_mark',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(`job-mark:${job.id}`, JSON.stringify({ job: { ...job, saved: undefined, applied: undefined, hidden: undefined, mark: undefined }, ...flags, at: new Date().toISOString() }), new Date().toISOString()));
  if (statements.length) await database().batch(statements);
}
export async function markJob(id: string, mark: "saved" | "applied" | "hidden" | "none") {
  await setJobProgress(id, mark === "none" ? { saved: false, applied: false, hidden: false } : { [mark]: true });
}
export async function setCompanyGroup(company: string, group: JobCompanyGroup | "auto") {
  const key = companyKey(company); if (!key) throw new JobFeedError("Choose a valid company.");
  if (group === "auto") await database().prepare("DELETE FROM life_records WHERE id=? AND kind='job_control'").bind(`job-company:${key}`).run();
  else await save(`job-company:${key}`, "job_control", { key, group });
}
export async function saveJobSource(source: JobSource) {
  const old = await jobSources();
  if (old.length >= 100 && !old.some(record => record.source.id === source.id)) throw new JobFeedError("This personal deployment supports up to 100 monitored sources.");
  const existing = old.find(record => record.source.id === source.id);
  await save(`job-source:${source.id}`, "job_source", { source, snapshot: existing?.snapshot || { jobs: [] } });
  await updateJobIndex(await jobSources(), true);
}
