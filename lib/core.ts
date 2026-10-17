import { z } from "zod";
import { dayKey, overview, safeUrl, taskSchema, type State, type Task } from "./life";

export const taskDraftSchema = taskSchema.omit({ id: true, done: true });
export type TaskDraft = z.infer<typeof taskDraftSchema>;
export type CoreSource = { kind: "task" | "event" | "email" | "note" | "briefing"; title: string; detail: string; url?: string };
export type CoreAction =
  | { type: "create_task"; requestId: string; draft: TaskDraft }
  | { type: "complete_task"; requestId: string; taskId: string; title: string }
  | { type: "chatgpt"; request: string };
export type CoreAnswer = { reply: string; sources: CoreSource[]; actions: CoreAction[]; mode: "workspace"; sourceUpdatedAt?: string };

const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function addDays(day: string, days: number) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function isDay(value: string) { const d = new Date(`${value}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; }
function latestSync(state: State) { return Object.values(state.sources).map(s => s.updatedAt).filter((s): s is string => !!s).sort().at(-1); }
function taskSource(task: Task): CoreSource { return { kind: "task", title: task.title, detail: `${task.category} · ${task.priority} priority${task.due ? ` · Due ${dayLabel(task.due)}` : ""}` }; }

export function connectedPrompt(request: string, siteUrl: string) {
  return `Help me with Life OS: ${siteUrl}\n\nUse the connected "Victor / Life OS" app for dashboard tasks, notes and saved context. Use my authorized Google Calendar, Gmail or Google Drive only when needed for this request. Use only the Gmail account already selected for Life OS and its primary calendar; do not add other accounts. Check the Life OS context for that account scope. For a midterm or deadline, find the actual date in an authorized calendar, email or course document and identify the source; do not guess. A Google Calendar event is different from a Life OS dashboard task. Ask for missing date/time details when needed before creating an event. Perform only the actions requested below.\n\nMy request:\n${request}`;
}

export function answerWorkspace(message: string, state: State, now = new Date(), requestId = crypto.randomUUID()): CoreAnswer {
  const clean = message.trim();
  const q = clean.toLowerCase().replace(/[’‘]/g, "'");
  const today = dayKey(now);
  const base = { mode: "workspace" as const };
  const handoff = (reply: string): CoreAnswer => ({ ...base, reply, sources: [], actions: [{ type: "chatgpt", request: clean }] });

  // A provider action is never silently substituted with a local dashboard write.
  const externalWrite = /\b(?:add|create|schedule|reschedule|move|delete|cancel|update|book|change)\b/.test(q) && /\b(?:calendar|meeting|appointment|event|google|gmail|email|slack|notion)\b/.test(q);
  if (externalWrite || /\b(?:send|forward|reply to)\b/.test(q) || /\b(?:google drive|syllabus|search online|browse|weather)\b/.test(q)) {
    return handoff("This needs your connected apps. Continue in ChatGPT to perform the request using the account selected for Life OS. Your request is prepared below; nothing has been changed yet.");
  }

  const create = clean.match(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:add|create|make)\s+(?:(?:a\s+new|a|new|another)\s+)?(?:dashboard\s+)?task\b\s*(?:(?:to|for)\s+|:\s*)?([\s\S]*)$/i)
    || clean.match(/^(?:please\s+)?remind me to\s+([\s\S]+)$/i);
  if (create) {
    let title = create[1].trim();
    if (!title) return { ...base, reply: "What should the task be called? Try: Add a task to review lecture notes tomorrow.", sources: [], actions: [] };
    let due = "";
    const date = title.match(/\s+(?:on\s+|by\s+|due\s+)?(today|tomorrow|\d{4}-\d{2}-\d{2})[.!]?$/i);
    if (date) { due = date[1].toLowerCase() === "today" ? today : date[1].toLowerCase() === "tomorrow" ? addDays(today, 1) : date[1]; title = title.slice(0, date.index).trim(); }
    if (due && !isDay(due)) return { ...base, reply: "That date is not valid. Use today, tomorrow, or a date such as 2026-10-20.", sources: [], actions: [] };
    const priority: TaskDraft["priority"] = /\b(?:urgent|high priority)\b/i.test(title) ? "high" : "normal";
    title = title.replace(/\s*\(?\b(?:urgent|high priority)\b\)?\s*/gi, " ").trim();
    const category: TaskDraft["category"] = /\b(?:study|lecture|exam|midterm|homework|assignment|class)\b/i.test(title) ? "School" : /\b(?:portfolio|project|resume|work|client)\b/i.test(title) ? "Work" : "Personal";
    const draft = taskDraftSchema.safeParse({ title, due, category, priority, minutes: 30 });
    if (!draft.success) return { ...base, reply: "Give the task a title between 1 and 240 characters.", sources: [], actions: [] };
    return { ...base, reply: "Here’s a dashboard task draft. Review it, then choose Add task to save it to Life OS.", sources: [], actions: [{ type: "create_task", requestId, draft: draft.data }] };
  }

  const complete = clean.match(/^(?:please\s+)?(?:mark|complete|finish)\s+(?:the\s+)?(?:task\s+)?["“]?(.+?)["”]?\s*(?:as\s+)?(?:complete|completed|done)?[.!]?$/i);
  if (complete) {
    const title = complete[1].replace(/\s+(?:as\s+)?(?:complete|completed|done)$/i, "").trim().toLowerCase();
    const matches = state.tasks.filter(t => !t.done && (t.title.toLowerCase() === title || t.title.toLowerCase().includes(title)));
    if (matches.length === 1) return { ...base, reply: "Mark this dashboard task complete?", sources: [taskSource(matches[0])], actions: [{ type: "complete_task", requestId, taskId: matches[0].id, title: matches[0].title }] };
    if (matches.length > 1) return { ...base, reply: "More than one task matches. Use the exact task title so I can choose the right one.", sources: matches.slice(0, 5).map(taskSource), actions: [] };
    return { ...base, reply: "I couldn’t find an open task with that title. Use its exact title, or open the Tasks view.", sources: [], actions: [] };
  }

  if (/\b(?:midterm|exam|quiz)\b/.test(q)) {
    const pattern = /midterm|exam|quiz/i;
    const events = state.events.filter(e => pattern.test(e.title) && new Date(e.end) >= now).map(e => ({ at: e.start, source: { kind: "event" as const, title: e.title, detail: dateLabel(e.start), ...(e.url ? { url: safeUrl(e.url) } : {}) } }));
    const tasks = state.tasks.filter(t => !t.done && pattern.test(t.title) && t.due && t.due >= today).map(t => ({ at: `${t.due}T23:59:00Z`, source: taskSource(t) }));
    const candidates = events.sort((a, b) => a.at.localeCompare(b.at));
    if (candidates.length) return { ...base, reply: `The next exam-related calendar event in your saved workspace is “${candidates[0].source.title}”. ${candidates[0].source.detail}. This is a saved snapshot; use connected ChatGPT to verify against your course materials.`, sources: candidates.slice(0, 3).map(c => c.source), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: state.sources.calendar?.updatedAt };
    if (tasks.length) return { ...base, reply: "I found an exam-related task, but its due date does not confirm when your exam takes place. Continue in ChatGPT to check the actual course schedule.", sources: tasks.slice(0, 3).map(t => t.source), actions: [{ type: "chatgpt", request: clean }] };
    return handoff("I don’t have a midterm date in your saved calendar or tasks. I won’t guess. Continue in ChatGPT to check your primary calendar, relevant email and course files.");
  }

  if (/\b(?:calendar|agenda|event|meeting|schedule|tomorrow)\b/.test(q)) {
    const day = /\btomorrow\b/.test(q) ? addDays(today, 1) : today;
    const next = /\bnext\b/.test(q);
    const events = state.events.filter(e => next ? new Date(e.end) >= now : dayKey(new Date(e.start)) === day).sort((a, b) => a.start.localeCompare(b.start)).slice(0, next ? 1 : 8);
    if (!events.length) return handoff(`Your saved calendar snapshot has no ${next ? "upcoming events" : day === today ? "events for today" : "events for tomorrow"}. You can check the live primary calendar in ChatGPT.`);
    return { ...base, reply: next ? `Your next saved event is “${events[0].title}”, ${dateLabel(events[0].start)}.` : `Here’s your saved agenda for ${day === today ? "today" : "tomorrow"}, in Pacific time.`, sources: events.map(e => ({ kind: "event", title: e.title, detail: `${dateLabel(e.start)}${e.location ? ` · ${e.location}` : ""}`, ...(e.url ? { url: safeUrl(e.url) } : {}) })), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: state.sources.calendar?.updatedAt };
  }

  if (/\b(?:emails?|inbox|messages?)\b/.test(q)) {
    const emails = [...state.emails].sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high")).slice(0, 5);
    if (!emails.length) return handoff("There are no email summaries saved yet. Use connected ChatGPT for a fresh inbox lookup.");
    return { ...base, reply: "These are the saved email summaries that may need your attention. Open a source to read the original, or use ChatGPT for a fresh lookup.", sources: emails.map(e => ({ kind: "email", title: e.subject, detail: `${e.sender} · ${e.summary}`, url: safeUrl(e.url) })), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: state.sources.gmail?.updatedAt };
  }

  if (/\b(?:note|notes)\b/.test(q) && !/\b(?:save|add|write|change)\b/.test(q)) {
    return { ...base, reply: state.note ? "Here’s your saved workspace note." : "Your workspace note is empty. Add one in Quick notes, or ask connected ChatGPT to save one.", sources: state.note ? [{ kind: "note", title: "Quick note", detail: state.note.slice(0, 3000) }] : [], actions: [] };
  }

  if (/\b(?:priorit(?:y|ies)|tasks?|attention|briefing|focus|my day|plan today|need to do)\b/.test(q) || /^(?:hi|hello|hey)[.!]?$/i.test(q)) {
    const o = overview(state.tasks, state.events, today);
    const tasks = o.open.slice(0, 5);
    if (!tasks.length && state.briefing) return { ...base, reply: state.briefing.summary, sources: state.briefing.priorities.map((p, i) => ({ kind: "briefing", title: `Priority ${i + 1}`, detail: p })), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: state.briefing.generatedAt };
    return { ...base, reply: tasks.length ? `${o.summary} Here are your highest priorities.` : "You have no open dashboard tasks yet. Try “Add a task to review lecture notes tomorrow”, or continue in ChatGPT for a broader plan.", sources: tasks.map(taskSource), actions: [{ type: "chatgpt", request: clean }] };
  }
  return handoff("For broader questions, research, live information or actions across your apps, use connected ChatGPT. This panel can look up saved workspace information and prepare dashboard tasks.");
}
