import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { response, sameOrigin } from "@/lib/store";
import { beginGoogleConnection, GoogleConnectionError, googleTarget, oauthCookie } from "@/lib/google-oauth";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return response({ error: "Origin rejected." }, 403);
  const user = await getChatGPTUser();
  if (!user) return Response.redirect(new URL(chatGPTSignInPath("/"), request.url), 303);
  try {
    if (Number(request.headers.get("content-length") || 0) > 2000) return response({ error: "Request too large." }, 413);
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return response({ error: "Use the Google connection form." }, 400);
    const raw = await request.text();
    if (raw.length > 2000) return response({ error: "Request too large." }, 413);
    const form = new URLSearchParams(raw);
    const target = googleTarget(form.get("resource"), form.get("account"));
    const result = await beginGoogleConnection(target, user.userId, request);
    return new Response(null, { status: 303, headers: { Location: result.url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Set-Cookie": `${oauthCookie}=${result.browser}; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=600${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` } });
  } catch (error) { return response({ error: error instanceof GoogleConnectionError ? error.message : "Couldn’t start Google sign-in." }, error instanceof GoogleConnectionError ? error.status : 503); }
}
