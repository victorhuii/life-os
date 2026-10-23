import { z } from "zod";

export const jobProviders = ["greenhouse", "lever", "ashby", "simplify", "jobright"] as const;
export type JobProvider = typeof jobProviders[number];
export type JobCategory = "software" | "fullstack" | "data-science" | "data-analysis";
export type JobLevel = "internship" | "entry" | "other";
export const jobParserVersion = 7;
export type JobCompanyGroup = "big" | "growth" | "startup";
export type JobDateEvidence = { source: string; url: string; date: string; precision: "instant" | "day"; kind: "reported" | "estimated"; yearInferred?: boolean };
export type Job = { descriptionPending?:boolean; graduateRequired?:boolean;educationReason?:string; id: string; title: string; company: string; location: string; remote: boolean; category: JobCategory; level: JobLevel; url: string; publishedAt?: string; providerJobId?:string; dateCheckedAt?:string; changedAt?: string; sourceDate?: string; firstSeenAt: string; sources: string[]; baseline?: boolean; mark?: "saved" | "applied" | "hidden"; unavailable?: boolean; saved?: boolean; applied?: boolean; hidden?: boolean; aliases?: string[]; identityKeys?: string[]; verifiedSources?: string[]; dateEvidence?: JobDateEvidence[]; postedAt?: string; postedPrecision?: "instant" | "day"; dateStatus?: "confirmed" | "source" | "estimated" | "unknown"; matchStatus?: "matched" | "single"; matchReason?: string; observations?: number; possibleMatches?: number; lastSeenAt?: string; companyGroup?: JobCompanyGroup; companyGroupReason?: string; companyGroupSource?: string; companyGroupOverride?: JobCompanyGroup };
export type JobSource = { id: string; provider: JobProvider; slug: string; name: string; url: string; link: string; enabled: boolean; intervalMinutes: number; defaultLevel?: JobLevel; region?: "eu"; discoveredFrom?: string };
export type JobSnapshot = { jobs: Job[]; lastAttempt?: string; lastSuccess?: string; nextCheck?: string; error?: string; failures?: number; etag?: string; lastModified?: string; totalListings?: number; parserVersion?: number; dateRetryAt?:string; compact?:boolean };
export type JobSourceRecord = { source: JobSource; snapshot: JobSnapshot };
export class JobFeedError extends Error { constructor(message: string, public retrySeconds = 300) { super(message); } }
const instant = (value: unknown) => { const date = typeof value === "number" || typeof value === "string" ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined; };
export function jobCategory(title: string, description = ""): JobCategory | undefined {
  if (/\b(?:recruiter|recruiting|account executive|sales engineer|engineering manager|director|vice president|head of)\b/i.test(title)) return;
  if (/data scien|machine learning|applied scientist|\b(?:ai|ml) engineer/i.test(title)) return "data-science";
  if (/data analy|analytics engineer|business intelligence|\bbi (?:engineer|analyst)/i.test(title)) return "data-analysis";
  // Explicit insight/analytics roles belong alongside data analysis, even without "data" in the title.
  if (/\b(?:business(?: systems)?|product|marketing|growth|insights?|analytics|operations research|quantitative) analy(?:st|tics)\b|\b(?:business|customer|consumer|product|marketing|strategic) insights?\b|\bdecision scien(?:tist|ce)\b/i.test(title)) return "data-analysis";
  // Broader business functions need description evidence of analytical work.
  if (/\b(?:financial|finance|risk|credit|fraud|pricing|revenue|supply[ -]chain|commercial|operations|strategy|sales) analyst\b/i.test(title)
    && /\b(?:SQL|Python|R programming|Tableau|Power BI|statistical (?:analysis|modeling|modelling)|predictive (?:analytics|modeling|modelling)|data (?:analysis|analytics|science|visualization|visualisation)|A\/B test(?:ing)?|experiment(?:ation| design)|forecasting|dashboards?)\b/i.test(plainJobText(description.slice(0, 100000)))) return "data-analysis";
  if (/full[ -]?stack/i.test(title)) return "fullstack";
  if (/software|\bswe\b|(?:front|back)[ -]?end|\b(?:web|mobile|platform|application) (?:developer|engineer)|\bdeveloper\b|\b(?:data|infrastructure|test|quality assurance|qa|site reliability) engineer/i.test(title)) return "software";
}
export function jobLevel(title: string, fallback?: JobLevel, description = "", employmentType = ""): JobLevel {
  if (/\bintern(?:ship)?\b|co[ -]?op/i.test(title)) return "internship";
  if (/\b(?:senior|sr\.?|staff|principal|lead|ii|iii|iv)\b/i.test(title)) return "other";
  if (/new[ -]?grad|\bgraduate\b|entry[ -]?level|\bjunior\b|\bjr\.?\b|\b(?:engineer|developer|scientist|analyst) (?:i|1)\b|\bassociate (?:software|data|engineer|developer|business|product|marketing|analytics|insights?|operations|financial|risk|strategy|growth|quantitative)/i.test(title)) return "entry";
  if (/^(?:intern|internship|co[ -]?op)$/i.test(employmentType.trim())) return "internship";
  const text = plainJobText(description.slice(0, 100000));
  if (/\b(?:this (?:role|position|opportunity) is (?:an? )?(?:paid )?internship|(?:seeking|hiring|looking for) (?:an? )?(?:software engineering |data science )?intern)\b/i.test(text)) return "internship";
  if (/\b(?:this (?:role|position) is (?:for |open to |designed for )?(?:new|recent) graduates|(?:seeking|hiring|looking for) (?:new|recent) graduates)\b/i.test(text)) return "entry";
  return fallback || "other";
}
export function jobInRegion(job: Pick<Job, "location" | "remote">, region: string) {
  if (region === "all") return true;
  if (job.remote) return true;
  if (region === "bay") return /san francisco|\bsf\b|bay area|san jose|palo alto|mountain view|sunnyvale|menlo park|foster city|redwood city|berkeley|oakland|santa clara|san mateo|cupertino/i.test(job.location);
  return /united states|\busa\b|\bu\.s\.|san francisco|new york|seattle|boston|chicago|austin|california|texas|washington|massachusetts|colorado|georgia|florida|pennsylvania|michigan|illinois|virginia|carolina|ohio|arizona|minnesota|wisconsin|tennessee|utah|oregon|connecticut|maryland|new jersey|\bnyc\b/i.test(job.location) || /(?:,\s*|^)(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\b|$)/.test(job.location);
}
export function jobUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new JobFeedError("The source returned an invalid application link.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|ref$|source$|gh_src$|lever-source$)/i.test(key)) url.searchParams.delete(key);
  if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) url.hostname = "job-boards.greenhouse.io";
  url.searchParams.sort();
  return url.href;
}
export function plainJobText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/[🔥🛂🇺🇸🎓*]/gu, "").replace(/\s+/g, " ").trim();
}
async function jobId(url: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url)); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("").slice(0, 32); }
type RawJob = { title: string; company: string; location: string; url: string; remote?: boolean; publishedAt?: unknown; changedAt?: unknown; sourceDate?: string;providerJobId?:string;description?:string;employmentType?:string;descriptionPending?:boolean };
/** Exclude explicit graduate-only eligibility, not ordinary new-grad roles or preferred degrees. */
export function graduateRequirement(title:string,description=''):string|undefined {
  const advanced=/\b(?:master['’]s|masters|master\s+(?:of|degree)|ph\.?\s?d\.?|doctoral|doctorate|post[- ]?graduate|graduate\s+(?:degree|student|studies|school|level)|mba)\b|\bM\.?S\.?(?:c\.?)?(?=\s|[)/,&-]|$)/i;
  const bachelors=/\b(?:bachelor|baccalaureate|undergraduate|B\.?S\.?|B\.?A\.?|BSc)\b/i;
  if(advanced.test(title)&&!bachelors.test(title))return 'Graduate-only degree or enrollment in title';
  const decoded=description.slice(0,100000).replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&rsquo;|&#(?:39|8217|x27|x2019);/gi,"'");
  const lines=decoded.replace(/<\/(?:p|li|h[1-6]|div)>|<br\s*\/?\s*>/gi,'\n').split(/\n|[.!?]\s+(?=[A-Z])/).map(plainJobText).filter(Boolean);
  let section:'required'|'preferred'|'other'='other';
  for(const line of lines){
    if(line.length<100&&/preferred|nice.to.have|bonus|desired qualifications/i.test(line))section='preferred';
    else if(line.length<100&&/^(?:minimum|basic|required|your|what you.bring)?\s*(?:qualifications|requirements|education)[:\s]*$/i.test(line))section='required';
    else if(line.length<100&&/^(?:responsibilities|benefits|about us|what you.ll do|our team)/i.test(line))section='other';
    if(!advanced.test(line)||bachelors.test(line)||/or\s+(?:equivalent\s+)?(?:professional\s+|practical\s+|work\s+|industry\s+)?experience|equivalent\s+experience/i.test(line))continue;
    const mandatory=/\brequired\b|\bmust\b/i.test(line);
    if((section==='preferred'||/\bpreferred\b|\bdesired\b|nice.to.have|\bbonus\b|\boptional\b|\ba plus\b|not required/i.test(line))&&!mandatory)continue;
    if(/not required/i.test(line))continue;
    if(section==='required'||mandatory||/\benroll|\bpursu|\bcandidate\b|\bcurrently\b|\bminimum\b|\bhold\b|\bcompleted\b|\bworking toward/i.test(line))return line.slice(0,240);
  }
}
export function reportedJobDates(source: string, url: string, publishedAt: unknown, sourceDate: string | undefined, observedAt: string): JobDateEvidence[] {
  const validDay = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;
  const validPublished = typeof publishedAt === "number" || typeof publishedAt === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(publishedAt) && validDay(publishedAt.slice(0, 10));
  const now = new Date(observedAt), published = validPublished ? instant(publishedAt) : undefined;
  if (published && Date.parse(published) <= now.getTime() + 86400000) return [{ source, url, date: published, precision: typeof publishedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ? "day" : "instant", kind: "reported" }];
  if (!sourceDate) return [];
  const text = sourceDate.trim();
  if (validDay(text) && Date.parse(text) <= now.getTime() + 86400000) return [{ source, url, date: new Date(text).toISOString(), precision: "day", kind: "reported" }];
  const month = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
  if (month) {
    const index = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month[1].toLowerCase().slice(0, 3));
    let year = month[3] ? Number(month[3]) : now.getUTCFullYear();
    let date = new Date(Date.UTC(year, index, Number(month[2])));
    if (!month[3] && date.getTime() > now.getTime() + 86400000) date = new Date(Date.UTC(--year, index, Number(month[2])));
    if (index >= 0 && date.getUTCMonth() === index && date.getUTCDate() === Number(month[2]) && date.getTime() <= now.getTime() + 86400000 && (month[3] || now.getTime() - date.getTime() <= 14 * 86400000)) return [{ source, url, date: date.toISOString(), precision: "day", kind: "reported", ...(!month[3] ? { yearInferred: true } : {}) }];
  }
  const age = text.match(/^(\d{1,3})\s*d(?:ays?)?$/i);
  if (age) { const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - Number(age[1]))); return [{ source, url, date: date.toISOString(), precision: "day", kind: "estimated" }]; }
  return [];
}
async function normalizeJob(raw: RawJob, source: JobSource, now: string): Promise<Job | null> {
  const title = plainJobText(raw.title).slice(0, 400), category = jobCategory(title, raw.description);
  if (!category || !raw.url) return null;
  const url = jobUrl(raw.url.replaceAll("&amp;", "&"));
  const location = plainJobText(raw.location || "Location not specified").slice(0, 500);
  const educationReason=graduateRequirement(title,raw.description);
  return { descriptionPending:raw.descriptionPending,graduateRequired:!!educationReason,educationReason,id: await jobId(url), title, company: plainJobText(raw.company).slice(0, 240), location, remote: !!raw.remote || /\bremote\b/i.test(location), category, level: jobLevel(title, source.defaultLevel, raw.description, raw.employmentType), url, providerJobId:raw.providerJobId,publishedAt: instant(raw.publishedAt), changedAt: instant(raw.changedAt), sourceDate: raw.sourceDate, dateEvidence: reportedJobDates(source.id, url, raw.publishedAt, raw.sourceDate, now), firstSeenAt: now, sources: [source.id] };
}
function array(value: unknown, label: string): Record<string, any>[] { if (!Array.isArray(value)) throw new JobFeedError(`The ${label} feed format changed. Its last saved jobs are preserved.`); return value; }
export async function parseJobFeed(source: JobSource, body: string, now: string): Promise<{ jobs: Job[]; total: number }> {
  const raw: RawJob[] = [];
  if (source.provider === "greenhouse") {
    const feed = JSON.parse(body);
    const entries = array(feed.jobs, "Greenhouse");
    for (const item of entries) { if (typeof item.title !== "string" || !item.id) throw new JobFeedError("A Greenhouse listing is incomplete."); raw.push({ title: item.title, company: source.name, location: item.location?.name || "", url: item.absolute_url, providerJobId:String(item.id),publishedAt: item.first_published, changedAt: item.updated_at, descriptionPending:feed._vectorCompact===true,description:item.content||"" }); }
  } else if (source.provider === "ashby") {
    for (const item of array(JSON.parse(body).jobs, "Ashby")) { if (item.isListed === false) continue; if (typeof item.title !== "string" || !item.jobUrl) throw new JobFeedError("An Ashby listing is incomplete."); raw.push({ title: item.title, company: source.name, location: [item.location, ...(item.secondaryLocations || []).map((l: any) => l.location)].filter(Boolean).join(" · "), url: item.jobUrl, remote: item.isRemote || item.workplaceType === "Remote", publishedAt: item.publishedAt,employmentType:item.employmentType,description:item.descriptionHtml||item.descriptionPlain||"" }); }
  } else if (source.provider === "lever") {
    for (const item of array(JSON.parse(body), "Lever")) { if (typeof item.text !== "string" || !item.hostedUrl) throw new JobFeedError("A Lever listing is incomplete."); raw.push({ title: item.text, company: source.name, location: item.categories?.allLocations?.join(" · ") || item.categories?.location || "", url: item.hostedUrl, remote: item.workplaceType === "remote",employmentType:item.categories?.commitment,description:[item.description||item.descriptionPlain,...(Array.isArray(item.lists)?item.lists.map((list:any)=>`<h3>${list.text||""}</h3>${list.content||""}`):[]),item.additional||item.additionalPlain].filter(Boolean).join("\n") }); }
  } else if (source.provider === "simplify") {
    let company = "";
    for (const match of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => cell[1]);
      if (cells.length < 5) continue;
      const name = plainJobText(cells[0]); if (name && name !== "↳") company = name;
      const link = [...cells[3].matchAll(/href=["'](https:\/\/[^"']+)["']/gi)].map(m => m[1]).find(url => !url.includes("simplify.jobs"));
      if (!link || /🔒/.test(cells[3]) || !company) continue;
      raw.push({ company, title: plainJobText(cells[1]), location: cells[2].replace(/<br\s*\/?\s*>/gi, " · "), url: link, sourceDate: plainJobText(cells[4]).slice(0, 40) });
    }
    if (!raw.length && !/<table\b/i.test(body)) throw new JobFeedError("The Simplify list format changed. Saved jobs are preserved.");
  } else {
    let company = "";
    for (const row of body.split("\n")) {
      if (!row.startsWith("|")) continue;
      const cells = row.split("|").slice(1, -1).map(cell => cell.trim());
      if (cells.length < 5) continue;
      const url = cells[1].match(/\]\((https:\/\/[^)]+)\)/)?.[1];
      if (!url || /🔒/.test(row)) continue;
      const name = plainJobText(cells[0]);
      if (name && name !== "↳") company = name;
      if (!company) continue;
      raw.push({ company, title: plainJobText(cells[1]), location: plainJobText(cells[2]), remote: /remote/i.test(cells[3]), url, sourceDate: plainJobText(cells[4]).slice(0, 40) });
    }
    if (!raw.length && !/\|\s*Company\s*\|/i.test(body)) throw new JobFeedError("The Jobright list format changed. Saved jobs are preserved.");
  }
  const jobs: Job[] = [];
  for (let i = 0; i < raw.length; i += 100) { const group = await Promise.all(raw.slice(i, i + 100).map(item => normalizeJob(item, source, now))); for (const item of group) if (item) jobs.push(item); }
  return { jobs: [...new Map(jobs.map(job => [job.id, job])).values()], total: raw.length };
}
export function companyJobSource(input: string, company: string): JobSource {
  let url: URL; try { url = new URL(input); } catch { throw new JobFeedError("Paste a Greenhouse, Lever or Ashby company board URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new JobFeedError("Use a direct HTTPS company board URL.");
  if(url.hostname==="l.instagram.com"){try{url=new URL(url.searchParams.get("u")||"");}catch{throw new JobFeedError("Copy the job application link from the story.");}if(url.protocol!=="https:"||url.username||url.password||url.port)throw new JobFeedError("Use a direct HTTPS company board URL.");}
  if(["boards.greenhouse.io","job-boards.greenhouse.io"].includes(url.hostname)&&url.pathname.startsWith("/embed/")){const board=url.searchParams.get("for");if(board)url.pathname='/'+board;}
  if (url.hostname === "joinhandshake.com" || url.hostname.endsWith(".joinhandshake.com")) throw new JobFeedError("Handshake is an external search option. Open the listing and copy its employer’s Greenhouse, Lever or Ashby application link to monitor that company.");
  const parts = url.pathname.split("/").filter(Boolean);
  const slug = parts[0];
  if (!slug || !/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) throw new JobFeedError("That board name is invalid.");
  let provider: JobProvider, endpoint: string, region: "eu" | undefined;
  if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) { provider = "greenhouse"; endpoint = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`; }
  else if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) { provider = "lever"; region = url.hostname.includes(".eu.") ? "eu" : undefined; endpoint = `https://${region ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${slug}?mode=json&limit=100`; }
  else if (url.hostname === "jobs.ashbyhq.com") { provider = "ashby"; endpoint = `https://api.ashbyhq.com/posting-api/job-board/${slug}`; }
  else throw new JobFeedError("Supported company boards are Greenhouse, Lever and Ashby. LinkedIn and Jobright search URLs aren’t company feeds.");
  return { id: `${provider}:${region ? "eu:" : ""}${slug}`, provider, slug, name: company.trim().slice(0, 120) || slug, url: endpoint, link: `${url.origin}/${slug}`, enabled: true, intervalMinutes: 1, region };
}
export const jobMarkSchema = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), mark: z.enum(["saved", "applied", "hidden", "none"]) });
