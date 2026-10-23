import {continueMailImport} from "@/lib/google-mail-page";
import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { calendarAccount, mailboxes, mailboxSource, mailAccount } from "@/lib/life";
import { response, sameOrigin, state, database } from "@/lib/store";
import { GoogleConnectionError, googleSetup, googleTarget, googleScopesGranted, gmailCanTrash, calendarCanEdit, readGoogleGrant, removeGoogleGrant } from "@/lib/google-oauth";
import { createCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar-write";
import { refreshGoogle, trashGoogleMail, readGoogleMail } from "@/lib/google-direct";
export const dynamic = "force-dynamic";
export async function GET() {
  const setup = googleSetup(), user = await getChatGPTUser();
  if (!user) return response({ ...setup, error: "Sign in to V.E.C.T.O.R. to manage Google connections.", signInPath: chatGPTSignInPath("/") }, 401);
  try {
    const targets = [...mailboxes.map(box => googleTarget("gmail", box.account)), googleTarget("calendar", calendarAccount), googleTarget("tasks", calendarAccount)];
    const snapshot = await state();
    const connections = await Promise.all(targets.map(async target => {
      const grant = setup.configured ? await readGoogleGrant(target, user.userId) : null;
      const connected = !!grant;
      const needsDiscovery = !!grant && target.resource === "calendar" && !googleScopesGranted("calendar", grant.scopes);
      const source = target.resource === "gmail" ? mailboxSource(snapshot.sources, target.account) : target.resource==="tasks"?snapshot.sources.tasks:snapshot.sources.calendar;
      return { ...target, connected, canEdit: !!grant && target.resource === "calendar" && calendarCanEdit(grant.scopes), canTrash: !!grant && target.resource === "gmail" && gmailCanTrash(grant.scopes), requiresReconnect: connected && (needsDiscovery || source?.requiresReconnect === true), syncStatus: needsDiscovery ? "error" : connected ? source?.status || "not_connected" : "not_connected", lastSyncedAt: connected ? source?.updatedAt || null : null, count: connected ? target.resource === "gmail" ? snapshot.emails.filter(mail => mailAccount(mail, snapshot.sources.gmail) === target.account).length : target.resource==="tasks"?snapshot.tasks.filter(task=>task.googleTask?.account===target.account).length : snapshot.events.filter(event => event.source === "Google Calendar" && event.account === target.account).length : null, calendars: connected && target.resource === "calendar" ? source?.calendars || [] : undefined, message: needsDiscovery ? "Reconnect Berkeley Calendar to include your classes, meetings and other calendars." : connected ? source?.message || null : null };
    }));
    const result = await database().prepare("SELECT payload FROM life_records WHERE id=? AND kind='google_result'").bind(`google:result:${user.userId}`).first<{ payload: string }>();
    return response({ ...setup, connections, lastResult: result ? JSON.parse(result.payload) : null });
  } catch { return response({ ...setup, error: "Couldn’t read Google connections. Check the server configuration." }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin rejected." }, 403);
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Sign in to V.E.C.T.O.R. first.", signInPath: chatGPTSignInPath("/") }, 401);
  try {
    const raw = await request.text(); if (raw.length > 8000) return response({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);
    const target = googleTarget(body.resource, body.account);
    if(body.action==="mailPage"&&target.resource==="gmail"){if(body.range!=="week"&&body.range!=="older")return response({error:"Choose an email range."},400);return response(await continueMailImport(target,user.userId,body.range,body.reset===true));}
    if(body.action==="createEvent"&&target.resource==="calendar")return response(await createCalendarEvent(body.event,user.userId));
    if(body.action==="deleteEvent"&&target.resource==="calendar")return response(await deleteCalendarEvent(body.id,user.userId));
    if (body.action === "message" && target.resource === "gmail") { if(typeof body.id !== "string") return response({error:"Choose a message."},400); return response(await readGoogleMail(target.account,body.id,user.userId)); }
    if (body.action === "trash" && target.resource === "gmail") { if (typeof body.id !== "string") return response({error:"Choose a message."},400); return response(await trashGoogleMail(target.account,body.id,user.userId)); }
    if (body.action === "disconnect") { await removeGoogleGrant(target, user.userId); return response({ ok: true }); }
    if (body.action === "refresh" || body.action === "refresh_auto") return response(await refreshGoogle(target, user.userId, body.action === "refresh"));
    return response({ error: "Choose a Google connection action." }, 400);
  } catch (error) { return response({ requiresReconnect: error instanceof GoogleConnectionError && error.requiresReconnect, error: error instanceof GoogleConnectionError ? error.message : "Couldn’t update Google connections." }, error instanceof GoogleConnectionError ? error.status : 400); }
}
