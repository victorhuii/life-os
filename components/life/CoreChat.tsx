"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, ExternalLink, Loader2, MessageCircle, Plus, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { connectedPrompt, type CoreAction, type CoreAnswer, type CoreSource, type TaskDraft } from "@/lib/core";
import { safeUrl } from "@/lib/life";
import "./core-chat.css";

type Message = { id: string; role: "user" | "assistant"; text: string; answer?: CoreAnswer };
type ActionResult = { status: "saving" | "saved" | "error"; message?: string };
type Props = { open: boolean; onClose: () => void; onChanged: () => void; onBusy: (busy: boolean) => void };
const SITE_URL = "https://victor-life-os.heartyaspen1.chatgpt.site";
const starters = ["What needs my attention?", "When is my next midterm?", "Add a task to review lecture notes tomorrow", "Create an event in Google Calendar"];

export default function CoreChat({ open, onClose, onChanged, onBusy }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<"workspace" | "connected">("workspace");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const [error, setError] = useState("");
  const [signInPath, setSignInPath] = useState("");

  useEffect(() => {
    if (open && !dialog.current?.open) { dialog.current?.showModal(); composer.current?.focus(); }
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); }, [messages, busy, results, open]);
  useEffect(() => () => abort.current?.abort(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setError(""); setSignInPath("");
    const requestId = crypto.randomUUID();
    setMessages(current => [...current.slice(-38), { id: requestId, role: "user", text }]);
    if (mode === "connected") {
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: "Your request is ready for connected ChatGPT. Copy it, open ChatGPT, and send it with the Victor / Life OS app selected.", answer: { mode: "workspace", reply: "", sources: [], actions: [{ type: "chatgpt", request: text }] } }]);
      return;
    }
    setBusy(true); onBusy(true);
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/core", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, requestId }), signal: abort.current.signal });
      const answer = await response.json() as CoreAnswer & { error?: string; signInPath?: string };
      if (!response.ok) { if (answer.signInPath) setSignInPath(answer.signInPath); throw new Error(answer.error || "Couldn’t read your workspace."); }
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: answer.reply, answer }]);
    } catch (caught) {
      if (caught instanceof Error && caught.name !== "AbortError") { setError(caught.message); setInput(text); }
    } finally { setBusy(false); onBusy(false); }
  }

  async function confirm(action: CoreAction, draft?: TaskDraft) {
    if (action.type === "chatgpt" || results[action.requestId]?.status === "saving" || results[action.requestId]?.status === "saved") return;
    setResults(current => ({ ...current, [action.requestId]: { status: "saving" } }));
    try {
      const payload = action.type === "create_task" ? { ...action, draft: draft || action.draft } : { type: action.type, requestId: action.requestId, taskId: action.taskId };
      const response = await fetch("/api/core/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string; signInPath?: string };
      if (!response.ok || !result.ok) { if (result.signInPath) setSignInPath(result.signInPath); throw new Error(result.error || "The change was not confirmed."); }
      setResults(current => ({ ...current, [action.requestId]: { status: "saved", message: result.message } }));
      onChanged();
    } catch (caught) { setResults(current => ({ ...current, [action.requestId]: { status: "error", message: caught instanceof Error ? caught.message : "Couldn’t save. Try again." } })); }
  }

  return <dialog ref={dialog} className="l-core-chat" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }} aria-labelledby="core-chat-title">
    <div className="l-chat-header"><span className="l-chat-mark"><Sparkles size={19}/></span><div><h2 id="core-chat-title">Personal Core</h2><p>YOUR WORKSPACE, IN CONVERSATION</p></div><button className="l-icon-button" aria-label="Close Personal Core" onClick={onClose}><X size={19}/></button></div>
    <div className="l-chat-modes" role="group" aria-label="Assistant mode"><button aria-pressed={mode === "workspace"} onClick={() => setMode("workspace")}><MessageCircle size={13}/>Workspace</button><button aria-pressed={mode === "connected"} onClick={() => setMode("connected")}><ExternalLink size={12}/>Connected ChatGPT</button></div>
    <div className="l-chat-mode-note">{mode === "workspace" ? "Look up saved workspace information and prepare dashboard tasks. These replies use saved data." : "Live information and connected-app actions run in ChatGPT. Your request opens there after you copy it."}</div>
    <div className="l-chat-messages" aria-label="Core conversation" role="log" aria-live="polite" aria-relevant="additions">
      {!messages.length && <div className="l-chat-welcome"><div className="l-chat-welcome-core"><span/><span/><Sparkles size={25}/></div><p>LESS SWITCHING. MORE DOING.</p><h3>What would you like<br/>to take care of?</h3><span>Ask about your day, capture a task, or continue with ChatGPT to work across your connected apps.</span><div className="l-chat-starters">{starters.map(text => <button key={text} onClick={() => { setInput(text); composer.current?.focus(); }}>{text}<ArrowUpRight size={12}/></button>)}</div></div>}
      {messages.map(message => <article className={`l-chat-message l-chat-${message.role}`} key={message.id}>
        <div className="l-chat-author">{message.role === "user" ? "YOU" : "CORE · WORKSPACE"}</div>
        <div className="l-chat-text">{message.text}</div>
        {!!message.answer?.sources.length && <div className="l-chat-sources">{message.answer.sources.map((source, index) => <SourceCard source={source} key={index}/>)}</div>}
        {message.answer?.sourceUpdatedAt && <p className="l-chat-freshness">Saved source · {new Date(message.answer.sourceUpdatedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} PT</p>}
        {message.answer?.actions.map((action, index) => action.type === "chatgpt" ? <Handoff request={action.request} key={index}/> : action.type === "create_task" ? <TaskDraftCard key={action.requestId} action={action} result={results[action.requestId]} onConfirm={draft => confirm(action, draft)}/> : <div className="l-chat-task-action" key={action.requestId}><p>{action.title}</p><button disabled={results[action.requestId]?.status === "saving" || results[action.requestId]?.status === "saved"} className="l-button l-primary" onClick={() => confirm(action)}><Check size={13}/>{results[action.requestId]?.status === "saved" ? "Completed" : results[action.requestId]?.status === "saving" ? "Saving…" : "Mark complete"}</button>{results[action.requestId]?.message && <span role="status">{results[action.requestId].message}</span>}</div>)}
      </article>)}
      {busy && <div className="l-chat-thinking"><Loader2 size={14} className="l-spin"/>Reading your saved workspace…</div>}
      <div ref={bottom}/>
    </div>
    <form className="l-chat-composer" onSubmit={submit}>
      {error && <div className="l-chat-error" role="alert">{error}</div>}
      {signInPath && <a className="l-chat-signin" href={signInPath} target="_top">Sign in to Life OS<ArrowUpRight size={13}/></a>}
      <div><textarea ref={composer} autoFocus maxLength={3000} rows={2} aria-label="Message Personal Core" placeholder={mode === "workspace" ? "Ask about your day or add a task…" : "What would you like ChatGPT to do?"} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><button type="submit" disabled={!input.trim() || busy} aria-label={mode === "workspace" ? "Send workspace request" : "Prepare request for ChatGPT"}>{busy ? <Loader2 size={17} className="l-spin"/> : <Send size={17}/>}</button></div>
      <p><ShieldCheck size={10}/>{mode === "workspace" ? "Task changes wait for your click. Calendar actions run in ChatGPT." : "Nothing is sent automatically. Paste and send your request in ChatGPT."}</p>
    </form>
  </dialog>;
}

