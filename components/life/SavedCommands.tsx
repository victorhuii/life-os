"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, ChevronDown, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SavedCommand } from "@/lib/life";
import "./saved-commands.css";

type Props = { commands: SavedCommand[]; ready: boolean; currentPrompt: string; busy: boolean; onRun: (prompt: string) => void; onChanged: (command: SavedCommand, deleted?: boolean) => void };

export default function SavedCommands({ commands, ready, currentPrompt, busy, onRun, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<SavedCommand | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const editing = !!draft;
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1001px)");
    const update = () => setExpanded(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (editing && !dialog.current?.open) dialog.current?.showModal(); else if (!editing) dialog.current?.close(); }, [editing]);

  async function save(command: SavedCommand, deleted = false) {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deleted ? { action: "deleteCommand", id: command.id } : { action: "saveCommand", value: command }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Couldn’t save the command. Try again.");
      onChanged(command, deleted); setDraft(null); setExpanded(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn’t save. Try again."); }
    finally { setSaving(false); }
  }
  function edit(command?: SavedCommand) {
    setError("");
    setDraft(command ? { ...command } : { id: crypto.randomUUID(), label: "", prompt: currentPrompt.trim() });
  }
  return <div className="l-saved-commands" data-no-focus>
    <div className="l-command-heading"><button className="l-command-disclosure" aria-expanded={expanded} aria-controls="saved-command-list" onClick={() => setExpanded(!expanded)}><Bookmark size={12}/><span>Saved commands</span>{commands.length > 0 && <small>{commands.length}</small>}<ChevronDown size={12}/></button><button className="l-command-add" title={currentPrompt.trim() ? "Save your current prompt as a command" : "Create a saved command"} disabled={!ready || saving || commands.length >= 20} onClick={() => edit()}><Plus size={12}/><span>Save{currentPrompt.trim() ? " prompt" : " new"}</span></button></div>
    <div id="saved-command-list" hidden={!expanded}>
      {commands.length > 0 ? <div className="l-command-list">{commands.map(command => <div className="l-command-row" key={command.id}><button className="l-command-run" disabled={busy} aria-label={`Run saved command: ${command.label}`} title={command.prompt} onClick={() => onRun(command.prompt)}><span>{command.label}</span><ArrowUpRight size={12}/></button><button className="l-command-icon" disabled={saving} aria-label={`Edit command: ${command.label}`} onClick={() => edit(command)}><Pencil size={12}/></button><button className="l-command-icon" disabled={saving} aria-label={`Delete command: ${command.label}`} onClick={() => { void save(command, true); }}><Trash2 size={12}/></button></div>)}</div> : <div className="l-command-empty"><p>Keep your go-to prompts one click away.</p><div>{["What’s due next?", "Summarize my emails"].map(prompt => <button disabled={busy} key={prompt} onClick={() => onRun(prompt)}>{prompt}<ArrowUpRight size={11}/></button>)}</div></div>}
    </div>
    {error && !draft && <p className="l-command-error" role="alert">{error}</p>}
    <dialog ref={dialog} className="l-modal l-command-modal" aria-labelledby="command-editor-title" onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!saving) setDraft(null); }} onClick={event => { if (event.target === dialog.current && !saving) setDraft(null); }}><header><h2 id="command-editor-title">{commands.some(command => command.id === draft?.id) ? "Edit command" : "Save a command"}</h2><button className="l-icon-button" aria-label="Close command editor" disabled={saving} onClick={() => setDraft(null)}><X size={17}/></button></header>{draft && <form className="l-modal-body" onSubmit={event => { event.preventDefault(); void save(draft); }}><label className="l-field">Name<input autoFocus required maxLength={60} placeholder="e.g. Plan my day" disabled={saving} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })}/></label><label className="l-field">Prompt<textarea required rows={5} maxLength={3000} placeholder="What should V.E.C.T.O.R. help you with?" disabled={saving} value={draft.prompt} onChange={event => setDraft({ ...draft, prompt: event.target.value })}/></label><p className="l-form-description">Saves a reusable prompt. Run it whenever you need it; task changes still wait for confirmation.</p>{error && <p className="l-command-error" role="alert">{error}</p>}<div className="l-form-actions"><button className="l-button l-primary" type="submit" disabled={saving || !draft.label.trim() || !draft.prompt.trim()}>{saving ? <Loader2 size={13} className="l-spin"/> : <Bookmark size={13}/>}Save command</button><button type="button" className="l-text-button" disabled={saving} onClick={() => setDraft(null)}>Cancel</button></div></form>}</dialog>
  </div>;
}
