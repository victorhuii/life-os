"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ListTodo, Loader2, Maximize2, Minimize2, Pencil, Plus } from "lucide-react";
import { calendarAccount,dayKey, type Source,type Task, type ShoppingItem } from "@/lib/life";
import "./notepad.css";

type Props = { tasksSource?:Source;onConnections:()=>void; shoppingItems: ShoppingItem[]; tasks: Task[]; note: string; ready: boolean; expanded: boolean; onExpand: () => void; onChanged: () => Promise<void> };
export default function Notepad({tasksSource,onConnections, shoppingItems, tasks, note, ready, expanded, onExpand, onChanged }: Props) {
  const [shopping, setShopping] = useState(false);
  const [shoppingGroup, setShoppingGroup] = useState<ShoppingItem['group']>("online");
  const list = shopping ? shoppingItems.filter(item => item.group === shoppingGroup) : tasks;
  const taskAction = (task: Task) => shopping ? {action:"shoppingItem",value:{...task,group:shoppingGroup}} : {action:"task",value:task};
  const switchList = () => {editLocked.current=true;setEditing("");setInput("");setCompleted(false);setError("");};
  const [input, setInput] = useState("");
  const [taskDate,setTaskDate]=useState(()=>dayKey()),[syncWarning,setSyncWarning]=useState("");
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  const editLocked = useRef(false);
  const migrating = useRef(false);
  async function mutate(body: unknown, id: string) {
    if (busy) return false;
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as {ok?:boolean;error?:string;syncWarning?:string};
      if (!response.ok || !result.ok) throw new Error(result.error || "Couldn’t save this task. Please retry.");
      setSyncWarning(result.syncWarning||"");await onChanged(); return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn’t save. Your entry is still here."); return false; }
    finally { setBusy(""); }
  }
  useEffect(() => {
    if (!ready || !note.trim() || migrating.current) return;
    migrating.current = true;
    void mutate({ action: "migrateNote" }, "migration").then(ok => { if (!ok) migrating.current = false; });
  }, [ready, note]); // The server atomically preserves the note and converts each line once.
  useEffect(()=>{
    let running=false,stopped=false;
    const refresh=async()=>{if(running||document.visibilityState!=="visible")return;running=true;try{const response=await fetch("/api/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"refresh_auto",resource:"tasks",account:calendarAccount})});const result=await response.json() as {connected?:boolean;skipped?:boolean;error?:string};if(!stopped&&result.connected&&!result.skipped)await onChanged();}catch{/* Pending changes remain saved for retry. */}finally{running=false;}};
    void refresh();const timer=setInterval(refresh,60000);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
    return()=>{stopped=true;clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
  },[]);
  const visible = list.filter(task => task.done === completed).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const groups = new Map<string, Task[]>();
  const urgent = visible.filter(task => task.priority === "high");
  if (urgent.length) groups.set("Urgent !!!", urgent);
  for (const task of visible.filter(task => task.priority !== "high")) {
    const date = !shopping&&task.due ? task.due : task.createdAt ? dayKey(new Date(task.createdAt)) : "Earlier tasks";
    groups.set(date, [...(groups.get(date) || []), task]);
  }
  const label = (date: string) => ["Earlier tasks", "Urgent !!!"].includes(date) ? date : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(`${date}T12:00:00Z`));
  async function rename(task: Task) {
    if (editLocked.current) return;
    const title = draft.trim();
    if (!title) { setError("Enter a task name."); return; }
    editLocked.current = true;
    if (title === task.title || await mutate(taskAction({ ...task, title }), task.id)) setEditing("");
    else editLocked.current = false;
  }
  return <section className="l-panel l-notepad-panel" aria-labelledby="notepad-heading">
    <header className="l-panel-header"><div className="l-section-title"><ListTodo size={17}/><h2 id="notepad-heading"><button data-focus-trigger aria-expanded={expanded} onClick={onExpand}>Tasks{!expanded && <Maximize2 size={12}/>}</button></h2></div>{expanded && <button className="l-icon-button" aria-label="Minimize Tasks" onClick={onExpand}><Minimize2 size={16}/></button>}</header>
    <div className="l-checklist-tabs" role="group" aria-label="List type" data-no-focus>{[false,true].map(value=><button key={String(value)} aria-pressed={shopping===value} disabled={!!busy} onMouseDown={event=>event.preventDefault()} onClick={()=>{switchList();setShopping(value);}}>{value?"Shopping List":"Tasks"}</button>)}</div>
    {shopping && <div className="l-checklist-tabs l-shopping-tabs" role="group" aria-label="Shopping category" data-no-focus>{([['online','Online'],['clothes','Clothes'],['groceries','Groceries']] as const).map(([id,label])=><button key={id} aria-pressed={shoppingGroup===id} disabled={!!busy} onMouseDown={event=>event.preventDefault()} onClick={()=>{switchList();setShoppingGroup(id);}}>{label}</button>)}</div>}
    <div className="l-checklist" data-no-focus>
      <form className="l-checklist-add" onSubmit={async event => { event.preventDefault(); const title=input.trim(); if (!title) return; if (await mutate(taskAction({ id: crypto.randomUUID(), title, done: false, priority: "normal", category: "Personal", due: shopping ? "" : taskDate, minutes: 30 }), "add")) setInput(""); }}><input aria-label={shopping ? "New shopping item" : "New task"} placeholder={shopping ? "Add an item…" : "Add a task…"} maxLength={240} value={input} disabled={!ready || !!busy} onChange={event => setInput(event.target.value)}/>{!shopping&&<input className="l-checklist-date-input" type="date" aria-label="New task date" value={taskDate} required disabled={!ready||!!busy} onChange={event=>setTaskDate(event.target.value)}/>}<button type="submit" className="l-icon-button" aria-label={shopping ? "Add shopping item" : "Add task"} disabled={!ready || !!busy || !input.trim()}>{busy === "add" ? <Loader2 size={15} className="l-spin"/> : <Plus size={16}/>}</button></form>
      <div className="l-checklist-items">{!ready ? <p className="l-checklist-empty">Loading tasks…</p> : groups.size ? [...groups].map(([date, items]) => <section className="l-checklist-date" key={date}><h3 className={date === "Urgent !!!" ? "l-checklist-urgent-heading" : undefined}>{label(date)}</h3>{items.map(task => <div className={`l-checklist-row ${task.done ? "l-checklist-done" : ""}`} key={task.id}>{editing === task.id ? <input className="l-checklist-rename" aria-label="Edit task name" value={draft} maxLength={240} autoFocus disabled={!!busy} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)} onBlur={() => void rename(task)} onKeyDown={event => {if (event.key === "Enter") {event.preventDefault();void rename(task);} else if (event.key === "Escape") {editLocked.current=true;setEditing("");setError("");}}}/> : <><span>{task.title}</span><button className="l-icon-button l-checklist-edit" aria-label={`Edit ${task.title}`} title="Edit task name" disabled={!!busy} onClick={() => {editLocked.current=false;setDraft(task.title);setEditing(task.id);setError("");}}><Pencil size={12}/></button></>}{!shopping && <button className="l-checklist-urgent" aria-label={`${task.priority === "high" ? "Remove urgent status from" : "Mark urgent:"} ${task.title}`} aria-pressed={task.priority === "high"} title="Urgent !!!" disabled={!!busy || editing === task.id} onClick={() => void mutate({action:"task",value:{...task,priority:task.priority === "high" ? "normal" : "high"}},task.id)}>!!!</button>}<input type="checkbox" checked={task.done} disabled={!!busy} aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`} onChange={() => void mutate(taskAction({ ...task, done: !task.done }), task.id)}/></div>)}</section>) : <p className="l-checklist-empty">{completed ? "No completed tasks yet." : shopping ? "Your list is clear. Add an item above." : "A clear list. Add your next task above."}</p>}</div>
      {syncWarning&&<p className="l-task-sync-warning" role="status">{syncWarning}</p>}
      {error && <div role="alert" className="l-notepad-error">{error}{note.trim() && <button disabled={!!busy} onClick={() => void mutate({action:"migrateNote"},"migration")}>Retry importing note</button>}</div>}
    </div>
    <footer className="l-panel-footer l-notepad-footer"><span role="status">{busy ? <Loader2 size={11} className="l-spin"/> : <Check size={11}/>} {busy ? "Saving…" : `${list.filter(task => !task.done).length} open`}{!shopping&&<button className="l-task-google-status" onClick={onConnections} title={tasksSource?.message||"Connect Berkeley Google Tasks"}>{!tasksSource?.updatedAt?"Connect Google Tasks":tasks.some(task=>task.googleSyncPending)?"Google sync pending":tasksSource.status==="error"?"Google sync needs attention":"Google Tasks synced"}</button>}</span><button className="l-text-button" aria-pressed={completed} onClick={() => setCompleted(!completed)}>{completed ? "Back to open" : `Completed (${list.filter(task => task.done).length})`}</button></footer>
  </section>;
}
