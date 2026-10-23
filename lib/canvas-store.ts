import { CanvasConnectionError, canvasFeedUrl, parseCanvasFeed } from "./canvas";
import { database, save } from "./store";
import type { Coursework } from "./life";

type FeedConfig = { feedUrl: string; lastAttempt?: string };
const empty: Coursework = { connected: false, status: "not_connected", items: [] };
async function readRecord<T>(id: string): Promise<T | null> {
  const row = await database().prepare("SELECT payload FROM life_records WHERE id=?").bind(id).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) as T : null;
}
async function downloadFeed(url: string) {
  const feedUrl = canvasFeedUrl(url);
  const signal = AbortSignal.timeout(15000);
  try {
    const result = await fetch(feedUrl, { headers: { Accept: "text/calendar", "User-Agent": "LifeOS-Calendar/1.0" }, redirect: "manual", signal });
    if (result.status >= 300 && result.status < 400) throw new CanvasConnectionError("bCourses redirected this link instead of returning a calendar. Copy a fresh Calendar Feed link from bCourses → Calendar.", 422);
    if (result.status === 401 || result.status === 403) throw new CanvasConnectionError("bCourses rejected this Calendar Feed link. Sign into bCourses and copy a fresh link from Calendar → Calendar Feed.", 422);
    if (result.status === 404 || result.status === 410) throw new CanvasConnectionError("bCourses couldn’t find this calendar feed. The link may be incomplete or expired. Copy a fresh Calendar Feed link.", 422);
    if (result.status === 429) throw new CanvasConnectionError("bCourses is receiving too many requests. Wait a minute and try connecting again.", 503);
    if (!result.ok || !result.body) throw new CanvasConnectionError("bCourses couldn’t provide the calendar right now. Try connecting again shortly.", 502);
    if (Number(result.headers.get("content-length") || 0) > 3000000) throw new CanvasConnectionError("This calendar feed is too large to import.", 413);
    const reader = result.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 3000000) { await reader.cancel(); throw new CanvasConnectionError("This calendar feed is too large to import.", 413); } chunks.push(value); }
    const bytes = new Uint8Array(length); let position = 0; for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
    return parseCanvasFeed(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof CanvasConnectionError) throw error;
    if (signal.aborted) throw new CanvasConnectionError("bCourses took too long to respond. Try connecting again.", 504);
    throw new CanvasConnectionError("V.E.C.T.O.R. couldn’t reach bCourses to download the calendar. Check your connection and try again.", 502);
  }
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
