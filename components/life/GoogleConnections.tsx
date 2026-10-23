"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ListTodo, Inbox, RefreshCw } from "lucide-react";
import { calendarAccount, mailboxes, type GoogleCalendarInfo } from "@/lib/life";

type Connection = { resource: "gmail" | "calendar" | "tasks"; account: string; connected: boolean; requiresReconnect?: boolean; canTrash?: boolean; canEdit?: boolean; syncStatus?: string; lastSyncedAt?: string | null; count?: number | null; message?: string | null; calendars?: GoogleCalendarInfo[] };
type Status = { configured: boolean; missing: string[]; redirectUri: string | null; connections?: Connection[]; error?: string; signInPath?: string; lastResult?: { ok: boolean; message: string; at: string } | null };

export default function GoogleConnections({ onRefresh }: { onRefresh: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [disconnect, setDisconnect] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await fetch("/api/google", { cache: "no-store" });
      const value = await result.json() as Status;
      setStatus(value);
      if (!result.ok) setError(value.error || "Couldn’t load Google connections.");
      else setError("");
    } catch { setError("Couldn’t load Google connections. Try reopening Connections."); }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);
  const update = async (connection: Connection, action: "refresh" | "disconnect") => {
    const id = `${connection.resource}:${connection.account}`;
    setBusy(id); setError("");
    try {
      const result = await fetch("/api/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, resource: connection.resource, account: connection.account }) });
      const value = await result.json() as { error?: string };
      if (!result.ok || value.error) { await load(); throw new Error(value.error || "Couldn’t update this connection."); }
      setDisconnect(""); await load(); onRefresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn’t update Google."); }
    finally { setBusy(""); }
  };
  const rows = [...mailboxes.map(box => ({ resource: "gmail" as const, account: box.account, label: `${box.label} inbox` })), { resource: "calendar" as const, account: calendarAccount, label: "Berkeley Calendar" }, {resource:"tasks" as const,account:calendarAccount,label:"Berkeley Google Tasks"}];
  return <section className="l-google-connections" aria-label="Direct Google connections">
    <p className="l-form-description">Connect each account directly to V.E.C.T.O.R.. Email imports cover the past 7 days; older mail loads from Archive. Gmail changes only when you explicitly delete a message. Calendar combines your checked Berkeley calendars. Google Tasks syncs task names, dates and completion both ways; new tasks go to the V.E.C.T.O.R. task list.</p>
    {error && <p className="l-form-error" role="alert">{error}</p>}
    {status?.lastResult && <p className={`l-google-result ${status.lastResult.ok ? "l-google-success" : "l-google-error"}`} role={status.lastResult.ok ? "status" : "alert"}>Last connection attempt: {status.lastResult.message}</p>}
    {status?.signInPath && <a className="l-button l-primary" href={status.signInPath} target="_top">Sign in to V.E.C.T.O.R.</a>}
    {!status && !error && <p role="status">Loading Google connections…</p>}
    {status && !status.configured && <details className="l-google-setup" open>
      <summary>Google sign-in needs setup</summary>
      <p>Create a Google Cloud OAuth client for a Web application, enable Gmail API, Google Calendar API and Google Tasks API, and configure the server values listed in <code>GOOGLE_SETUP.md</code>.</p>
      {status.missing.length > 0 ? <p>Missing: <code>{status.missing.join(", ")}</code></p> : <p>Check the redirect address and encryption key format.</p>}
      <p>Callback address: <code>{status.redirectUri || (typeof window !== "undefined" ? `${window.location.origin}/api/google/callback` : "/api/google/callback")}</code></p>
      <p>Your existing ChatGPT imports stay available while you set this up.</p>
    </details>}
    {rows.map(row => {
      const connection = status?.connections?.find(item => item.account === row.account && item.resource === row.resource);
      const id = `${row.resource}:${row.account}`;
      const syncFailed = connection?.connected && connection.syncStatus === "error";
      return <div className="l-connection-row l-direct-google-row" key={id}>
        <span className="l-service-icon">{row.resource === "gmail" ? <Inbox size={20}/> : row.resource === "tasks" ? <ListTodo size={20}/> : <CalendarDays size={20}/>}</span>
        <div><strong>{row.label}</strong><p>{row.account}</p><small className={connection?.connected ? "l-google-connected" : ""}>{!status ? "Checking connection…" : error && !status.connections ? "Connection status unavailable" : connection?.connected ? syncFailed ? "Connected · refresh needs attention" : "Connected directly" : "Not connected"}</small>{connection?.connected && <small>{connection.lastSyncedAt ? `Last imported ${new Date(connection.lastSyncedAt).toLocaleString()} · ${connection.count ?? 0} ${row.resource === "gmail" ? "messages" : row.resource === "tasks" ? "tasks" : "events"}` : "No successful import yet"}</small>}{connection?.connected && row.resource === "gmail" && !connection.canTrash && <small>Reconnect once to enable Gmail deletion. Reading still works.</small>}{syncFailed && <small className="l-google-error">{connection.message || "Couldn’t refresh. Your saved data is preserved."}</small>}{connection?.connected && row.resource === "calendar" && !syncFailed && connection.message && <small>{connection.message}</small>}{connection?.connected && row.resource === "calendar" && !!connection.calendars?.length && <details className="l-calendar-sources"><summary>{connection.calendars.filter(calendar => calendar.enabled).length} calendars included</summary><ul>{connection.calendars.map(calendar => <li key={calendar.id}><i style={{ backgroundColor: calendar.color || "var(--accent)" }}/><span>{calendar.name}{calendar.primary ? " · Primary" : ""}<small>{calendar.enabled ? "Included" : "Not selected in Google Calendar"}</small></span></li>)}</ul><a href={`https://calendar.google.com/calendar/r?authuser=${encodeURIComponent(calendarAccount)}`} target="_blank" rel="noreferrer">Choose calendars in Google Calendar</a><p>Check the calendars you want in Google Calendar, then click Refresh here.</p></details>}</div>
        <div className="l-google-actions">
          {connection?.connected && <button className="l-small-button" disabled={!!busy} onClick={() => update(connection, "refresh")}><RefreshCw size={12} className={busy === id ? "l-spin" : ""}/>Refresh</button>}
          {(!connection?.connected || connection.requiresReconnect || (row.resource === "gmail" && !connection.canTrash) || (row.resource === "calendar" && !connection.canEdit)) && <form method="post" action="/api/google/connect" target="_top">
            <input type="hidden" name="resource" value={row.resource}/><input type="hidden" name="account" value={row.account}/>
            <button className="l-small-button" disabled={!status?.configured || !!status.signInPath || !!busy}>{connection?.connected ? row.resource === "gmail" && !connection.canTrash ? "Enable Gmail delete" : row.resource === "calendar" && !connection.canEdit ? "Enable calendar editing" : "Reconnect" : "Connect Google"}</button>
          </form>}
          {connection?.connected && <button className="l-text-button" disabled={!!busy} onClick={() => setDisconnect(disconnect === id ? "" : id)}>Disconnect</button>}
          {connection?.connected && disconnect === id && <div className="l-google-unlink"><p>Stop syncing this account? Saved messages and events will remain.</p><button className="l-small-button" disabled={!!busy} onClick={() => update(connection, "disconnect")}>Disconnect from V.E.C.T.O.R.</button><button className="l-text-button" onClick={() => setDisconnect("")}>Cancel</button></div>}
        </div>
      </div>;
    })}
  </section>;
}
