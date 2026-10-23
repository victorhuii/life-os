import {readGoogleTasks,syncGoogleTasks,type TasksSnapshot} from "./google-tasks";
import {readMailPage,storeMailPage} from "./google-mail-page";
import {parseMailMessage,type MailPart} from "./mail-message";
import { calendarAccount, eventSchema, mailAccount, mailSchema, mailboxSource, mailboxSourceKey, type LifeEvent, type Mail, type Source, type GoogleCalendarInfo,type MailImportProgress } from "./life";
import { database, state } from "./store";
import { googleAccessToken, googleJson, GoogleConnectionError, gmailCanTrash, googleScopesGranted, readGoogleGrant, type GoogleGrant, type GoogleTarget } from "./google-oauth";

type GoogleEvent = { id: string; recurringEventId?:string; summary?: string; status?: string; location?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
function calendarMidnight(date: string, zone: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let stamp = target;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(stamp).map(part => [part.type, part.value]));
    const displayed = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    stamp += target - displayed;
  }
  return new Date(stamp).toISOString();
}
type CalendarEntry = { id: string; summary?: string; summaryOverride?: string; timeZone?: string; backgroundColor?: string; primary?: boolean; selected?: boolean; hidden?: boolean; deleted?: boolean; accessRole?: string };
async function discoverCalendars(headers: Record<string, string>) {
  const entries: CalendarEntry[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 4; page++) {
    const params = new URLSearchParams({ minAccessRole: "reader", maxResults: "250", showHidden: "false", showDeleted: "false" });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await googleJson<{ items?: CalendarEntry[]; nextPageToken?: string }>(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`, { headers });
    entries.push(...(result.items || []));
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }
  if (pageToken) throw new GoogleConnectionError("Your calendar list is too large to discover completely. Your saved events are preserved.");
  return [...new Map(entries.filter(calendar => !calendar.hidden && !calendar.deleted && ["reader", "writer", "writerWithoutPrivateAccess", "owner"].includes(calendar.accessRole || "")).map(calendar => [calendar.id, calendar])).values()];
}
async function calendarEventId(calendarId: string, eventId: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([calendarId, eventId])));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function readGoogleSnapshot(grant: GoogleGrant): Promise<{ tasksSnapshot?:TasksSnapshot; emails?: Mail[]; events?: LifeEvent[]; calendars?: GoogleCalendarInfo[]; readStartedAt?: string;mailRange?:'week'|'older';mailProgress?:MailImportProgress; message: string }> {
  if(grant.resource==="tasks")return {tasksSnapshot:await readGoogleTasks(grant),message:"Google Tasks authorized."};
  const readStartedAt = new Date().toISOString();
  if (grant.resource === "gmail") {
    const previous=mailboxSource((await state()).sources,grant.account).mailSync;
    return readMailPage(grant,'week',previous?.nextPageToken?previous:undefined);
  }

  const token=await googleAccessToken(grant),headers={Authorization:`Bearer ${token}`};
  if (grant.account !== calendarAccount) throw new GoogleConnectionError("Only the Berkeley calendar can be imported.");
  if (!googleScopesGranted("calendar", grant.scopes)) throw new GoogleConnectionError("Reconnect Berkeley Calendar to allow discovery of your classes, meetings and other calendars.", 400, true);
  const available = await discoverCalendars(headers);
  const calendars: GoogleCalendarInfo[] = available.map(calendar => ({ id: calendar.id, name: (calendar.summaryOverride || calendar.summary || calendar.id).slice(0, 240), primary: !!calendar.primary, canEdit:["owner","writer","writerWithoutPrivateAccess"].includes(calendar.accessRole||""), enabled: !!calendar.primary || !!calendar.selected, ...(/^#[0-9a-f]{6}$/i.test(calendar.backgroundColor || "") ? { color: calendar.backgroundColor } : {}) }));
  const selected = calendars.filter(calendar => calendar.enabled);
  if (selected.length > 30) throw new GoogleConnectionError("More than 30 calendars are selected. Uncheck calendars you don’t need in Google Calendar and refresh V.E.C.T.O.R..");
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 45);
  const queue: { calendar: GoogleCalendarInfo; pageToken?: string }[] = selected.map(calendar => ({ calendar }));
  const events: LifeEvent[] = [];
  const seen = new Set<string>();
  let requests = 0;
  while (queue.length && events.length < 500 && requests < 40) {
    const { calendar, pageToken } = queue.shift()!;
    const params = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: String(Math.min(100, 500 - events.length)) });
    if (pageToken) params.set("pageToken", pageToken);
    let result: { items?: GoogleEvent[]; timeZone?: string; nextPageToken?: string };
    try { result = await googleJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params}`, { headers }); }
    catch (error) { throw new GoogleConnectionError(`Couldn’t refresh “${calendar.name}”. ${error instanceof GoogleConnectionError ? error.message : "Try again shortly."}`, 502, error instanceof GoogleConnectionError && error.requiresReconnect); }
    requests++;
    for (const item of result.items || []) {
      if (item.status === "cancelled") continue;
      const id = await calendarEventId(calendar.id, item.id);
      if (seen.has(id)) continue;
      seen.add(id);
      events.push(eventSchema.parse({ id, account: calendarAccount, calendarId: calendar.id, googleEventId:item.id,canEdit:calendar.canEdit,recurring:!!item.recurringEventId, calendarName: calendar.name, calendarColor: calendar.color, title: (item.summary || "Busy").slice(0, 240), location: (item.location || "").slice(0, 300), start: item.start?.date ? calendarMidnight(item.start.date, result.timeZone || available.find(entry => entry.id === calendar.id)?.timeZone || "America/Los_Angeles") : item.start?.dateTime, end: item.end?.date ? calendarMidnight(item.end.date, result.timeZone || available.find(entry => entry.id === calendar.id)?.timeZone || "America/Los_Angeles") : item.end?.dateTime, allDay: !!item.start?.date, source: "Google Calendar", ...(item.htmlLink ? { url: item.htmlLink } : {}) }));
    }
    if (result.nextPageToken) queue.push({ calendar, pageToken: result.nextPageToken });
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events, calendars, readStartedAt, message: `Direct Berkeley calendars · ${selected.length} included · previous 7 days and next 38 days${queue.length ? "; import limit reached, some events are not shown" : ""}.` };
}
function sourceStatement(target: GoogleTarget, source: Source) {
  const key = target.resource === "gmail" ? mailboxSourceKey(target.account) : "calendar";
  return database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES ('sources','sources',?,?) ON CONFLICT(id) DO UPDATE SET payload=json_patch(life_records.payload,excluded.payload),updated_at=excluded.updated_at").bind(JSON.stringify({ [key]: source }), new Date().toISOString());
}
export async function storeGoogleSnapshot(grant: GoogleGrant, snapshot: Awaited<ReturnType<typeof readGoogleSnapshot>>) {
  if(grant.resource==="tasks"){const result=await syncGoogleTasks(grant.owner,true);if(result.error)throw new GoogleConnectionError(result.error,502);return;}
  const now = new Date().toISOString(), ops = [];
  if (snapshot.emails) {await storeMailPage(grant,{...snapshot,emails:snapshot.emails});return;}

  if (snapshot.events) {
    // A provider read started before an explicit edit cannot undo that edit.
    const mutation=await database().prepare("SELECT updated_at FROM life_records WHERE id='google:calendar-mutation'").first<{updated_at:string}>();
    if(mutation&&(!snapshot.readStartedAt||mutation.updated_at>=snapshot.readStartedAt))return;
    ops.push(database().prepare("DELETE FROM life_records WHERE kind='event' AND json_extract(payload,'$.source')='Google Calendar'"));
    for (const event of snapshot.events) ops.push(database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES (?,'event',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(`event:gcal:${event.id}`, JSON.stringify({ ...event, id: `gcal:${event.id}` }), now));
  }
  ops.push(sourceStatement(grant, { account: grant.account, status: "synced", updatedAt: now, message: snapshot.message, ...(snapshot.calendars ? { calendars: snapshot.calendars } : {}) }));
  await database().batch(ops);
}
export async function refreshGoogle(target: GoogleTarget, owner: string, force = false) {
  if(target.resource==="tasks")return syncGoogleTasks(owner,force);
  const grant = await readGoogleGrant(target, owner);
  if (!grant) return { ...target, connected: false };
  const now = new Date().toISOString(), cutoff = new Date(Date.now() - (force ? 30000 : 5 * 60000)).toISOString();
  const claim = await database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES (?,'google_attempt','{}',?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at WHERE life_records.updated_at < ? RETURNING id").bind(`google:attempt:${target.resource}:${target.account}`, now, cutoff).first<{ id: string }>();
  if (!claim) return { ...target, connected: true, skipped: true };
  try {
    const snapshot = await readGoogleSnapshot(grant);
    await storeGoogleSnapshot(grant, snapshot);
    return { ...target, connected: true, count: snapshot.emails?.length ?? snapshot.events?.length ?? 0 };
  } catch (error) {
    const old = await state();
    const previous = target.resource === "gmail" ? mailboxSource(old.sources, target.account) : old.sources.calendar;
    const message = error instanceof GoogleConnectionError ? error.message : "Couldn’t refresh Google. Your last saved data is preserved.";
    await sourceStatement(target, { ...previous, account: target.account, status: "error", message, requiresReconnect: error instanceof GoogleConnectionError && error.requiresReconnect }).run();
    return { ...target, connected: true, error: message };
  }
}

/** Only an explicit UI action may Trash a single saved message in its verified mailbox. */
export async function trashGoogleMail(account: GoogleTarget["account"], id: string, owner: string) {
  if (!/^[a-f0-9]{1,64}$/i.test(id)) throw new GoogleConnectionError("This imported message has no Gmail message ID. Refresh this inbox first.");
  const grant = await readGoogleGrant({ resource: "gmail", account }, owner);
  if (!grant || !gmailCanTrash(grant.scopes)) throw new GoogleConnectionError("Reconnect this inbox in Connections to allow moving messages to Gmail Trash.", 409, true);
  const token = await googleAccessToken(grant);
  const headers = { Authorization: `Bearer ${token}` };
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const profile = await googleJson<{ emailAddress: string }>(`${base}/profile`, { headers });
  if (profile.emailAddress?.toLowerCase() !== account) throw new GoogleConnectionError("The Google identity doesn’t match this inbox. Reconnect the correct account.", 403, true);
  const snapshot = await state();
  if (!snapshot.emails.some(mail => mail.id === id && mailAccount(mail, snapshot.sources.gmail) === account)) throw new GoogleConnectionError("This message is no longer in the saved inbox. Refresh and try again.", 404);
  await googleJson(`${base}/messages/${encodeURIComponent(id)}/trash`, { method: "POST", headers });
  // A tombstone also suppresses a snapshot that was already refreshing when Trash was clicked.
  await database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail_preference',?,?) ON CONFLICT(id) DO UPDATE SET payload=json_patch(life_records.payload,excluded.payload),updated_at=excluded.updated_at").bind(`mail-pref:${account}:${id}`,JSON.stringify({trashed:true}),new Date().toISOString()).run();
  return { ok: true };
}

/** Fetch the selected message only; full MIME bodies never enter dashboard snapshots or exports. */
export async function readGoogleMail(account: GoogleTarget["account"], id: string, owner: string) {
  if (!/^[a-f0-9]{1,64}$/i.test(id)) throw new GoogleConnectionError("Refresh this inbox to load a verified Gmail message ID.");
  const grant = await readGoogleGrant({resource:"gmail",account},owner);
  if (!grant || !googleScopesGranted("gmail",grant.scopes)) throw new GoogleConnectionError("Connect this inbox directly in Connections to read the complete message.",409,true);
  const token = await googleAccessToken(grant), headers = {Authorization:`Bearer ${token}`};
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const profile = await googleJson<{emailAddress:string}>(`${base}/profile`,{headers});
  if (profile.emailAddress?.toLowerCase() !== account) throw new GoogleConnectionError("The Google identity doesn’t match this inbox. Reconnect the correct account.",403,true);
  const snapshot = await state();
  if (!snapshot.emails.some(mail => mail.id === id && mailAccount(mail,snapshot.sources.gmail) === account)) throw new GoogleConnectionError("This email is no longer in the saved inbox. Refresh and try again.",404);
  const message = await googleJson<{id:string;payload?:MailPart}>(`${base}/messages/${encodeURIComponent(id)}?format=full`,{headers});
  if (message.id !== id || !message.payload) throw new GoogleConnectionError("Google did not return this message. Refresh and try again.",502);
  try { return await parseMailMessage(id,message.payload,attachmentId => googleJson(`${base}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,{headers})); }
  catch(error) { if(error instanceof GoogleConnectionError)throw error; throw new GoogleConnectionError(error instanceof Error ? error.message : "Couldn’t read the complete message. Open it in Gmail.",502); }
}
