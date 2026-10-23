import { z } from "zod";
import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { response, sameOrigin } from "@/lib/store";
import { syncCanvas, connectCanvas, disconnectCanvas } from "@/lib/canvas-store";
export const dynamic = "force-dynamic";
export async function GET() {
  // Owner-private platform boundary also permits the morning service updater.
  try { return response(await syncCanvas()); }
  catch { return response({ error: "Couldn’t load bCourses. Try again." }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin rejected." }, 403);
  if (!await getChatGPTUser()) return response({ error: "Sign in before connecting bCourses.", signInPath: chatGPTSignInPath("/") }, 401);
  try {
    const raw = await request.text(); if (raw.length > 3000) return response({ error: "Feed link is too long." }, 413);
    const body = z.discriminatedUnion("action", [z.object({ action: z.literal("connect"), feedUrl: z.string().min(1).max(2000) }), z.object({ action: z.literal("refresh") }), z.object({ action: z.literal("disconnect") })]).parse(JSON.parse(raw));
    const result = body.action === "connect" ? await connectCanvas(body.feedUrl) : body.action === "disconnect" ? await disconnectCanvas() : await syncCanvas(true);
    return response(result);
  } catch { return response({ error: "Couldn’t connect. Use bCourses → Calendar → Calendar Feed and copy the full link. Your previous connection is preserved." }, 400); }
}
