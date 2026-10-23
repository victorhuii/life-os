"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Loader2, Maximize2, MessageCircle, Minimize2, Plus, Send, ShieldCheck, X } from "lucide-react";
import { type CoreAction, type CoreAnswer, type CoreSource, type TaskDraft } from "@/lib/core";
import Wordmark from "./Wordmark";
import { safeUrl } from "@/lib/life";
import "./core-chat.css";

type Message = { id: string; role: "user" | "assistant"; text: string; answer?: CoreAnswer };
type ActionResult = { status: "saving" | "saved" | "error"; message?: string };
type Props = { open: boolean; onClose: () => void; onChanged: () => void; onBusy: (busy: boolean) => void; initialRequest?: { id: string; text: string; mode: "workspace" | "connected" }; inline?: boolean; compact?: boolean; onExpand?: () => void; avatar?: React.ReactNode };
const starters = ["What’s due next?", "When is my next midterm?", "Summarize my emails", "Add a task to review lecture notes tomorrow"];

export default function CoreChat({ open, onClose, onChanged, onBusy, initialRequest, inline = false, compact = false, onExpand, avatar }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const lastInitialRequest = useRef("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const [error, setError] = useState("");
  const [signInPath, setSignInPath] = useState("");
  const actionSaving = Object.values(results).some(result => result.status === "saving");
  useEffect(() => { onBusy(busy || actionSaving); }, [busy, actionSaving, onBusy]);

  useEffect(() => {
    if (inline) { if (open) composer.current?.focus(); return; }
    if (open && !dialog.current?.open) { dialog.current?.showModal(); composer.current?.focus(); }
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open, inline, compact]);
  useEffect(() => { const container=bottom.current?.parentElement;if(open&&container)container.scrollTo({top:container.scrollHeight,behavior:"auto"}); }, [messages, busy, results, open]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!open || busy || !initialRequest || lastInitialRequest.current === initialRequest.id) return;
    lastInitialRequest.current = initialRequest.id;
    void send(initialRequest.text);
  }, [open, initialRequest, busy]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await send(input);
  }
  async function send(value: string) {
    const text = value.trim();
    if (!text || busy) return;
    setInput(""); setError(""); setSignInPath("");
    const requestId = crypto.randomUUID();
    setMessages(current => [...current.slice(-38), { id: requestId, role: "user", text }]);
    setBusy(true);
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/core", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, requestId }), signal: abort.current.signal });
      const answer = await response.json() as CoreAnswer & { error?: string; signInPath?: string };
      if (!response.ok) { if (answer.signInPath) setSignInPath(answer.signInPath); throw new Error(answer.error || "Couldn’t read your workspace."); }
      setMessages(current => [...current, { id: crypto.randomUUID(), role: "assistant", text: answer.reply, answer }]);
    } catch (caught) {
      if (caught instanceof Error && caught.name !== "AbortError") { setError(caught.message); setInput(text); }
    } finally { setBusy(false); }
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

  const content = <>
    <div className="l-chat-header"><span className={`l-chat-mark ${avatar ? "l-chat-avatar" : ""}`}>{avatar || <MessageCircle size={18}/>}</span><div><h2 id="core-chat-title"><Wordmark/></h2><p>{busy ? "Reading your saved workspace" : actionSaving ? "Saving your task…" : "WORKSPACE ASSISTANT · READY"}</p></div><a className="l-icon-button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" aria-label="Open ChatGPT"><ArrowUpRight size={16}/></a>{inline && compact && onExpand && <button className="l-icon-button" aria-label="Expand assistant" title="Expand chat" onClick={onExpand}><Maximize2 size={16}/></button>}<button className="l-icon-button" aria-label={inline ? compact ? "Close dashboard chat" : "Minimize assistant" : "Close assistant"} onClick={onClose}>{inline && !compact ? <Minimize2 size={16}/> : <X size={16}/>}</button></div>
    <div className="l-chat-messages" aria-label="Core conversation" role="log" aria-live="polite" aria-relevant="additions">
      {!messages.length && <div className="l-chat-welcome">{avatar && <div className="l-chat-welcome-orb" aria-hidden="true">{avatar}</div>}<div className="l-chat-welcome-mark"><MessageCircle size={25} strokeWidth={1.4}/></div><h3>How can I help?</h3><span>Look up a deadline, find an email, or plan what’s next.</span><div className="l-chat-starters">{starters.map(text => <button key={text} onClick={() => { setInput(text); composer.current?.focus(); }}>{text}<ArrowUpRight size={12}/></button>)}</div></div>}
      {messages.map(message => <article className={`l-chat-message l-chat-${message.role}`} key={message.id}>
        <div className="l-chat-author">{message.role === "user" ? "You" : "Assistant"}</div>
        <div className="l-chat-text">{message.text}</div>
        {!!message.answer?.sources.length && <div className="l-chat-sources">{message.answer.sources.map((source, index) => <SourceCard source={source} key={index}/>)}</div>}
        {message.answer?.sourceUpdatedAt && <p className="l-chat-freshness">Saved source · {new Date(message.answer.sourceUpdatedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} PT</p>}
        {message.answer?.actions.map((action) => action.type === "chatgpt" ? null : action.type === "create_task" ? <TaskDraftCard key={action.requestId} action={action} result={results[action.requestId]} onConfirm={draft => confirm(action, draft)}/> : <div className="l-chat-task-action" key={action.requestId}><p>{action.title}</p><button disabled={results[action.requestId]?.status === "saving" || results[action.requestId]?.status === "saved"} className="l-button l-primary" onClick={() => confirm(action)}><Check size={13}/>{results[action.requestId]?.status === "saved" ? "Completed" : results[action.requestId]?.status === "saving" ? "Saving…" : "Mark complete"}</button>{results[action.requestId]?.message && <span role="status">{results[action.requestId].message}</span>}</div>)}
      </article>)}
      {busy && <div className="l-chat-thinking">{avatar ? <span className="l-thinking-orb" aria-hidden="true">{avatar}</span> : <Loader2 size={14} className="l-spin"/>}<span className="l-thinking-copy">Reading your saved workspace…<small>Checking your saved sources</small></span></div>}
      <div ref={bottom}/>
    </div>
    <form className="l-chat-composer" onSubmit={submit}>
      {error && <div className="l-chat-error" role="alert">{error}</div>}
      {signInPath && <a className="l-chat-signin" href={signInPath} target="_top">Sign in to V.E.C.T.O.R.<ArrowUpRight size={13}/></a>}
      <div><textarea ref={composer} autoFocus maxLength={3000} rows={2} aria-label="Message assistant" placeholder="Ask about your day or add a task…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><button type="submit" disabled={!input.trim() || busy} aria-label="Send workspace request">{busy ? <Loader2 size={17} className="l-spin"/> : <Send size={17}/>}</button></div>
      <p><ShieldCheck size={10}/>Task changes wait for your confirmation.</p>
    </form>
  </>;
  return inline ? <section className={`l-core-chat l-core-inline ${compact ? "l-core-dashboard" : ""}`} data-activity={busy || actionSaving ? "working" : "idle"} aria-labelledby="core-chat-title">{content}</section> : <dialog ref={dialog} className="l-core-chat" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }} aria-labelledby="core-chat-title">{content}</dialog>;
}

