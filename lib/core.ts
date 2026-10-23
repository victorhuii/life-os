import { z } from "zod";
import { dayKey, eventOnDay, mailAccount, mailboxes, mailboxSource, overview, safeUrl, taskSchema, type State, type Task } from "./life";

export const taskDraftSchema = taskSchema.omit({ id: true, done: true });
export type TaskDraft = z.infer<typeof taskDraftSchema>;
export type CoreSource = { kind: "task" | "event" | "email" | "note" | "briefing" | "assignment"; title: string; detail: string; url?: string };
export type CoreAction =
  | { type: "create_task"; requestId: string; draft: TaskDraft }
  | { type: "complete_task"; requestId: string; taskId: string; title: string }
  | { type: "chatgpt"; request: string };
export type CoreAnswer = { reply: string; sources: CoreSource[]; actions: CoreAction[]; mode: "workspace"; sourceUpdatedAt?: string };

const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function addDays(day: string, days: number) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function isDay(value: string) { const d = new Date(`${value}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; }
function taskSource(task: Task): CoreSource { return { kind: "task", title: task.title, detail: `${task.category} · ${task.priority} priority${task.due ? ` · Due ${dayLabel(task.due)}` : ""}` }; }

export function connectedPrompt(request: string, siteUrl: string) {
  return `Help me with V.E.C.T.O.R.: ${siteUrl}\n\nUse the connected "V.E.C.T.O.R." app for dashboard tasks, bCourses deadlines, notes and saved context. bCourses feed items show dated assignments and course events, not submission status or grades. Use my authorized Google Calendar, Gmail or Google Drive only when needed for this request. Use only these Gmail inboxes, keeping each account separate: Main (victorhui94@gmail.com), Berk (huiv@berkeley.edu), and Cal Hacks (vhui@hackberkeley.org). Google Calendar is limited to huiv@berkeley.edu only. Verify the active provider profile before reading; never infer mailbox identity from a recipient address. Do not add other accounts without authorization. Check the V.E.C.T.O.R. context for that account scope. For a midterm or deadline, find the actual date in an authorized calendar, email or course document and identify the source; do not guess. A Google Calendar event is different from a V.E.C.T.O.R. dashboard task. Ask for missing date/time details when needed before creating an event. Perform only the actions requested below.\n\nMy request:\n${request}`;
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
    return handoff("This action needs the original app or ChatGPT with your connected account. V.E.C.T.O.R. can look up saved information and prepare dashboard tasks here. No external changes were made.");
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
    return { ...base, reply: "Here’s a dashboard task draft. Review it, then choose Add task to save it to V.E.C.T.O.R..", sources: [], actions: [{ type: "create_task", requestId, draft: draft.data }] };
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
    const pattern = /\bmidterm\b/.test(q) ? /midterm/i : /\bquiz\b/.test(q) ? /quiz/i : /midterm|exam/i;
    const events = state.events.filter(e => pattern.test(e.title) && new Date(e.end) >= now).map(e => ({ at: new Date(e.start).getTime(), source: { kind: "event" as const, title: e.title, detail: `${e.source} · ${e.allDay ? dayLabel(dayKey(new Date(e.start))) : dateLabel(e.start)}`, ...(e.url ? { url: safeUrl(e.url) } : {}) }, updatedAt: state.sources.calendar?.updatedAt }));
    const coursework = (state.coursework?.items || []).filter(item => pattern.test(item.title) && (item.allDay ? item.due >= today : new Date(item.due) >= now)).map(item => ({ at: new Date(item.allDay ? `${item.due}T12:00:00Z` : item.due).getTime(), source: { kind: "assignment" as const, title: item.title, detail: `${item.course || "bCourses"} · ${item.allDay ? dayLabel(item.due) : dateLabel(item.due)}${state.coursework?.status === "error" ? " · Refresh failed; saved copy" : ""}`, ...(item.url ? { url: item.url } : {}) }, updatedAt: state.coursework?.updatedAt }));
    const candidates = [...events, ...coursework].sort((a, b) => a.at - b.at);
    if (candidates.length) return { ...base, reply: `The next matching exam-related item in your saved sources is “${candidates[0].source.title}”. ${candidates[0].source.detail}. Check the original course page for the exam instructions and any schedule changes.`, sources: candidates.slice(0, 3).map(c => c.source), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: candidates[0].updatedAt };
    const tasks = state.tasks.filter(t => !t.done && pattern.test(t.title) && t.due && t.due >= today);
    if (tasks.length) return { ...base, reply: "I found an exam-related task, but its due date does not confirm when your exam takes place. Continue in ChatGPT to check the actual course schedule.", sources: tasks.slice(0, 3).map(taskSource), actions: [{ type: "chatgpt", request: clean }] };
    return handoff("I don’t have a matching exam date in your saved calendar, bCourses feed or tasks. I won’t guess. Continue in ChatGPT to check your primary calendar, relevant email and course files.");
  }

  if (/\b(?:assignments?|homework|coursework|bcourses|canvas|deadlines?|due next|what.?s due)\b/.test(q)) {
    const coursework = state.coursework;
    if (!coursework?.connected) return { ...base, reply: "Connect your bCourses Calendar Feed in Connections to see actual course deadlines here. I don’t have your assignments yet. You can also use connected ChatGPT to check authorized course files.", sources: [], actions: [{ type: "chatgpt", request: clean }] };
    const items = coursework.items.filter(item => item.allDay ? item.due >= today : new Date(item.due) >= now).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
    return { ...base, reply: items.length ? `Here are your next saved bCourses deadlines and course events.${coursework.status === "error" ? " The latest refresh failed, so these may have changed." : ""} The feed does not include grades or submission status.` : "There are no upcoming dated items in your saved bCourses feed. Undated assignments and Canvas To Do items aren’t included; check bCourses for the full list.", sources: items.map(item => ({ kind: "assignment", title: item.title, detail: `${item.course || "bCourses"} · ${item.allDay ? dayLabel(item.due) : dateLabel(item.due)} · ${item.kind === "assignment" ? "Assignment" : "Course event"}`, ...(item.url ? { url: item.url } : {}) })), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: coursework.updatedAt };
  }

  if (/\b(?:calendar|agenda|event|meeting|schedule|tomorrow)\b/.test(q)) {
    const day = /\btomorrow\b/.test(q) ? addDays(today, 1) : today;
    const next = /\bnext\b/.test(q);
    const events = state.events.filter(e => next ? new Date(e.end) >= now : eventOnDay(e, day)).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()).slice(0, next ? 1 : 8);
    if (!events.length) return handoff(`Your saved calendar snapshot has no ${next ? "upcoming events" : day === today ? "events for today" : "events for tomorrow"}. You can check the live primary calendar in ChatGPT.`);
    return { ...base, reply: next ? `Your next saved event is “${events[0].title}”, ${dateLabel(events[0].start)}.` : `Here’s your saved agenda for ${day === today ? "today" : "tomorrow"}, in Pacific time.`, sources: events.map(e => ({ kind: "event", title: e.title, detail: `${dateLabel(e.start)}${e.location ? ` · ${e.location}` : ""}`, ...(e.url ? { url: safeUrl(e.url) } : {}) })), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: state.sources.calendar?.updatedAt };
  }

  if (/\b(?:emails?|inbox|messages?)\b/.test(q)) {
    const box = mailboxes.find(box => q.includes(box.account) || (box.id === "main" ? /\bmain\b/.test(q) : box.id === "berk" ? /\bberk(?:eley)?\b/.test(q) : /\bcal[ -]?hacks\b/.test(q)));
    const emails = state.emails.filter(mail => !box || mailAccount(mail, state.sources.gmail) === box.account).sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high")).slice(0, 5);
    if (!emails.length) return handoff(box ? `No summaries are saved for ${box.label} (${box.account}) yet. Refresh that inbox through ChatGPT.` : "There are no email summaries saved yet. Use connected ChatGPT for a fresh inbox lookup.");
    return { ...base, reply: `These are saved email summaries${box ? ` from ${box.label} (${box.account})` : " across your inboxes"} that may need your attention. Open a source to read the original, or use ChatGPT for a fresh lookup.`, sources: emails.map(e => ({ kind: "email", title: e.subject, detail: `${mailAccount(e, state.sources.gmail) || "Saved inbox"} · ${e.sender} · ${e.summary}`, url: safeUrl(e.url) })), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: box ? mailboxSource(state.sources, box.account).updatedAt : Object.entries(state.sources).filter(([key]) => key === "gmail" || key.startsWith("gmail:")).map(([, source]) => source.updatedAt).filter((at): at is string => !!at).sort().at(-1) };
  }

  if (/\b(?:note|notes)\b/.test(q) && !/\b(?:save|add|write|change)\b/.test(q)) {
    return { ...base, reply: state.note ? "Here’s your saved workspace note." : "Your workspace note is empty. You can add a note in Connections → Workspace data.", sources: state.note ? [{ kind: "note", title: "Quick note", detail: state.note.slice(0, 3000) }] : [], actions: [] };
  }

  if (/\b(?:priorit(?:y|ies)|tasks?|attention|briefing|focus|my day|plan today|need to do)\b/.test(q) || /^(?:hi|hello|hey)[.!]?$/i.test(q)) {
    const o = overview(state.tasks, state.events, today);
    const tasks = o.open.slice(0, 5);
    if (!tasks.length && state.briefing) return { ...base, reply: state.briefing.summary, sources: state.briefing.priorities.map((p, i) => ({ kind: "briefing", title: `Priority ${i + 1}`, detail: p })), actions: [{ type: "chatgpt", request: clean }], sourceUpdatedAt: state.briefing.generatedAt };
    return { ...base, reply: tasks.length ? `${o.summary} Here are your highest priorities.` : "You have no open dashboard tasks yet. Try “Add a task to review lecture notes tomorrow”, or continue in ChatGPT for a broader plan.", sources: tasks.map(taskSource), actions: [{ type: "chatgpt", request: clean }] };
  }
  return handoff("For broader questions, research, live information or actions across your apps, use connected ChatGPT. This panel can look up saved workspace information and prepare dashboard tasks.");
}
