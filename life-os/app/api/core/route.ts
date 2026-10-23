import { z } from "zod";
import { answerWorkspace } from "@/lib/core";
import { response, sameOrigin, state } from "@/lib/store";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
const input = z.object({ message: z.string().trim().min(1).max(3000), requestId: z.string().uuid() });
export async function GET() {
  return response({ mode: "workspace_and_chatgpt", workspace: ["Saved agenda, inbox, notes and task lookups", "Confirmed dashboard task creation and completion"], connected: "Use ChatGPT with the Life OS app for live information and connected-app actions. ChatGPT opens separately; no embedded model is configured." });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin rejected." }, 403);
  if (!await getChatGPTUser()) return response({ error: "Sign in to use your workspace assistant.", signInPath: chatGPTSignInPath("/") }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 14000) return response({ error: "Keep your request under 3,000 characters." }, 413);
    const body = input.parse(JSON.parse(raw));
    return response(answerWorkspace(body.message, await state(), new Date(), body.requestId));
  } catch { return response({ error: "I couldn’t read your workspace. Try again in a moment." }, 400); }
}
