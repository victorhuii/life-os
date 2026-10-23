import { companyKey } from "./job-companies";
import { jobLevel, jobUrl, reportedJobDates, type Job, type JobDateEvidence, type JobSourceRecord } from "./jobs";

export const jobIndexVersion = 1;

// Employer identity, never a title-only guess. Company scope prevents IDs from
// different employers/ATS tenants from being merged accidentally.
export function employerJobIdentity(job: Pick<Job, "url" | "company">) {
  const url = new URL(jobUrl(job.url)), company = companyKey(job.company);
  const parts = url.pathname.split("/").filter(Boolean);
  let provider = "", id = "";
  const gh = url.searchParams.get("gh_jid");
  if (gh && /^\d+$/.test(gh)) { provider = "greenhouse"; id = gh; }
  else if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) { provider = "greenhouse"; id = parts[parts.indexOf("jobs") + 1] || ""; }
  else if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) { provider = `lever${url.hostname.includes(".eu.") ? "-eu" : ""}`; id = parts[1] || ""; }
  else if (url.hostname === "jobs.ashbyhq.com") { provider = "ashby"; id = parts[1] || ""; }
  else if (url.hostname.endsWith(".myworkdayjobs.com")) { provider = `workday:${url.hostname}`; id = url.pathname.match(/_((?:R|JR|REQ)[a-z0-9_-]+)\/?$/i)?.[1] || ""; }
  else if (url.hostname === "jobs.smartrecruiters.com") { provider = "smartrecruiters"; id = parts[1]?.match(/^\d+/)?.[0] || ""; }
  else if (url.hostname === "apply.workable.com") { provider = `workable:${parts[0]}`; id = parts[parts.indexOf("j") + 1] || ""; }
  else if (["amazon.jobs", "www.amazon.jobs"].includes(url.hostname)) { provider = "amazon"; id = url.pathname.match(/\/jobs\/(\d+)/)?.[1] || ""; }
  else if (url.hostname === "jobs.apple.com") { provider = "apple"; id = url.pathname.match(/\/details\/(\d+)/)?.[1] || ""; }
  else if (["careers.google.com", "www.google.com", "google.com"].includes(url.hostname)) { provider = "google"; id = url.pathname.match(/\/jobs\/(?:results\/)?(\d+)/)?.[1] || ""; }
  return provider && /^[a-z0-9_-]{1,150}$/i.test(id) ? `req:${company}:${provider}:${id.toLowerCase()}` : null;
}

