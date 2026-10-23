import { companyJobSource, jobInRegion, graduateRequirement, type JobSource, type JobSourceRecord } from "./jobs";
const companies = [
  ["Stripe", "https://job-boards.greenhouse.io/stripe"], ["Cloudflare", "https://job-boards.greenhouse.io/cloudflare"], ["Databricks", "https://job-boards.greenhouse.io/databricks"], ["Airbnb", "https://job-boards.greenhouse.io/airbnb"], ["Robinhood", "https://job-boards.greenhouse.io/robinhood"], ["Roblox", "https://job-boards.greenhouse.io/roblox"], ["Figma", "https://job-boards.greenhouse.io/figma"], ["Discord", "https://job-boards.greenhouse.io/discord"], ["Lyft", "https://job-boards.greenhouse.io/lyft"], ["Duolingo", "https://job-boards.greenhouse.io/duolingo"],
  ["OpenAI", "https://jobs.ashbyhq.com/openai"], ["Notion", "https://jobs.ashbyhq.com/notion"], ["Ramp", "https://jobs.ashbyhq.com/ramp"], ["Linear", "https://jobs.ashbyhq.com/linear"], ["Vanta", "https://jobs.ashbyhq.com/vanta"], ["Palantir", "https://jobs.lever.co/palantir"], ["Zoox", "https://jobs.lever.co/zoox"], ["Spotify", "https://jobs.lever.co/spotify"],
];
const curated: JobSource[] = [
  { id: "simplify:internships", provider: "simplify", slug: "Summer2027-Internships", name: "Simplify · internships", url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md", link: "https://github.com/SimplifyJobs/Summer2027-Internships", enabled: true, intervalMinutes: 5, defaultLevel: "internship" },
  { id: "simplify:new-grad", provider: "simplify", slug: "New-Grad-Positions", name: "Simplify · new grad", url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md", link: "https://github.com/SimplifyJobs/New-Grad-Positions", enabled: true, intervalMinutes: 5, defaultLevel: "entry" },
  ...["Software-Engineer", "Data-Analysis"].flatMap(role => ["Internship", "New-Grad"].map(level => ({ id: `jobright:${role}:${level}`, provider: "jobright" as const, slug: `2026-${role}-${level}`, name: `Jobright · ${role.replaceAll("-", " ")} · ${level === "Internship" ? "internships" : "new grad"}`, url: `https://raw.githubusercontent.com/jobright-ai/2026-${role}-${level}/master/README.md`, link: `https://github.com/jobright-ai/2026-${role}-${level}`, enabled: true, intervalMinutes: 5, defaultLevel: level === "Internship" ? "internship" as const : "entry" as const }))),
];
export const defaultJobSources: JobSource[] = [...curated, ...companies.map(([name, url]) => companyJobSource(url, name))];

// Discover only allowlisted public ATS URLs already present in imported listings.
// No arbitrary website crawling or inferred company-name -> board-name mapping.
export const autoBoardLimit = 24;
export function discoverJobSources(records: JobSourceRecord[], limit = autoBoardLimit): JobSource[] {
  const known = new Set(records.map(record => record.source.id));
  const remaining = Math.max(0, Math.min(limit, 100 - records.length, autoBoardLimit - records.filter(record => record.source.discoveredFrom).length));
  const candidates = records.filter(record => record.source.enabled && ["simplify", "jobright"].includes(record.source.provider))
    .flatMap(record => record.snapshot.jobs.map(job => ({job, source: record.source.id})))
    .filter(({job}) => ["internship", "entry"].includes(job.level) && jobInRegion(job, "us") && !job.graduateRequired && !graduateRequirement(job.title))
    .sort((a,b) => b.job.firstSeenAt.localeCompare(a.job.firstSeenAt) || a.job.url.localeCompare(b.job.url));
  const found: JobSource[] = [];
  for (const {job, source} of candidates) {
    if (found.length >= remaining) break;
    try {
      const board = companyJobSource(job.url, job.company);
      if (known.has(board.id)) continue; // Paused boards stay paused.
      known.add(board.id);
      found.push({...board, discoveredFrom: source});
    } catch { /* Unsupported application destinations remain in the community feed. */ }
  }
  return found;
}
