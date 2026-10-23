import { z } from "zod";
import { database, save } from "./store";
import { taskSchema, type Task } from "./life";
import { taskDraftSchema } from "./core";

export const coreActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_task"), requestId: z.string().uuid(), draft: taskDraftSchema }),
  z.object({ type: z.literal("complete_task"), requestId: z.string().uuid(), taskId: z.string().min(1).max(100) }),
]);
export async function createTaskOnce(input: unknown, requestId: string) {
  const draft = taskDraftSchema.parse(input);
  const id = z.string().uuid().parse(requestId);
  const task = taskSchema.parse({ id, ...draft, done: false });
  const result = await database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES (?,'task',?,?) ON CONFLICT(id) DO NOTHING").bind(`task:${id}`, JSON.stringify(task), new Date().toISOString()).run();
  const row = await database().prepare("SELECT payload FROM life_records WHERE id=? AND kind='task'").bind(`task:${id}`).first<{ payload: string }>();
  if (!row) throw new Error("Task save was not confirmed.");
  const stored = taskSchema.parse(JSON.parse(row.payload));
  if (stored.title !== task.title || stored.due !== task.due || stored.category !== task.category || stored.priority !== task.priority || stored.minutes !== task.minutes) throw new Error("This request ID already belongs to a different task. Start a new request.");
  return { task: stored, created: result.meta.changes > 0 };
}
export async function completeTask(id: string, done = true) {
  const taskId = z.string().min(1).max(100).parse(id);
  const row = await database().prepare("SELECT payload FROM life_records WHERE id=? AND kind='task'").bind(`task:${taskId}`).first<{ payload: string }>();
  if (!row) throw new Error("That task could not be found. Read the workspace again.");
  const task: Task = taskSchema.parse({ ...JSON.parse(row.payload), done: z.boolean().parse(done) });
  await save(`task:${taskId}`, "task", task);
  return task;
}
