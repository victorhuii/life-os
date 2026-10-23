import { coreActionSchema, createTaskOnce, completeTask } from "@/lib/core-actions";
import { response, sameOrigin } from "@/lib/store";
import { chatGPTSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin rejected." }, 403);
  if (!await getChatGPTUser()) return response({ error: "Sign in to save changes.", signInPath: chatGPTSignInPath("/") }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 12000) return response({ error: "Request too large." }, 413);
    const action = coreActionSchema.parse(JSON.parse(raw));
    if (action.type === "create_task") {
      const result = await createTaskOnce(action.draft, action.requestId);
      return response({ ok: true, task: result.task, message: result.created ? "Task added to Life OS." : "This task was already added. No duplicate was created." });
    }
    const task = await completeTask(action.taskId);
    return response({ ok: true, task, message: "Task marked complete in Life OS." });
  } catch (error) { return response({ error: error instanceof Error && !error.message.startsWith("[") ? error.message : "Couldn’t save the task. Check the details and try again." }, 400); }
}