function SourceCard({ source }: { source: CoreSource }) {
  const content = <><span>{source.kind.toUpperCase()}</span><h4>{source.title}</h4><p>{source.detail}</p>{source.url && <ArrowUpRight size={12}/>}</>;
  return source.url ? <a className="l-chat-source" href={safeUrl(source.url)} target="_blank" rel="noreferrer">{content}</a> : <div className="l-chat-source">{content}</div>;
}
function Handoff({ request }: { request: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const prompt = connectedPrompt(request, SITE_URL);
  function copy() { setCopyError(false); if (!navigator.clipboard?.writeText) { setCopyError(true); return; } navigator.clipboard.writeText(prompt).then(() => setCopied(true)).catch(() => setCopyError(true)); }
  return <div className="l-chat-handoff"><div><ExternalLink size={15}/><h4>Continue with connected ChatGPT</h4></div><p>Use your authorized Calendar, Gmail, Drive and Life OS tools. In ChatGPT, select <strong>Victor / Life OS</strong> after installing it.</p><a className="l-button l-secondary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" onClick={copy}>{copied ? <Check size={13}/> : <Copy size={13}/>}Copy & open ChatGPT<ArrowUpRight size={13}/></a><small>{copied ? "Request copied. Paste it into ChatGPT and send." : copyError ? "Copy was blocked. Expand the prepared request below and copy it manually." : "Opens a separate tab. Nothing has been executed yet."}</small><details open={copyError}><summary>Review prepared request</summary><textarea aria-label="Prepared ChatGPT request" readOnly value={prompt} rows={7} onFocus={event => event.target.select()}/></details></div>;
}
function TaskDraftCard({ action, result, onConfirm }: { action: Extract<CoreAction, { type: "create_task" }>; result?: ActionResult; onConfirm: (draft: TaskDraft) => void }) {
  const [draft, setDraft] = useState(action.draft);
  const disabled = result?.status === "saving" || result?.status === "saved";
  return <form className="l-chat-task-draft" onSubmit={event => { event.preventDefault(); if (!disabled) onConfirm(draft); }}><div className="l-chat-draft-label"><Plus size={12}/>LIFE OS TASK DRAFT</div><label>Task<input aria-label="Draft task title" required maxLength={240} disabled={disabled} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label><div className="l-chat-draft-fields"><label>Due date<input aria-label="Draft task due date" type="date" disabled={disabled} value={draft.due} onChange={event => setDraft({ ...draft, due: event.target.value })}/></label><label>Space<select aria-label="Draft task category" disabled={disabled} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as TaskDraft["category"] })}><option>Personal</option><option>Work</option><option>School</option></select></label></div><div className="l-chat-draft-fields"><label>Priority<select aria-label="Draft task priority" disabled={disabled} value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as TaskDraft["priority"] })}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Minutes<input aria-label="Draft task minutes" type="number" min={5} max={480} required disabled={disabled} value={draft.minutes} onChange={event => setDraft({ ...draft, minutes: Number(event.target.value) })}/></label></div><button type="submit" className="l-button l-primary" disabled={disabled || !draft.title.trim()}>{result?.status === "saved" ? <Check size={13}/> : <Plus size={13}/>} {result?.status === "saved" ? "Added to Life OS" : result?.status === "saving" ? "Saving…" : "Add task"}</button>{result?.message && <p className={result.status === "error" ? "l-chat-error" : "l-chat-action-saved"} role="status">{result.message}</p>}<small>This saves to your dashboard, separate from Google Calendar.</small></form>;
}
