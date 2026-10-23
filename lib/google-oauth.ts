import { env } from "cloudflare:workers";
import { calendarAccount, mailboxAccountSchema, type MailboxAccount } from "./life";
import { database, save } from "./store";

export type GoogleResource = "gmail" | "calendar" | "tasks";
export type GoogleTarget = { resource: GoogleResource; account: MailboxAccount };
export type GoogleGrant = GoogleTarget & { owner: string; refreshToken: string; accessToken: string; expiresAt: number; scopes: string[] };
type Pending = GoogleTarget & { owner: string; verifier: string; browser: string; expiresAt: number };
export class GoogleConnectionError extends Error {
  constructor(message: string, public status = 400, public requiresReconnect = false, public providerStatus?:number) { super(message); }
}
export const calendarListScope = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
export const gmailModifyScope = "https://www.googleapis.com/auth/gmail.modify";
export const gmailCanTrash = (scopes: string[]) => scopes.includes(gmailModifyScope) || scopes.includes("https://mail.google.com/");
export const calendarEventsScope = "https://www.googleapis.com/auth/calendar.events";
export const calendarCanEdit = (scopes:string[]) => scopes.includes(calendarEventsScope)||scopes.includes("https://www.googleapis.com/auth/calendar");
export const tasksScope = "https://www.googleapis.com/auth/tasks";
const scopeFor = { gmail: [gmailModifyScope], tasks:[tasksScope], calendar: [calendarEventsScope, calendarListScope] };
export function googleScopesGranted(resource: GoogleResource, scopes: string[]) {
  if (resource === "tasks") return scopes.includes(tasksScope);
  if (resource === "gmail") return gmailCanTrash(scopes) || scopes.includes("https://www.googleapis.com/auth/gmail.readonly");
  if (resource === "calendar" && scopes.some(scope => scope === "https://www.googleapis.com/auth/calendar.readonly" || scope === "https://www.googleapis.com/auth/calendar")) return true;
  return scopes.includes(calendarListScope)&&(calendarCanEdit(scopes)||scopes.includes("https://www.googleapis.com/auth/calendar.events.readonly"));
}
export const oauthCookie = "life_os_google_oauth";
const configNames = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_TOKEN_ENCRYPTION_KEY"] as const;
export function googleSetup() {
  const missing = configNames.filter(name => !env[name]);
  let valid = !missing.length;
  try {
    if (env.GOOGLE_REDIRECT_URI) {
      const url = new URL(env.GOOGLE_REDIRECT_URI);
      valid &&= (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) && url.pathname === "/api/google/callback" && !url.search && !url.hash && !url.username && !url.password;
    }
    if (env.GOOGLE_TOKEN_ENCRYPTION_KEY) valid &&= unbase64(env.GOOGLE_TOKEN_ENCRYPTION_KEY).length === 32;
  } catch { valid = false; }
  return { configured: valid, missing, redirectUri: env.GOOGLE_REDIRECT_URI || null };
}
export function googleConfig(request?: Request) {
  if (!googleSetup().configured) throw new GoogleConnectionError("Google sign-in needs server setup. Open Connections for the setup steps.", 503);
  const redirectUri = env.GOOGLE_REDIRECT_URI!;
  if (request && new URL(request.url).origin !== new URL(redirectUri).origin) throw new GoogleConnectionError("Open V.E.C.T.O.R. at its configured Google sign-in address.", 400);
  return { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, redirectUri };
}
export function googleTarget(resource: unknown, account: unknown): GoogleTarget {
  const parsed = mailboxAccountSchema.safeParse(account);
  if (!parsed.success || (resource !== "gmail" && resource !== "calendar" && resource !== "tasks") || ((resource === "calendar"||resource === "tasks") && parsed.data !== calendarAccount)) throw new GoogleConnectionError("Choose a configured inbox or your Berkeley calendar.");
  return { resource, account: parsed.data };
}
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function unbase64(value: string) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
const random = () => base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function digest(value: string) { return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function encryptionKey() { return crypto.subtle.importKey("raw", unbase64(env.GOOGLE_TOKEN_ENCRYPTION_KEY!), "AES-GCM", false, ["encrypt", "decrypt"]); }
async function seal(value: unknown, id: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, await encryptionKey(), new TextEncoder().encode(JSON.stringify(value)));
  return { iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted)) };
}
async function unseal<T>(value: { iv: string; ciphertext: string }, id: string): Promise<T> {
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(value.iv), additionalData: new TextEncoder().encode(id) }, await encryptionKey(), unbase64(value.ciphertext));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
const grantId = (target: GoogleTarget) => `integration:google:${target.resource}:${target.account}`;
async function readPrivate<T>(id: string): Promise<T | null> {
  const row = await database().prepare("SELECT payload FROM life_records WHERE id=? AND kind='google_private'").bind(id).first<{ payload: string }>();
  return row ? unseal<T>(JSON.parse(row.payload), id) : null;
}
export async function readGoogleGrant(target: GoogleTarget, owner: string) {
  const grant = await readPrivate<GoogleGrant>(grantId(target));
  if (grant && grant.owner !== owner) throw new GoogleConnectionError("This Google connection belongs to a different V.E.C.T.O.R. user.", 403);
  return grant;
}
export async function saveGoogleGrant(grant: GoogleGrant) { const id = grantId(grant); await save(id, "google_private", await seal(grant, id)); }
export async function removeGoogleGrant(target: GoogleTarget, owner: string) {
  await readGoogleGrant(target, owner);
  // Local unlink only: revoking a Google token can also revoke another resource's grant.
  await database().prepare("DELETE FROM life_records WHERE id=? AND kind='google_private'").bind(grantId(target)).run();
  if(target.resource==="tasks")await database().prepare("UPDATE life_records SET payload=json_patch(payload,?),updated_at=? WHERE id='sources' AND kind='sources'").bind(JSON.stringify({tasks:{status:"not_connected",updatedAt:null,message:"Google Tasks disconnected. Saved tasks remain here."}}),new Date().toISOString()).run();
}
export async function beginGoogleConnection(target: GoogleTarget, owner: string, request: Request) {
  const config = googleConfig(request);
  await readGoogleGrant(target, owner);
  const nonce = random(), browser = random(), verifier = random();
  const id = `google:pending:${await digest(nonce)}`;
  await database().prepare("DELETE FROM life_records WHERE kind='google_pending' AND updated_at < ?").bind(new Date(Date.now() - 10 * 60000).toISOString()).run();
  await save(id, "google_pending", await seal({ ...target, owner, browser, verifier, expiresAt: Date.now() + 10 * 60000 } satisfies Pending, id));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: `https://www.googleapis.com/auth/userinfo.email ${scopeFor[target.resource].join(" ")}`, access_type: "offline", prompt: "consent select_account", login_hint: target.account, state: nonce, code_challenge: await digest(verifier), code_challenge_method: "S256" }).toString();
  return { url: url.href, browser };
}
export async function googleJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let result: Response;
  // Workers supports only follow/manual. Never follow redirects with Google credentials.
  try { result = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) }); }
  catch { throw new GoogleConnectionError("Google couldn’t be reached. Try again shortly.", 502); }
  if (result.status >= 300 && result.status < 400) throw new GoogleConnectionError("Google returned an unexpected redirect. Try again shortly.", 502);
  if (!result.ok) throw new GoogleConnectionError(result.status === 401 || result.status === 400 ? "Google authorization expired or was declined. Reconnect this account." : result.status === 403 ? "Google denied access. Check the permissions or your organization’s app policy." : "Google couldn’t complete this request. Try again shortly.", 502, result.status === 401 || result.status === 400,result.status);
  return result.status===204 ? {} as T : result.json() as Promise<T>;
}
export async function finishGoogleConnection(request: Request, owner: string, browser: string | undefined) {
  googleConfig(request);
  const url = new URL(request.url), nonce = url.searchParams.get("state");
  if (!nonce || nonce.length > 100 || !browser) throw new GoogleConnectionError("Google sign-in expired. Start again from Connections.");
  const id = `google:pending:${await digest(nonce)}`;
  const row = await database().prepare("SELECT payload FROM life_records WHERE id=? AND kind='google_pending'").bind(id).first<{ payload: string }>();
  if (!row) throw new GoogleConnectionError("Google sign-in expired. Start again from Connections.");
  const pending = await unseal<Pending>(JSON.parse(row.payload), id);
  if (pending.owner !== owner || pending.browser !== browser || pending.expiresAt < Date.now()) throw new GoogleConnectionError("Google sign-in expired. Start again from Connections.");
  // Atomic consume prevents replay, including simultaneous callbacks.
  const consumed = await database().prepare("DELETE FROM life_records WHERE id=? AND kind='google_pending' RETURNING id").bind(id).first<{ id: string }>();
  if (!consumed) throw new GoogleConnectionError("This Google sign-in was already used. Start again.");
  if (url.searchParams.has("error")) throw new GoogleConnectionError("Google sign-in was cancelled. Your existing connections are preserved.");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) throw new GoogleConnectionError("Google did not return a valid authorization. Try again.");
  const config = googleConfig();
  const tokens = await googleJson<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: pending.verifier }) });
  const scopes = (tokens.scope || "").split(" ");
  if (!tokens.access_token || !(pending.resource === "gmail" ? gmailCanTrash(scopes) : pending.resource === "tasks" ? scopes.includes(tasksScope) : calendarCanEdit(scopes)&&googleScopesGranted(pending.resource, scopes))) throw new GoogleConnectionError("The required Google permission wasn’t granted. Reconnect and allow it.");
  const profile = await googleJson<{ email: string; verified_email: boolean }>("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profile.verified_email || profile.email?.toLowerCase() !== pending.account) throw new GoogleConnectionError(`Choose ${pending.account} in Google’s account picker. Your existing connection is preserved.`);
  const previous = await readGoogleGrant(pending, owner);
  const refreshToken = tokens.refresh_token || previous?.refreshToken;
  if (!refreshToken) throw new GoogleConnectionError("Google did not provide ongoing access. Reconnect and approve consent again.");
  const grant: GoogleGrant = { resource: pending.resource, account: pending.account, owner, refreshToken, accessToken: tokens.access_token, expiresAt: Date.now() + Math.max(0, tokens.expires_in || 0) * 1000, scopes };
  return grant;
}
export async function googleAccessToken(grant: GoogleGrant) {
  if (grant.expiresAt > Date.now() + 60000) return grant.accessToken;
  const config = googleConfig();
  const token = await googleJson<{ access_token: string; expires_in: number; refresh_token?: string }>("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: grant.refreshToken, grant_type: "refresh_token" }) });
  if (!token.access_token) throw new GoogleConnectionError("Google authorization expired. Reconnect this account.", 502, true);
  grant.accessToken = token.access_token; grant.expiresAt = Date.now() + (token.expires_in || 0) * 1000; grant.refreshToken = token.refresh_token || grant.refreshToken;
  await saveGoogleGrant(grant);
  return token.access_token;
}
