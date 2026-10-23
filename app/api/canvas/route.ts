import { z } from "zod";
import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { response, sameOrigin } from "@/lib/store";
import { syncCanvas, connectCanvas, disconnectCanvas } from "@/lib/canvas-store";
import { CanvasConnectionError } from "@/lib/canvas";
export const dynamic = "force-dynamic";
export async function GET() {
  // Owner-private platform boundary also permits the morning service updater.
  try { return response(await syncCanvas()); }
  catch { return response({ error: "Couldn’t load bCourses. Try again." }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin rejected." }, 403);
  if (!await getChatGPTUser()) return response({ error: "Sign in to V.E.C.T.O.R. before connecting bCourses.", signInPath: chatGPTSignInPath("/") }, 401);
  try {
    const raw = await request.text(); if (raw.length > 3000) return response({ error: "Feed link is too long." }, 413);
    const body = z.discriminatedUnion("action", [z.object({ action: z.literal("connect"), feedUrl: z.string().min(1).max(2000) }), z.object({ action: z.literal("refresh") }), z.object({ action: z.literal("disconnect") })]).parse(JSON.parse(raw));
    const result = body.action === "connect" ? await connectCanvas(body.feedUrl) : body.action === "disconnect" ? await disconnectCanvas() : await syncCanvas(true);
    return response(result);
  } catch (error) {
    if (error instanceof CanvasConnectionError) return response({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError) return response({ error: "Choose a bCourses action and enter the full Calendar Feed link." }, 400);
    return response({ error: "V.E.C.T.O.R. couldn’t save the bCourses connection. Try again shortly." }, 503);
  }
}
