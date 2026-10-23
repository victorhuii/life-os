import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
const root = fileURLToPath(new URL("../", import.meta.url));
const temp = path.join(root, ".sites-runtime/core-tests");
mkdirSync(temp, { recursive: true });
for (const name of ["life", "core"]) {
  const source = readFileSync(path.join(root, `lib/${name}.ts`), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replaceAll('from "./life"', 'from "./life.mjs"');
  writeFileSync(path.join(temp, `${name}.mjs`), output);
}
const { answerWorkspace, connectedPrompt } = await import(pathToFileURL(path.join(temp, "core.mjs")).href);
const now = new Date("2026-10-17T02:15:00Z"); // Still Oct. 16 in Pacific time.
const empty = { tasks: [], events: [], emails: [], note: "", briefing: null, sources: {}, schedule: { enabled: false, time: "07:00", timezone: "America/Los_Angeles" }, loadedAt: now.toISOString() };
const id = "d9fe2723-95d7-463d-bd10-134ab6264e37";
const ask = (text, state = empty) => answerWorkspace(text, state, now, id);
assert.deepEqual(ask("Can you add a new task on my Google Calendar?").actions.map(a => a.type), ["chatgpt"]);
assert.deepEqual(ask("Schedule a meeting for tomorrow").actions.map(a => a.type), ["chatgpt"]);
assert.equal(ask("When is my next midterm?").sources.length, 0);
assert.match(ask("When is my next midterm?").reply, /won’t guess/);
const draft = ask("Add a task to review lecture notes tomorrow").actions[0];
assert.equal(draft.type, "create_task"); assert.equal(draft.draft.due, "2026-10-17"); assert.equal(draft.draft.title, "review lecture notes"); assert.equal(draft.draft.category, "School");
assert.equal(ask("Add task: Review notes 2026-02-30").actions.length, 0);
assert.equal(ask("Add a task").actions.length, 0);
const task = { id: "a", title: "Study for midterm", category: "School", priority: "normal", done: false, due: "2026-10-20", minutes: 30 };
assert.match(ask("When is my next midterm?", { ...empty, tasks: [task] }).reply, /does not confirm/);
assert.equal(ask("Show my tasks", { ...empty, tasks: [task] }).sources[0].kind, "task");
const exam = { id: "exam", title: "Course midterm", start: "2026-10-20T09:00:00-07:00", end: "2026-10-20T10:30:00-07:00", source: "Google Calendar", location: "Lecture hall" };
assert.equal(ask("When is my next midterm?", { ...empty, events: [exam] }).sources[0].title, exam.title);
const email = { id: "mail", sender: "Professor", subject: "Exam details", summary: "Review course materials.", receivedAt: now.toISOString(), url: "https://mail.google.com/mail/u/0/#inbox/example", priority: "high" };
assert.equal(ask("Summarize my emails", { ...empty, emails: [email] }).sources[0].kind, "email");
assert.equal(ask("Mark study complete", { ...empty, tasks: [task, { ...task, id: "b", title: "Study assignment" }] }).actions.length, 0);
assert.equal(ask("Mark Study for midterm complete", { ...empty, tasks: [task] }).actions[0].type, "complete_task");
assert.match(connectedPrompt("Check my exam date", "https://example.test"), /do not add other accounts/i);
assert.match(connectedPrompt("Check my exam date", "https://example.test"), /do not guess/i);
console.log("PASS: calendar-vs-dashboard routing, grounded exam answers, plural lookups, Pacific dates, drafts, ambiguous targets and single-account handoff scope.");
