import { getChatGPTUser } from "@/app/chatgpt-auth";
import { finishGoogleConnection, GoogleConnectionError, oauthCookie, saveGoogleGrant } from "@/lib/google-oauth";
import { readGoogleSnapshot, storeGoogleSnapshot } from "@/lib/google-direct";
import { save } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  let outcome = "connected";
  const user = await getChatGPTUser();
  try {
    if (!user) throw new GoogleConnectionError("Sign in to V.E.C.T.O.R., then try connecting Google again.");
    const cookie = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${oauthCookie}=`))?.slice(oauthCookie.length + 1);
    const grant = await finishGoogleConnection(request, user.userId, cookie);
    // Validate the actual provider read before replacing an existing connection.
    const snapshot = await readGoogleSnapshot(grant);
    await saveGoogleGrant(grant);
    await storeGoogleSnapshot(grant, snapshot);
    await save(`google:result:${user.userId}`, "google_result", { ok: true, message: `${grant.account} ${grant.resource === "gmail" ? "inbox" : grant.resource === "tasks" ? "tasks" : "calendar"} connected and imported successfully.`, account: grant.account, resource: grant.resource, at: new Date().toISOString() });
  } catch (error) {
    outcome = error instanceof GoogleConnectionError ? error.message : "Couldn’t finish Google sign-in. Try again from Connections.";
    if (user) await save(`google:result:${user.userId}`, "google_result", { ok: false, message: outcome, at: new Date().toISOString() }).catch(() => null);
  }
  const destination = new URL("/", request.url);
  destination.searchParams.set("google_connection", outcome);
  return new Response(null, { status: 303, headers: { Location: destination.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Set-Cookie": `${oauthCookie}=; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` } });
}
