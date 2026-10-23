import { z } from "zod";
import { pollJobs, readJobs } from "@/lib/jobs-store";
import { response, save } from "@/lib/store";
export const dynamic = "force-dynamic";
// Owner-private service writer. Sites dispatch validates its service credential.
// This endpoint fetches only configured public job feeds; no Google credentials are used.
export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.has("status")) { const feed = await readJobs(new URLSearchParams({ group: "all" })); return response({ stats: feed.stats, matching: feed.total, groups: feed.groups, reconciliation: feed.reconciliation, sources: feed.sources, background: feed.background }); }
    return response(await pollJobs());
  } catch { return response({ error: "Job refresh failed. Existing snapshots are preserved." }, 503); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return response({ error: "Origin rejected." }, 403);
  try {
    const raw = await request.text(); if (raw.length > 1000) return response({ error: "Request too large." }, 413);
    const input = z.object({ enabled: z.boolean(), minutes: z.number().int().min(5).max(1440), automationId: z.string().min(1).max(200) }).strict().parse(JSON.parse(raw));
    await save("job:background", "job_control", input);
    return response({ ok: true });
  } catch { return response({ error: "Invalid background schedule metadata." }, 400); }
}
