import { z } from "zod";
import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { response, sameOrigin } from "@/lib/store";
import { companyJobSource, JobFeedError, jobMarkSchema } from "@/lib/jobs";
import { jobSources, markJob, pollJobs, readJobs, saveJobSource, setJobProgress, setCompanyGroup, setJobDiscovery } from "@/lib/jobs-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await getChatGPTUser()) return response({ error: "Sign in to V.E.C.T.O.R. to view Jobs.", signInPath: chatGPTSignInPath("/") }, 401);
  try { const params=new URL(request.url).searchParams;if(params.has("since")&&(!Number.isFinite(Date.parse(params.get("since")!))||Date.parse(params.get("since")!)>Date.now()))return response({error:"Choose a valid previous check time."},400);if(params.has("until")&&(!params.has("since")||!Number.isFinite(Date.parse(params.get("until")!))||Date.parse(params.get("until")!)>Date.now()||Date.parse(params.get("until")!)<=Date.parse(params.get("since")!)))return response({error:"Choose a valid summary end time."},400);return response(await readJobs(params)); } catch { return response({ error: "Couldn’t load Jobs. Try again shortly." }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin rejected." }, 403);
  if (!await getChatGPTUser()) return response({ error: "Sign in to manage Jobs.", signInPath: chatGPTSignInPath("/") }, 401);
  try {
    const raw = await request.text(); if (raw.length > 4000) return response({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);
    if (body.action === "refresh") return response(await pollJobs(!!body.force));
    if (body.action === "mark") { const input = jobMarkSchema.parse(body); await markJob(input.id, input.mark); return response({ ok: true }); }
    if (body.action === "progress") { const input = z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), saved: z.boolean().optional(), applied: z.boolean().optional(), hidden: z.boolean().optional() }).parse(body); const { id, ...patch } = input; if (!Object.keys(patch).length) return response({ error: "Choose an application or bookmark change." }, 400); await setJobProgress(id, patch); return response({ ok: true }); }
    if (body.action === "company_group") { const input = z.object({ company: z.string().trim().min(1).max(240), group: z.enum(["big", "growth", "startup", "auto"]) }).parse(body); await setCompanyGroup(input.company, input.group); return response({ ok: true }); }
    if (body.action === "discovery") { const input = z.object({enabled:z.boolean()}).parse(body); await setJobDiscovery(input.enabled); return response({ok:true}); }
    if (body.action === "source") { const input = z.object({ name: z.string().trim().min(1).max(120), url: z.string().url().max(1500) }).parse(body); await saveJobSource(companyJobSource(input.url, input.name)); return response({ ok: true }); }
    if (body.action === "toggle_source") { const input = z.object({ id: z.string().max(200), enabled: z.boolean() }).parse(body); const record = (await jobSources()).find(record => record.source.id === input.id); if (!record) return response({ error: "Source not found." }, 404); await saveJobSource({ ...record.source, enabled: input.enabled }); return response({ ok: true }); }
    return response({ error: "Unknown Jobs action." }, 400);
  } catch (error) { return response({ error: error instanceof JobFeedError ? error.message : "Check the Jobs fields and try again." }, 400); }
}
