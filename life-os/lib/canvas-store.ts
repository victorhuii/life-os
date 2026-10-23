import { canvasFeedUrl, parseCanvasFeed } from "./canvas";
import { database, save } from "./store";
import type { Coursework } from "./life";

type FeedConfig = { feedUrl: string; lastAttempt?: string };
const empty: Coursework = { connected: false, status: "not_connected", items: [] };
async function readRecord<T>(id: string): Promise<T | null> {
  const row = await database().prepare("SELECT payload FROM life_records WHERE id=?").bind(id).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) as T : null;
}
async function downloadFeed(url: string) {
  const result = await fetch(canvasFeedUrl(url), { headers: { Accept: "text/calendar" }, redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!result.ok || !result.body || Number(result.headers.get("content-length") || 0) > 3000000) throw new Error("bCourses could not be reached. Your last saved deadlines are still available.");
  const reader = result.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 3000000) { await reader.cancel(); throw new Error("This calendar feed is too large."); } chunks.push(value); }
  const bytes = new Uint8Array(length); let position = 0; for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  return parseCanvasFeed(new TextDecoder().decode(bytes));
}
export async function syncCanvas(force = false): Promise<Coursework> {
  const config = await readRecord<FeedConfig>("integration:canvas");
  if (!config) return empty;
  const previous = await readRecord<Coursework>("canvas:snapshot") || { ...empty, connected: true };
  const lastAttempt = new Date(config.lastAttempt || 0).getTime();
  if (Date.now() - lastAttempt < (force ? 30000 : 30 * 60000)) return previous;
  await save("integration:canvas", "integration_private", { ...config, lastAttempt: new Date().toISOString() });
  try {
    const items = await downloadFeed(config.feedUrl);
    const snapshot: Coursework = { connected: true, status: "synced", items, updatedAt: new Date().toISOString(), message: "bCourses calendar feed. Dated assignments and course events; submission status is not included." };
    await save("canvas:snapshot", "canvas_snapshot", snapshot); return snapshot;
  } catch {
    const snapshot: Coursework = { ...previous, connected: true, status: "error", message: "Couldn’t refresh bCourses. Showing the last saved deadlines. Check your feed link in Connections." };
    await save("canvas:snapshot", "canvas_snapshot", snapshot); return snapshot;
  }
}
export async function connectCanvas(input: string) {
  const feedUrl = canvasFeedUrl(input);
  const items = await downloadFeed(feedUrl);
  const updatedAt = new Date().toISOString();
  const snapshot: Coursework = { connected: true, status: "synced", items, updatedAt, message: "bCourses calendar feed. Dated assignments and course events; submission status is not included." };
  // Commit the verified connection and its snapshot together. A failed setup
  // never replaces a working connection with a broken feed.
  await database().batch([
    database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES ('integration:canvas','integration_private',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(JSON.stringify({ feedUrl, lastAttempt: updatedAt }), updatedAt),
    database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES ('canvas:snapshot','canvas_snapshot',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(JSON.stringify(snapshot), updatedAt),
  ]);
  return snapshot;
}
export async function disconnectCanvas() {
  await database().prepare("DELETE FROM life_records WHERE id IN ('integration:canvas','canvas:snapshot')").run();
  return empty;
}