function SourceCard({ source }: { source: CoreSource }) {
  const content = <><span>{source.kind.toUpperCase()}</span><h4>{source.title}</h4><p>{source.detail}</p>{source.url && <ArrowUpRight size={12}/>}</>;
  return source.url ? <a className="l-chat-source" href={safeUrl(source.url)} target="_blank" rel="noreferrer">{content}</a> : <div className="l-chat-source">{content}</div>;
}
function TaskDraftCard({ action, result, onConfirm }: { action: Extract<CoreAction, { type: "create_task" }>; result?: ActionResult; onConfirm: (draft: TaskDraft) => void }) {
  const [draft, setDraft] = useState(action.draft);
  const disabled = result?.status === "saving" || result?.status === "saved";
  return <form className="l-chat-task-draft" onSubmit={event => { event.preventDefault(); if (!disabled) onConfirm(draft); }}><div className="l-chat-draft-label"><Plus size={12}/>Task draft</div><label>Task<input aria-label="Draft task title" required maxLength={240} disabled={disabled} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label><div className="l-chat-draft-fields"><label>Due date<input aria-label="Draft task due date" type="date" disabled={disabled} value={draft.due} onChange={event => setDraft({ ...draft, due: event.target.value })}/></label><label>Category<select aria-label="Draft task category" disabled={disabled} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as TaskDraft["category"] })}><option>Personal</option><option>Work</option><option>School</option></select></label></div><div className="l-chat-draft-fields"><label>Priority<select aria-label="Draft task priority" disabled={disabled} value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as TaskDraft["priority"] })}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label>Minutes<input aria-label="Draft task minutes" type="number" min={5} max={480} required disabled={disabled} value={draft.minutes} onChange={event => setDraft({ ...draft, minutes: Number(event.target.value) })}/></label></div><button type="submit" className="l-button l-primary" disabled={disabled || !draft.title.trim()}>{result?.status === "saved" ? <Check size={13}/> : <Plus size={13}/>} {result?.status === "saved" ? "Added to V.E.C.T.O.R." : result?.status === "saving" ? "Saving…" : "Add task"}</button>{result?.message && <p className={result.status === "error" ? "l-chat-error" : "l-chat-action-saved"} role="status">{result.message}</p>}<small>This saves to your dashboard, separate from Google Calendar.</small></form>;
}
