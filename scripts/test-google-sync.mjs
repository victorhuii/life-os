import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = path.join(root, ".sites-runtime/google-tests");
mkdirSync(temp, { recursive: true });
const imports = { "./life": "./life.mjs", "@/lib/life": "./life.mjs", "@/lib/google-sync": "./google-sync.mjs", "@/lib/store": "./store.mjs", "@/lib/canvas-store": "./canvas-store.mjs", "cloudflare:workers": "./test-env.mjs" };
for (const [name, file] of Object.entries({ life: "lib/life.ts", "google-sync": "lib/google-sync.ts", store: "lib/store.ts", route: "app/api/automation/route.ts" })) {
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/from "([^"]+)"/g, (match, specifier) => imports[specifier] ? `from "${imports[specifier]}"` : match);
  writeFileSync(path.join(temp, `${name}.mjs`), output);
}
writeFileSync(path.join(temp, "canvas-store.mjs"), "export async function syncCanvas() {}\n");
writeFileSync(path.join(temp, "test-env.mjs"), `
import { DatabaseSync } from 'node:sqlite';
export const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE life_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
function statement(sql, values = []) {
  return {
    bind: (...args) => statement(sql, args),
    all: async () => ({results: sqlite.prepare(sql).all(...values)}),
    first: async () => sqlite.prepare(sql).get(...values) || null,
    run: async () => sqlite.prepare(sql).run(...values),
  };
}
export const env = {DB: {
  prepare: sql => statement(sql),
  batch: async statements => {
    sqlite.exec('BEGIN');
    try { const results = []; for (const item of statements) results.push(await item.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
}};
`);
const moduleAt = name => import(pathToFileURL(path.join(temp, `${name}.mjs`)).href);
const { sqlite } = await moduleAt("test-env");
const { state } = await moduleAt("store");
const { POST } = await moduleAt("route");
const { calendarAccount, mailAccount, mailboxSource, dayKey } = await moduleAt("life");
const [main, berk, hacks] = ["victorhui94@gmail.com", "huiv@berkeley.edu", "vhui@hackberkeley.org"];
const at = "2026-10-19T08:00:00Z";
const put = (id, kind, value) => sqlite.prepare("INSERT INTO life_records VALUES (?,?,?,?)").run(id, kind, JSON.stringify(value), at);
const mail = (account, subject) => ({ id: "shared-provider-id", sender: "Test", subject, summary: "Fixture", receivedAt: at, url: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}#all/shared-provider-id`, priority: "normal", account });
const legacy = mail(main, "Main stays separate"); delete legacy.account;
put("mail:legacy", "mail", legacy);
put(`mail:${berk}:shared-provider-id`, "mail", mail(berk, "Old Berk"));
put(`mail:${hacks}:shared-provider-id`, "mail", mail(hacks, "Cal Hacks stays separate"));
put("sources", "sources", { gmail: { account: main, status: "synced", updatedAt: at }, [`gmail:${berk}`]: { account: berk, status: "synced", updatedAt: at }, [`gmail:${hacks}`]: { account: hacks, status: "synced", updatedAt: at }, calendar: { account: berk, status: "synced", updatedAt: at } });
put("canvas:snapshot", "canvas_snapshot", { connected: true, status: "synced", items: [{ id: "canvas", title: "Coursework" }] });
const event = (account, id) => ({ id, account, title: "Fixture event", start: at, end: "2026-10-19T09:00:00Z", source: "Google Calendar", location: "" });
put("event:personal", "event", event(main, "personal"));
put("event:berk", "event", event(berk, "berk"));
assert.deepEqual((await state()).events.map(event => event.account), [calendarAccount]);
assert.equal(mailAccount({ ...legacy, url: "https://mail.google.com/mail/u/0/#inbox/test", to: berk }), undefined, "Recipient addresses must never establish mailbox ownership");
assert.equal(mailAccount(legacy), main);

const request = async data => {
  const payload = { day: dayKey(), title: "Test import", summary: "Fixture", priorities: [], headsUp: [], mode: "manual", ...data };
  const response = await POST(new Request("https://dashboard.test/api/automation", { method: "POST", headers: { Origin: "https://dashboard.test", "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
  return { status: response.status, body: await response.json() };
};
const inbox = (account, emails) => ({ account, emails, status: "synced", updatedAt: at });
assert.equal((await request({ inboxes: [inbox(berk, [mail(berk, "New Berk")])] })).status, 200);
let saved = await state();
assert.deepEqual(saved.emails.map(mail => mail.subject).sort(), ["Cal Hacks stays separate", "Main stays separate", "New Berk"]);
assert.equal(sqlite.prepare("SELECT json_extract(payload,'$.account') AS account FROM life_records WHERE id='mail:legacy'").get().account, main);
assert.equal((await request({ inboxes: [inbox(berk, [])] })).status, 200);
saved = await state();
assert.deepEqual(saved.emails.map(mail => mail.account).sort(), [berk, hacks, main].sort(), "An empty import must retain all saved mail for Archive");
assert.equal((await request({ inboxes: [{ account: hacks, status: "error", message: "Test failure" }] })).status, 200);
saved = await state();
assert.equal(saved.emails.filter(mail => mail.account === hacks).length, 1);
assert.equal(mailboxSource(saved.sources, hacks).status, "error");
assert.equal(mailboxSource(saved.sources, hacks).updatedAt, at);
assert.equal(saved.coursework.items.length, 1);

const before = JSON.stringify(sqlite.prepare("SELECT * FROM life_records ORDER BY id").all());
for (const invalid of [
  { events: [event(main, "wrong")], sources: { calendar: { account: main, status: "synced", updatedAt: at } } },
  { events: [event(main, "wrong")], sources: { calendar: { account: berk, status: "synced", updatedAt: at } } },
  { events: [], sources: { calendar: { account: berk, status: "error" } } },
  { sources: { calendar: { account: berk, status: "synced", updatedAt: at } } },
  { inboxes: [inbox(berk, [mail(main, "Mismatched account")])] },
  { inboxes: [inbox(berk, [{ ...mail(berk, "Wrong Gmail link"), url: mail(main, "").url }])] },
  { inboxes: [inbox(main, []), inbox(main, [])] },
  { inboxes: [inbox("unexpected@example.com", [])] },
  { inboxes: [{ account: main, status: "synced", updatedAt: at }] },
  { emails: [mail(main, "Unknown mailbox")] },
]) {
  assert.equal((await request(invalid)).status, 400);
  assert.equal(JSON.stringify(sqlite.prepare("SELECT * FROM life_records ORDER BY id").all()), before, "Invalid imports must be rejected before any data changes");
}
assert.equal((await request({ events: [event(berk, "verified")], sources: { calendar: { account: berk, status: "synced", updatedAt: at } } })).status, 200);
assert.equal((await state()).events.length, 1);
assert.equal((await state()).events[0].account, berk);
assert.equal((await request({ emails: [], sources: { gmail: { account: main, status: "synced", updatedAt: at } } })).status, 200);
assert.deepEqual((await state()).emails.map(mail => mail.account).sort(), [berk,hacks,main].sort(), "Legacy imports retain older mail in every mailbox");
sqlite.close();
console.log("PASS: Berkeley-only calendar imports, three isolated inboxes, legacy attribution, provider ID collisions, partial and empty refreshes, preserved stale data, atomic rejection and scoped Gmail links.");