function canonicalUrl(job: Job) {
  const url = new URL(jobUrl(job.url));
  if (["jobs.lever.co", "jobs.eu.lever.co", "jobs.ashbyhq.com"].includes(url.hostname)) url.pathname = url.pathname.replace(/\/(?:apply|application)\/?$/, "");
  return `url:${url.href}`;
}
function titleKey(title: string) { return title.toLowerCase().replace(/[\W_]+/g, " ").trim(); }
function locationKey(location: string) { return location.toLowerCase().replace(/united states(?: of america)?|\busa\b/g, "").replace(/california/g, "ca").replace(/new york/g, "ny").replace(/[^a-z0-9]/g, ""); }
function earliestEvidence(items: JobDateEvidence[]) {
  const dates = new Map<string, JobDateEvidence>();
  for (const item of items) {
    if (!Number.isFinite(Date.parse(item.date))) continue;
    const key = `${item.source}|${item.url}|${item.kind}|${!!item.yearInferred}`;
    const previous = dates.get(key);
    if (!previous || item.date < previous.date) dates.set(key, item);
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function decorateDate(job: Job) {
  const reported = (job.dateEvidence || []).filter(item => item.kind === "reported");
  const first = reported[0];
  const confirmedSources = new Set(reported.filter(item => !item.yearInferred).map(item => item.source));
  const employerDate = reported.some(item => !item.yearInferred && /^(greenhouse|lever|ashby):/.test(item.source));
  return { ...job, postedAt: first?.date, postedPrecision: first?.precision, dateStatus: first ? (job.matchStatus === "matched" && (employerDate || confirmedSources.size > 1) && !first.yearInferred ? "confirmed" : "source") : job.dateEvidence?.length ? "estimated" : "unknown" } as Job;
}

export function reconcileJobRecords(records: JobSourceRecord[], history: Job[] = [], now = new Date().toISOString()) {
  const observations = records.filter(record => record.source.enabled).flatMap(record => record.snapshot.jobs.map(job => ({ job, source: record.source.id, direct: ["greenhouse", "lever", "ashby"].includes(record.source.provider) })));
  const parents = observations.map((_, index) => index);
  const root = (index: number): number => { while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; } return index; };
  const seenKeys = new Map<string, number>();
  const oldByAlias = new Map<string, Job>();
  const oldByKey = new Map<string, Job>();
  for (const old of history) { for (const id of [old.id, ...(old.aliases || [])]) oldByAlias.set(id, old); for (const key of [canonicalUrl(old), ...(old.identityKeys || [])]) oldByKey.set(key, old); }
  const previousJob = (job: Job) => oldByAlias.get(job.id) || oldByKey.get(employerJobIdentity(job) || "") || oldByKey.get(canonicalUrl(job));
  for (let index = 0; index < observations.length; index++) {
    const job = observations[index].job;
    const keys = [canonicalUrl(job), employerJobIdentity(job)].filter((key): key is string => !!key);
    const old = previousJob(job);
    if (old) keys.push(`previous:${old.id}`);
    for (const key of keys) { const prior = seenKeys.get(key); if (prior !== undefined) parents[root(index)] = root(prior); else seenKeys.set(key, index); }
  }
  const buckets = new Map<number, typeof observations>();
  observations.forEach((observation, index) => { const key = root(index); const list = buckets.get(key) || []; list.push(observation); buckets.set(key, list); });
  const usedOld = new Set<string>(), active: Job[] = [];
  for (const bucket of buckets.values()) {
    const old = [...new Map(bucket.map(item => previousJob(item.job)).filter((job): job is Job => !!job).map(job => [job.id, job])).values()].sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt) || a.id.localeCompare(b.id));
    old.forEach(job => usedOld.add(job.id));
    const preferred = bucket.find(item => item.direct)?.job || bucket[0].job;
    const graduateEvidence=bucket.find(item=>item.job.graduateRequired)?.job;
    const aliases = [...new Set([...bucket.map(item => item.job.id), ...old.flatMap(job => [job.id, ...(job.aliases || [])])])].sort();
    const sources = [...new Set(bucket.map(item => item.source))].sort();
    const verifiedSources = [...new Set([...sources, ...old.flatMap(job => job.verifiedSources || job.sources)])].sort();
    const evidence = earliestEvidence([...old.flatMap(job => job.dateEvidence || []), ...bucket.flatMap(item => item.job.dateEvidence || reportedJobDates(item.source, item.job.url, item.job.publishedAt, item.job.sourceDate, item.job.firstSeenAt))]);
    const identityKeys = [...new Set([...bucket.map(item => employerJobIdentity(item.job)).filter((key): key is string => !!key), ...old.flatMap(job => job.identityKeys || [])])];
    const inheritedLevel = bucket.map(item => item.job.level).find(level => level !== "other");
    const specificLevel = jobLevel(preferred.title);
    const level = specificLevel === "other" && !/\b(?:senior|sr|staff|principal|lead|ii|iii|iv)\b/i.test(preferred.title) ? inheritedLevel || preferred.level : preferred.level;
    active.push(decorateDate({ ...preferred,descriptionPending:bucket.some(item=>item.direct&&item.job.descriptionPending)&&!bucket.some(item=>item.direct&&!item.job.descriptionPending),graduateRequired:!!graduateEvidence,educationReason:graduateEvidence?.educationReason, id: old[0]?.id || aliases[0], aliases, identityKeys, verifiedSources, level, sources, dateEvidence: evidence, observations: bucket.length, firstSeenAt: [...bucket.map(item => item.job.firstSeenAt), ...old.map(job => job.firstSeenAt)].sort()[0], lastSeenAt: now, unavailable: false, matchStatus: verifiedSources.length > 1 ? "matched" : "single", matchReason: verifiedSources.length > 1 ? identityKeys.length ? "Same employer requisition ID across sources" : "Same employer application URL across sources" : "One source; no cross-source confirmation", saved: undefined, applied: undefined, hidden: undefined, mark: undefined, possibleMatches: 0 }));
  }
  // Similar titles are review hints only. Different requisitions stay separate.
  const candidates = new Map<string, Job[]>();
  for (const job of active) { const key = `${companyKey(job.company)}|${titleKey(job.title)}|${locationKey(job.location)}`; const list = candidates.get(key) || []; list.push(job); candidates.set(key, list); }
  for (const list of candidates.values()) if (list.length > 1) for (const job of list) job.possibleMatches = list.length - 1;
  const cutoff = Date.parse(now) - 180 * 86400000;
  const archived = history.filter(job => !usedOld.has(job.id) && Date.parse(job.lastSeenAt || job.firstSeenAt) >= cutoff).sort((a, b) => (b.lastSeenAt || b.firstSeenAt).localeCompare(a.lastSeenAt || a.firstSeenAt)).slice(0, 10000).map(job => ({ ...job, unavailable: true }));
  return {
    jobs: [...active, ...archived],
    stats: { inputListings: observations.length, activeJobs: active.length, mergedListings: observations.length - active.length, matchedJobs: active.filter(job => job.matchStatus === "matched").length, confirmedDates: active.filter(job => job.dateStatus === "confirmed").length, datedJobs: active.filter(job => job.postedAt).length, possibleJobs: active.filter(job => job.possibleMatches).length, undatedJobs: active.filter(job => !job.postedAt).length },
  };
}
