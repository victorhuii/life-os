"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, MailCheck, Eye, EyeOff, StickyNote, Cloud, CloudMoon, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Clock3, FileText, Inbox, LayoutGrid, Link2, Loader2, MapPin, Maximize2, Minimize2, MessageCircle, Moon, Plus, RefreshCw, Search, Settings2, Sun, Sunrise, Trash2, X } from "lucide-react";
import { courseDay } from "@/lib/canvas";
import {calHacksAccount,inboxViewMail} from "@/lib/cal-hacks-mail";
import { calendarAccount, mailAccount, mailboxes, mailboxSource, dayKey, eventOnDay, safeUrl, timezone, type MailboxAccount, type CourseItem, type Coursework, type LifeEvent, type Mail, type State, type SavedCommand } from "@/lib/life";
import { weatherLabel, weatherLocations, type Weather, type WeatherLocation } from "@/lib/weather";
import CalendarWorkspace from "./CalendarWorkspace";
import CoreChat from "./CoreChat";
import Wordmark from "./Wordmark";
import useCalendarVisibility from "./useCalendarVisibility";
import useOrbMorph from "./useOrbMorph";
import AssistantVisual from "./AssistantVisual";
import { ThemeToggle } from "./Theme";
import DashboardDate from "./DashboardDate";
import GoogleConnections from "./GoogleConnections";
import JobsWorkspace from "./JobsWorkspace";
import Notepad from "./Notepad";
import MailReader from "./MailReader";
import MailGroups from "./MailGroups";
import MailLab from "./MailLab";
import Summaries from "./Summaries";
import useSummaryCheckpoint from "./useSummaryCheckpoint";
import useMailImport from "./useMailImport";
import {mailInRange,type MailRange} from "@/lib/mail-range";
import useMailClassifier from "./useMailClassifier";
import useMailAttention from "./useMailAttention";
import {attentionAccount} from "@/lib/mail-attention";
import SavedCommands from "./SavedCommands";
import "./dashboard.css";
import "./focus-dashboard.css";
import "./orb-motion.css";

type View = "Today" | "Calendar" | "Inbox" | "Coursework" | "Weather" | "Assistant" | "Notepad";
type ChatRequest = { id: string; text: string; mode: "workspace" | "connected" };
const initial: State = { tasks: [], events: [], emails: [], note: "", briefing: null, sources: {}, schedule: { enabled: false, time: "07:00", timezone }, loadedAt: "" };
const canvasUrl = "https://bcourses.berkeley.edu";
const format = (value: Date | string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options }).format(typeof value === "string" ? new Date(value) : value);
const time = (value: string) => format(value, { hour: "numeric", minute: "2-digit" });
const dateLabel = (day: string, weekday = false) => format(`${day}T12:00:00Z`, { ...(weekday ? { weekday: "long" as const } : {}), month: "short", day: "numeric" });
function addDays(day: string, n: number) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); }
function monday(day: string) { const date = new Date(`${day}T12:00:00Z`); return addDays(day, -((date.getUTCDay() + 6) % 7)); }
function relative(value?: string) { if (!value) return "Not synced yet"; const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); return minutes < 1 ? "Just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : dateLabel(dayKey(new Date(value))); }
function dueLabel(item: CourseItem, today: string) { const day = courseDay(item); return day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : dateLabel(day); }
const isMailRead = (mail: Mail) => mail.locallyRead ?? (mail.unread === false);
function WeatherIcon({ code, isDay = true, size = 28 }: { code: number; isDay?: boolean; size?: number }) { const Icon = code === 0 ? isDay ? Sun : Moon : code <= 2 ? isDay ? CloudSun : CloudMoon : code === 3 ? Cloud : code <= 48 ? CloudFog : code <= 57 ? CloudDrizzle : code <= 67 ? CloudRain : code <= 77 ? CloudSnow : code <= 82 ? CloudRain : code <= 86 ? CloudSnow : CloudLightning; return <Icon size={size} strokeWidth={1.5}/>; }
function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={ref} className={`l-modal ${wide ? "l-wide" : ""}`} aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}><header><h2 id="modal-title">{title}</h2><button className="l-icon-button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></header><div className="l-modal-body">{children}</div></dialog>;
}

export default function Dashboard() {
  const [data, setData] = useState<State>(initial);
  const [mailRange,setMailRange]=useState<MailRange>("week"),[mailNow,setMailNow]=useState(Date.now()),[mailVisible,setMailVisible]=useState(50);
  const summaryCheckpoint=useSummaryCheckpoint(data.loadedAt);
  const classifier = useMailClassifier(data.emails,mailRange,mailNow);
  const [product, setProduct] = useState<"overview" | "jobs" | "mail-lab" | "summaries">("overview");
  const [activeMailbox, setActiveMailbox] = useState<MailboxAccount>(mailboxes[0].account);
  const activeBox = mailboxes.find(box => box.account === activeMailbox)!;
  const activeMailSource = mailboxSource(data.sources, activeMailbox);
  const accountMail = (account: MailboxAccount) => data.emails.filter(mail => mailAccount(mail, data.sources.gmail) === account && mailInRange(mail,mailRange,mailNow));
  const inboxMail = accountMail(activeMailbox);
  const gmailUrl = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(activeMailbox)}`;
  const calendarUrl = `https://calendar.google.com/calendar/r?authuser=${encodeURIComponent(calendarAccount)}`;
  const allCalendarEvents = data.events.filter(event => event.source === "Google Calendar" && (event.account || data.sources.calendar?.account) === calendarAccount);
  const calendarVisibility = useCalendarVisibility(allCalendarEvents);
  const calendarEvents = calendarVisibility.visibleEvents;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setViewState] = useState<View>("Today");
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [modal, setModal] = useState("");
  const [query, setQuery] = useState("");
  const [today, setToday] = useState(dayKey());
  const [selectedDay, setSelectedDay] = useState(dayKey());
  const [week, setWeek] = useState(monday(dayKey()));
  const [mailFilter, setMailFilter] = useState("attention");
  const [courseFilter, setCourseFilter] = useState("upcoming");
  const [mailBusy, setMailBusy] = useState("");
  const [mailError, setMailError] = useState("");
  const [mailReconnect, setMailReconnect] = useState(false);
  const [trashMail, setTrashMail] = useState<Mail | null>(null);
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);
  const [summaryMail,setSummaryMail]=useState<Mail|null>(null);
  const [weatherMode, setWeatherMode] = useState<"hours" | "days">("hours");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [location, setLocation] = useState<WeatherLocation>("berkeley");
  const [coreBusy, setCoreBusy] = useState(false);
  const [chatRequest, setChatRequest] = useState<ChatRequest | undefined>();
  const [chatInput, setChatInput] = useState("");
  const [dashboardChat, setDashboardChat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [canvasError, setCanvasError] = useState("");
  const [canvasSignInPath, setCanvasSignInPath] = useState("");
  const [feed, setFeed] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const loadId = useRef(0);
  const weatherId = useRef(0);
  const board = useRef<HTMLDivElement>(null);
  const orbMorph = useOrbMorph(board);
  const previousRects = useRef(new Map<string, DOMRect>());
  const lastFeature = useRef("Assistant");
  const setView = useCallback((next: View) => {
    if (next === "Assistant") setDashboardChat(true);
    orbMorph.prepare(next);
    const widgets = board.current?.querySelectorAll<HTMLElement>("[data-widget]");
    previousRects.current.clear();
    widgets?.forEach(widget => previousRects.current.set(widget.dataset.widget!, widget.getBoundingClientRect()));
    widgets?.forEach(widget => widget.getAnimations().forEach(animation => animation.cancel()));
    if (next !== "Today") lastFeature.current = next;
    setViewState(next);
  }, [orbMorph.prepare]);
  useLayoutEffect(() => {
    const widgets = board.current?.querySelectorAll<HTMLElement>("[data-widget]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (view === "Assistant" && window.matchMedia("(max-width: 720px)").matches) board.current?.scrollIntoView({ block: "start", behavior: "instant" });
    const morphing = orbMorph.play(view);
    if (motionEnabled && !reduced) widgets?.forEach(widget => {
      if (morphing && widget.dataset.widget === "Assistant") return;
      const before = previousRects.current.get(widget.dataset.widget!);
      const after = widget.getBoundingClientRect();
      if (!before || !before.width || !after.width || !after.height) return;
      widget.animate([
        { transformOrigin: "0 0", transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
        { transformOrigin: "0 0", transform: "none" },
      ], { duration: 430, easing: "cubic-bezier(.22,.8,.22,1)" });
    });
    previousRects.current.clear();
    if (!morphing && view !== "Today" && window.matchMedia("(max-width: 720px)").matches) board.current?.scrollIntoView({ block: "start", behavior: motionEnabled && !reduced ? "smooth" : "auto" });
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest("[hidden]")) {
      const name = view === "Today" ? lastFeature.current : view;
      board.current?.querySelector<HTMLButtonElement>(`[data-widget="${name}"] [data-focus-trigger]:not([hidden])`)?.focus({ preventScroll: true });
    }
  }, [view, motionEnabled, orbMorph.play]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setMotionEnabled(!reduced.matches);
    updateMotion(); reduced.addEventListener("change", updateMotion);
    return () => reduced.removeEventListener("change", updateMotion);
  }, []);


  const load = useCallback(async (first = false) => {
    const id = ++loadId.current; if (!first) setRefreshing(true);
    try {
      // Refresh the course feed independently. A slow feed does not hold up
      // the main dashboard; a failed feed keeps its last saved items.
      let refreshedCoursework: Coursework | undefined;
      void fetch("/api/canvas", { cache: "no-store" }).then(async result => {
        if (result.ok) { const value = await result.json() as Coursework; refreshedCoursework = value; if (id === loadId.current) setData(current => ({ ...current, coursework: value })); }
      }).catch(() => null);
      const response = await fetch("/api/state", { cache: "no-store" });
      const state = await response.json() as State & { error?: string };
      if (!response.ok) throw new Error(state.error || "Couldn’t load your dashboard.");
      if (id === loadId.current) { setData({ ...state, coursework: refreshedCoursework || state.coursework }); setError(""); }
    } catch (caught) { if (id === loadId.current) setError(caught instanceof Error ? caught.message : "Couldn’t load your dashboard."); }
    finally { if (id === loadId.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  const mailImport=useMailImport(data.sources,load);
  useEffect(()=>{setMailVisible(50);setSelectedMail(null);},[activeMailbox,mailRange,mailFilter]);
  useEffect(()=>{if(summaryMail){setSelectedMail(summaryMail);setSummaryMail(null);}},[summaryMail]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google_connection");
    if (result) {
      setNotice(result === "connected" ? "Google connected. Your data has been imported." : result);
      setModal("connections");
      params.delete("google_connection");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    }
    let stopped = false, running = false;
    const refreshGoogle = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const response = await fetch("/api/google", { cache: "no-store" });
        if (!response.ok) return;
        const value = await response.json() as { configured: boolean; connections?: { connected: boolean; resource: string; account: string }[] };
        if (!value.configured) return;
        // One request per connection keeps provider calls within Worker limits.
        const results = await Promise.allSettled((value.connections || []).filter(item => item.connected).map(async item => {
          const refreshed = await fetch("/api/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh_auto", resource: item.resource, account: item.account }) });
          return refreshed.json() as Promise<{ connected?: boolean; skipped?: boolean }>;
        }));
        if (!stopped && results.some(result => result.status === "fulfilled" && result.value.connected && !result.value.skipped)) await load();
      } catch { /* Preserve saved data when offline. */ }
      finally { running = false; }
    };
    void refreshGoogle();
    const timer = setInterval(refreshGoogle, 5 * 60000);
    document.addEventListener("visibilitychange", refreshGoogle);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", refreshGoogle); };
  }, [load]);
  const loadWeather = useCallback(async (city: WeatherLocation) => {
    const id = ++weatherId.current; setWeatherLoading(true);
    try {
      const response = await fetch(`/api/weather?location=${city}`, { cache: "no-store" });
      const result = await response.json() as Weather & { error?: string };
      if (!response.ok) throw new Error(result.error || "Weather unavailable.");
      if (id === weatherId.current) { setWeather(result); setWeatherError(result.error || ""); }
    } catch (caught) { if (id === weatherId.current) { setWeather(null); setWeatherError(caught instanceof Error ? caught.message : "Weather unavailable."); } }
    finally { if (id === weatherId.current) setWeatherLoading(false); }
  }, []);
  useEffect(() => { let city: WeatherLocation = "berkeley"; try { const saved = localStorage.getItem("life-os-weather"); if (saved && Object.hasOwn(weatherLocations, saved)) city = saved as WeatherLocation; } catch {} setLocation(city); load(true); }, [load]);
  useEffect(() => { setWeather(null); loadWeather(location); }, [location, loadWeather]);
  useEffect(() => {
    const timer = setInterval(() => { const day = dayKey(); setMailNow(Date.now()); setToday(previous => { if (previous !== day) { setSelectedDay(day); setWeek(monday(day)); } return day; }); if (document.visibilityState === "visible") load(); }, 60000);
    const weatherTimer = setInterval(() => { if (document.visibilityState === "visible") loadWeather(location); }, 15 * 60000);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) setView("Today"); if ((event.metaKey || event.ctrlKey) && event.key === "k") { event.preventDefault(); setQuery(""); setModal("search"); } };
    window.addEventListener("keydown", key); return () => { clearInterval(timer); clearInterval(weatherTimer); window.removeEventListener("keydown", key); };
  }, [load, loadWeather, location]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (view === "Inbox" && selectedMail) board.current?.querySelector<HTMLButtonElement>(".l-inline-mail-detail > button")?.focus({ preventScroll: true }); }, [view, selectedMail]);
  const openChat = (text = "", mode: ChatRequest["mode"] = "workspace") => { if (text) setChatRequest({ id: crypto.randomUUID(), text, mode }); else setChatRequest(undefined); setDashboardChat(true); if(view !== "Today" && view !== "Assistant") setView("Today"); };
  const refresh = () => { summaryCheckpoint.beginVisit();load(); loadWeather(location); };
  async function write(body: unknown) {
    setSaving(true);
    try { const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "Couldn’t save."); await load(); return true; }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : "Couldn’t save. Try again."); return false; }
    finally { setSaving(false); }
  }
  async function updateMail(mail: Mail, action: "hide" | "restore" | "read" | "unread" | "trash") {
    if (mailBusy) return;
    const account = mailAccount(mail, data.sources.gmail);
    if (!account) return;
    setMailBusy(`${account}:${mail.id}`); setMailError(""); setMailReconnect(false);
    try {
      const response = await fetch(action === "trash" ? "/api/google" : "/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "trash" ? {action:"trash",resource:"gmail",account,id:mail.id} : {action:"mailPreference",account,id:mail.id,...(action === "hide" || action === "restore" ? {hidden:action === "hide"} : {read:action === "read"})}) });
      const result = await response.json() as {ok?:boolean;error?:string;requiresReconnect?:boolean};
      if (!response.ok || !result.ok) { setMailReconnect(!!result.requiresReconnect); throw new Error(result.error || "Couldn’t update this message."); }
      setData(current => ({...current,emails:action === "trash" ? current.emails.filter(item => item.id !== mail.id || mailAccount(item,current.sources.gmail) !== account) : current.emails.map(item => item.id === mail.id && mailAccount(item,current.sources.gmail) === account ? {...item,...(action === "hide" || action === "restore" ? {hidden:action === "hide"} : {locallyRead:action === "read"})} : item)}));
      setSelectedMail(null); setTrashMail(null);
      if (action === "trash") setNotice("Moved to Gmail Trash.");
    } catch(caught) { setMailError(caught instanceof Error ? caught.message : "Couldn’t update this message. Try again."); }
    finally { setMailBusy(""); }
  }
  const mailActions = (mail: Mail) => <div className="l-mail-actions" data-no-focus>
    <button className="l-icon-button" disabled={!!mailBusy} aria-label={`${isMailRead(mail) ? "Mark unread" : "Move to Read"}: ${mail.subject}`} title={isMailRead(mail) ? "Mark unread in V.E.C.T.O.R." : "Move to Read in V.E.C.T.O.R."} onClick={() => void updateMail(mail,isMailRead(mail) ? "unread" : "read")}><MailCheck size={14}/></button>
    <button className="l-icon-button" disabled={!!mailBusy} aria-label={`${mail.hidden ? "Unhide" : "Hide"}: ${mail.subject}`} title={mail.hidden ? "Restore in V.E.C.T.O.R." : "Hide in V.E.C.T.O.R. only"} onClick={() => void updateMail(mail,mail.hidden ? "restore" : "hide")}><EyeOff size={14}/></button>
    <button className="l-icon-button" disabled={!!mailBusy} aria-label={`Delete in Gmail: ${mail.subject}`} title="Move this message to Gmail Trash" onClick={() => { setMailError(""); setMailReconnect(false); setTrashMail(mail); }}><Trash2 size={14}/></button>
  </div>;
  async function canvasAction(action: "connect" | "refresh" | "disconnect") {
    if (canvasBusy) return; setCanvasBusy(true); setCanvasError(""); setCanvasSignInPath("");
    try {
      const response = await fetch("/api/canvas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "connect" ? { feedUrl: feed } : {}) }) });
      const result = await response.json() as Coursework & { error?: string; signInPath?: string };
      if (!response.ok) { if (result.signInPath) setCanvasSignInPath(result.signInPath); throw new Error(result.error || "Couldn’t update bCourses."); }
      setFeed(""); setConfirmDisconnect(false); await load();
      if (result.status === "error") setCanvasError(result.message || "The feed couldn’t refresh.");
      else { setNotice(action === "connect" ? "bCourses connected. Your dated course items are ready." : action === "disconnect" ? "bCourses disconnected." : "bCourses feed refreshed."); if (action === "connect") setModal(""); }
    } catch (caught) { setCanvasError(caught instanceof Error ? caught.message : "Couldn’t connect bCourses."); }
    finally { setCanvasBusy(false); }
  }
  async function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (await write({ action: "task", value: { id: crypto.randomUUID(), title: String(form.get("title")), due: String(form.get("due")), category: String(form.get("category")), priority: "normal", minutes: 30, done: false } })) { setModal("tasks"); setNotice("Task added."); }
  }
  function exportData() { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `vector-${today}.json`; a.click(); URL.revokeObjectURL(url); }

  const mainAttention = activeMailbox === "victorhui94@gmail.com" && mailFilter === "attention";
  const attentionEnabled=mailFilter==="attention"&&attentionAccount(activeMailbox);
  const eligibleMail=inboxViewMail(inboxMail,activeMailbox,mailFilter,classifier.ready ? classifier.classify : undefined);
  const attention=useMailAttention(attentionEnabled?eligibleMail:[],activeMailbox,product==="overview"&&attentionEnabled&&classifier.ready&&!classifier.runningAccount);
  const emails=attentionEnabled?eligibleMail.filter(mail=>attention.decision(mail)!=="information"):eligibleMail;
  const coursework = data.coursework;
  const courseItems = (coursework?.items || []).filter(item => courseFilter === "all" || courseDay(item) >= today).sort((a, b) => a.due.localeCompare(b.due));
  const openTasks = data.tasks.filter(task => !task.done);
  const sources = Object.values(data.sources).map(source => source.updatedAt).filter((value): value is string => !!value).sort();
  const latest = sources.at(-1);
  const searchResults = useMemo(() => { const term = query.trim().toLowerCase(); if (!term) return []; return [
    ...calendarEvents.map(event => ({ title: event.title, detail: `Calendar · ${dateLabel(dayKey(new Date(event.start)))}`, run: () => { setView("Calendar"); setSelectedDay(dayKey(new Date(event.start))); setWeek(monday(dayKey(new Date(event.start)))); } })),
    ...data.emails.map(mail => ({ title: mail.subject, detail: `${mailboxes.find(box => box.account === mailAccount(mail, data.sources.gmail))?.label || "Inbox"} · ${mail.sender}`, run: () => { const account = mailAccount(mail, data.sources.gmail); if (account) setActiveMailbox(account); setMailFilter("all"); setView("Inbox"); setSelectedMail(mail); } })),
    ...(data.coursework?.items || []).map(item => ({ title: item.title, detail: `${item.course || "bCourses"} · ${dateLabel(courseDay(item))}`, run: () => { setView("Coursework"); setCourseFilter("all"); } })),
    ...(data.note.trim() ? [{ title: "Tasks", detail: data.note, run: () => setView("Notepad") }] : []),
    ...data.tasks.map(task => ({ title: task.title, detail: `Task · ${task.category}`, run: () => setModal("tasks") })),
  ].filter(item => `${item.title} ${item.detail}`.toLowerCase().includes(term)).slice(0, 12); }, [query, data, calendarEvents]);
  const minimizeButton = (name: Exclude<View, "Today">) => view === name && <button className="l-icon-button" aria-label={`Minimize ${name}`} title="Show all widgets" onClick={() => setView("Today")}><Minimize2 size={16}/></button>;
  const calendar = <CalendarWorkspace events={allCalendarEvents} visibility={calendarVisibility} tasks={data.tasks} source={data.sources.calendar} loading={loading} expanded={view === "Calendar"} onExpand={() => setView(view === "Calendar" ? "Today" : "Calendar")} week={week} setWeek={setWeek} selectedDay={selectedDay} setSelectedDay={setSelectedDay} today={today} onRefresh={() => load()} onTaskWrite={write} saving={saving}/>;
  const inbox = <section className={`l-panel l-inbox-panel ${view === "Inbox" ? "l-panel-full" : ""}`} aria-labelledby="inbox-heading">
    <header className="l-panel-header"><div className="l-section-title"><Inbox size={17}/><h2 id="inbox-heading"><button data-focus-trigger aria-expanded={view === "Inbox"} onClick={() => setView(view === "Inbox" ? "Today" : "Inbox")}>Inbox{view !== "Inbox" && <Maximize2 size={12}/>}</button></h2><span className="l-count">{activeMailSource.updatedAt ? inboxMail.length : "—"}</span></div><div className="l-header-actions"><a className="l-icon-button" href={gmailUrl} target="_blank" rel="noreferrer" aria-label="Open Gmail"><ArrowUpRight size={16}/></a>{minimizeButton("Inbox")}</div></header>
    <div className="l-inbox-accounts" role="tablist" aria-label="Email accounts">{mailboxes.map((box, index) => <button type="button" role="tab" id={`inbox-tab-${box.id}`} aria-controls="inbox-messages" aria-selected={activeMailbox === box.account} tabIndex={activeMailbox === box.account ? 0 : -1} className={`l-inbox-account l-inbox-${box.id}`} key={box.id} onClick={() => { setActiveMailbox(box.account); setSelectedMail(null); setMailFilter(mailRange === "older" ? "all" : "attention"); }} onKeyDown={event => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % mailboxes.length;
      else if (event.key === "ArrowLeft") next = (index + mailboxes.length - 1) % mailboxes.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = mailboxes.length - 1;
      else return;
      event.preventDefault(); setActiveMailbox(mailboxes[next].account); setSelectedMail(null); setMailFilter(mailRange === "older" ? "all" : "attention"); document.getElementById(`inbox-tab-${mailboxes[next].id}`)?.focus();
    }}><i/>{box.label}<small>{mailboxSource(data.sources, box.account).updatedAt ? accountMail(box.account).length : "—"}</small></button>)}</div>
    <div className="l-inbox-account-label" title={activeMailbox}>{activeMailbox}<span>{activeMailSource.status === "error" ? "Refresh needed" : activeMailSource.updatedAt ? `${inboxMail.length} saved · ${mailRange === "week" ? "past 7 days" : "archive"}` : "Not imported yet"}</span></div>
    <div className="l-mail-range-controls" data-no-focus><div role="group" aria-label="Email date range">{([["week","Past week"],["older","Archive"]] as const).map(([id,label])=><button key={id} aria-pressed={mailRange===id} onClick={()=>{setMailRange(id);setMailFilter(id==="older"?"all":"attention");}}>{label}</button>)}</div><button className="l-text-button" disabled={!!mailImport.busy} onClick={()=>void mailImport.page(activeMailbox,mailRange,true)} aria-label={`Refresh ${activeBox.label} ${mailRange === "week" ? "past week" : "archive"}`}><RefreshCw size={12}/>Refresh</button></div>
    {mailImport.errors[activeMailbox]&&<p className="l-inline-warning" role="alert">{mailImport.errors[activeMailbox]}<button className="l-text-button" onClick={()=>void mailImport.page(activeMailbox,mailRange)}>Retry</button></p>}
    <div className="l-tabs l-mail-tabs" aria-label="Inbox views">{[["attention","Needs attention"],["groups",activeMailbox === calHacksAccount ? "Sponsorship" : "Groups"],["all","All saved"],["read","Read"],["hidden","Hidden"]].map(([id,label]) => <button key={id} aria-pressed={mailFilter === id} onClick={() => {setMailFilter(id);setSelectedMail(null);}}>{label}</button>)}</div>
    {mailError && <div className="l-inline-warning" role="alert">{mailError}{mailReconnect && <button className="l-text-button" onClick={() => {setTrashMail(null);setModal("connections");}}>Open Connections</button>}</div>}
    {activeMailSource.status === "error" && <div className="l-inline-warning">Couldn’t refresh {activeBox.label}. {inboxMail.length ? "Showing its last saved summaries." : "Try Refresh or reconnect this inbox in Connections."}</div>}
    {attentionEnabled&&<div className="l-attention-status" data-no-focus><span role="status">{attention.error||(!attention.loaded?"Loading attention checks…":attention.running?attention.status:attention.paused?"Attention checks paused":attention.pending?`${attention.pending} emails awaiting checks`:"Attention checked · DeBERTa")}</span>{attention.running?<button className="l-text-button" onClick={attention.pause}>Pause</button>:(attention.error||attention.paused)&&<button className="l-text-button" onClick={attention.retry}>Continue checks</button>}<details><summary>How it works</summary><p>Pretrained DeBERTa checks the sender, subject and saved preview for requested actions. No training needed. Informational results are filtered out; unchecked and uncertain emails stay visible. Main includes School and Jobs only. Checks run while this view is open; results are saved.</p></details></div>}
    <div className="l-mail-list" role="tabpanel" id="inbox-messages" aria-labelledby={`inbox-tab-${activeBox.id}`}>{view === "Inbox" && selectedMail && mailAccount(selectedMail, data.sources.gmail) === activeMailbox ? <div className="l-inline-mail-detail"><button className="l-text-button" onClick={() => setSelectedMail(null)}><ChevronLeft size={13}/>Back to inbox</button><div className="l-mail-detail"><span className="l-mail-detail-sender">{selectedMail.sender}<small>{format(selectedMail.receivedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span>{!!selectedMail.gmailLabels?.length && <div className="l-gmail-labels" aria-label="Gmail labels">{selectedMail.gmailLabels.map(label=><span key={label}>{label}</span>)}</div>}<MailReader key={`${activeMailbox}:${selectedMail.id}`} mail={selectedMail} onConnections={() => setModal("connections")}/><div className="l-form-actions"><a className="l-button l-primary" href={safeUrl(selectedMail.url)} target="_blank" rel="noreferrer">Open in Gmail<ArrowUpRight size={13}/></a>{mailActions(selectedMail)}</div><p className="l-form-description">Read and Hide organize V.E.C.T.O.R. only. Delete moves this message to Gmail Trash.</p></div></div> : mailFilter === "groups" && activeMailbox !== calHacksAccount ? <MailGroups key={activeMailbox} account={activeMailbox} emails={inboxMail} classifier={classifier} expanded={view === "Inbox"} onLab={() => setProduct("mail-lab")} onOpen={mail => {setSelectedMail(mail);setView("Inbox");}}/> : mainAttention && !classifier.ready && classifier.error ? <div className="l-empty"><Inbox size={25}/><h3>Email groups unavailable.</h3><p>Reload groups or open All saved to see your emails.</p><button className="l-text-button" onClick={()=>void classifier.load()}>Reload groups</button><button className="l-text-button" onClick={()=>setMailFilter("all")}>All saved</button></div> : loading || (mainAttention && !classifier.ready) ? <LoadingRows/> : emails.length ? emails.slice(0, view === "Inbox" ? mailVisible : 1).map(mail => <div className="l-mail-item" key={`${activeMailbox}:${mail.id}`}><button className="l-mail-row" onClick={() => {setSelectedMail(mail);setView("Inbox");}}><span className="l-avatar">{mail.sender[0]}</span><span className="l-mail-copy"><span className="l-mail-sender">{mail.sender}<small>{dayKey(new Date(mail.receivedAt)) === today ? time(mail.receivedAt) : dateLabel(dayKey(new Date(mail.receivedAt)))}</small></span><strong>{mail.subject}</strong><span className="l-mail-summary">{mail.summary}</span>{attentionEnabled&&<small className="l-attention-badge">{attention.decision(mail)==="attention"?"Action suggested":attention.decision(mail)==="uncertain"?"Review suggested":"Not checked yet"}</small>}</span></button>{mailActions(mail)}</div>) : <div className="l-empty"><Inbox size={25} strokeWidth={1.3}/><h3>{inboxMail.length || activeMailSource.status === "synced" ? mailFilter === "attention" ? "You’re all caught up." : mailFilter === "read" ? "No read messages yet." : mailFilter === "hidden" ? "No hidden messages." : mailFilter === "groups" && activeMailbox === calHacksAccount ? "No sponsorship threads in this date range." : "No saved messages." : `${activeBox.label} hasn’t synced yet.`}</h3><p>{inboxMail.length || activeMailSource.status === "synced" ? mailFilter === "attention" ? activeMailbox === calHacksAccount ? "Unread threads you’ve participated in are checked for action requests. Informational threads remain in All saved and Sponsorship." : mainAttention ? "No School or Jobs messages currently need attention. Informational messages remain in Groups and All saved." : attentionEnabled ? "Informational messages remain in All saved. Uncertain results stay visible for review." : "Unread messages appear here until you move them to Read or hide them." : "Read and Hidden organize your saved messages in V.E.C.T.O.R.." : "Connect this Google account in Connections to import its inbox."}</p>{activeMailSource.status !== "synced" && !inboxMail.length && <button className="l-text-button" onClick={() => setModal("connections")}>Manage connections<ArrowRight size={13}/></button>}</div>}</div>
    {!selectedMail&&view==="Inbox"&&(mailFilter!=="groups"||activeMailbox===calHacksAccount)&&emails.length>mailVisible&&<button className="l-mail-load-more" onClick={()=>setMailVisible(count=>count+50)}>Show more · {mailVisible} of {emails.length}</button>}
    {mailRange==="older"&&!selectedMail&&<div className="l-mail-history-footer"><span>Older than 7 days · Gmail unchanged</span><button className="l-small-button" disabled={!!mailImport.busy||!!activeMailSource.mailHistory?.complete&&(activeMailbox!==calHacksAccount||activeMailSource.mailHistory.metadataVersion===1)} onClick={()=>void mailImport.page(activeMailbox,"older")}>{activeMailSource.mailHistory?.complete&&(activeMailbox!==calHacksAccount||activeMailSource.mailHistory.metadataVersion===1)?"All older mail loaded":mailImport.busy===activeMailbox?"Loading…":"Load older mail"}</button></div>}
    <footer className="l-panel-footer"><span>{activeBox.label} · {relative(activeMailSource.updatedAt)}</span><button className="l-text-button" onClick={() => view === "Inbox" ? openChat(`Summarize my emails in ${activeMailbox} only.`) : setView("Inbox")}>{view === "Inbox" ? "Ask assistant" : "View inbox"}<ArrowRight size={12}/></button></footer>
  </section>;
  const courses = <section className={`l-panel l-course-panel ${view === "Coursework" ? "l-panel-full" : ""}`} aria-labelledby="coursework-heading">
    <header className="l-panel-header"><div className="l-section-title"><BookOpen size={17}/><h2 id="coursework-heading"><button data-focus-trigger aria-expanded={view === "Coursework"} onClick={() => setView(view === "Coursework" ? "Today" : "Coursework")}>Coursework{view !== "Coursework" && <Maximize2 size={12}/>}</button></h2><span className="l-provider-label">bCourses</span></div><div className="l-header-actions">{coursework?.connected && <button disabled={canvasBusy} className="l-icon-button" aria-label="Refresh bCourses feed" onClick={() => canvasAction("refresh")}><RefreshCw size={14} className={canvasBusy ? "l-spin" : ""}/></button>}<a className="l-icon-button" href={canvasUrl} target="_blank" rel="noreferrer" aria-label="Open bCourses"><ArrowUpRight size={16}/></a>{minimizeButton("Coursework")}</div></header>
    {coursework?.connected ? <><div className="l-tabs"><button aria-pressed={courseFilter === "upcoming"} onClick={() => setCourseFilter("upcoming")}>Upcoming</button><button aria-pressed={courseFilter === "all"} onClick={() => setCourseFilter("all")}>All saved</button></div>{coursework.status === "error" && <div className="l-inline-warning">{coursework.message}</div>}<div className="l-course-list">{courseItems.length ? courseItems.slice(0, view === "Coursework" ? 100 : 2).map(item => <div className="l-course-row" key={item.id}><span className="l-course-icon"><FileText size={16}/></span><div><a href={safeUrl(item.url || canvasUrl)} target="_blank" rel="noreferrer">{item.title}<ArrowUpRight size={12}/></a><p>{item.course || "bCourses"}{item.kind === "event" && " · Course event"}</p></div><span className={`l-due ${courseDay(item) === today ? "l-due-today" : ""}`}>{dueLabel(item, today)}<small>{item.allDay ? "All day" : time(item.due)}</small></span></div>) : <div className="l-empty"><Check size={25} strokeWidth={1.5}/><h3>No upcoming dated items.</h3><p>Check bCourses for undated assignments and submission status.</p></div>}</div><footer className="l-panel-footer"><span>Calendar feed · {relative(coursework.updatedAt)}</span><button className="l-text-button" onClick={() => view === "Coursework" ? openChat("What assignments are due next?") : setView("Coursework")}>{view === "Coursework" ? "Ask assistant" : "View all"}<ArrowRight size={12}/></button></footer></> : <div className="l-connect-course"><span className="l-connect-course-icon"><BookOpen size={23} strokeWidth={1.4}/></span><h3>Connect your course calendar</h3><p>See dated assignments and course events<br className="l-desktop-break"/> from your bCourses calendar.</p><button className="l-button l-primary" onClick={() => { setCanvasError(""); setCanvasSignInPath(""); setModal("canvas"); }}><Link2 size={14}/>Connect bCourses</button><span className="l-connection-footnote">Uses your private Calendar Feed link.</span></div>}
  </section>;
  const upcomingHours = (weather?.hours || []).filter(hour => new Date(hour.at).getTime() + 3600000 > Date.now());
  const hourlyWeather = (compact = false) => <div className={`l-weather-hourly ${compact ? "l-weather-hourly-compact" : ""}`} aria-label="Hourly forecast" tabIndex={0}>{upcomingHours.slice(0, compact ? 8 : 24).map(hour => <div key={hour.at}><small>{time(hour.at).replace(":00", "")}</small><WeatherIcon code={hour.code} isDay={hour.isDay ?? true} size={compact ? 17 : 23}/><strong>{hour.temperature === null ? "—" : `${Math.round(hour.temperature)}°`}</strong><span className="l-sr-only">{weatherLabel(hour.code)}</span></div>)}</div>;
  const weatherDetails = <div className="l-weather-modal"><label className="l-field">Location<select value={location} onChange={event => { const value = event.target.value as WeatherLocation; setLocation(value); try { localStorage.setItem("life-os-weather", value); } catch {} }}>{Object.entries(weatherLocations).map(([key, city]) => <option key={key} value={key}>{city.name}</option>)}</select></label>{weatherError && <p className="l-inline-warning">{weatherError}</p>}{weather ? <><div className="l-weather-current"><WeatherIcon code={weather.code} isDay={weather.isDay} size={46}/><strong>{Math.round(weather.temperature)}°<small>F</small></strong><div>{weather.condition || weatherLabel(weather.code)}<p>{weather.feelsLike === null ? weather.reading === "forecast" ? "Current-hour forecast" : "Nearby station observation" : `Feels like ${Math.round(weather.feelsLike)}°`}</p></div></div><h3 className="l-hourly-heading">By the hour · next 24 hours</h3>{upcomingHours.length ? hourlyWeather() : <p className="l-form-description">Hourly forecast unavailable. Refresh weather to try again.</p>}<div className="l-weather-days">{weather.days.map(day => <div key={day.date}><span>{day.date === today ? "Today" : format(`${day.date}T12:00:00Z`, { weekday: "short" })}</span><WeatherIcon code={day.code} size={19}/><small>{day.rain === null ? "—" : `${day.rain}% rain`}</small><strong>{day.high === null ? "—" : `${Math.round(day.high)}°`}<span>{day.low === null ? "—" : `${Math.round(day.low)}°`}</span></strong></div>)}</div><p className="l-form-description">Updated {relative(weather.observedAt)} · Data from <a href={safeUrl(weather.sourceUrl || "https://open-meteo.com/")} target="_blank" rel="noreferrer">{weather.source || "Open-Meteo"}</a>.{weather.observationLabel && <><br/>{weather.observationLabel}</>}</p></> : <div className="l-empty">{weatherLoading ? <Loader2 className="l-spin" size={26}/> : <Cloud size={26}/>}<p>{weatherLoading ? "Loading forecast…" : "Couldn’t load the current forecast."}</p></div>}<button className="l-button l-secondary" disabled={weatherLoading} onClick={() => loadWeather(location)}><RefreshCw size={13}/>Refresh weather</button></div>;
  const weatherPanel = <section className="l-panel l-weather-panel" aria-labelledby="weather-heading">
    <header className="l-panel-header"><div className="l-section-title"><CloudSun size={17}/><h2 id="weather-heading"><button data-focus-trigger aria-expanded={view === "Weather"} onClick={() => setView(view === "Weather" ? "Today" : "Weather")}>Weather{view !== "Weather" && <Maximize2 size={12}/>}</button></h2></div><div className="l-header-actions"><span className="l-weather-place">{weatherLocations[location].name}</span>{minimizeButton("Weather")}</div></header>
    <div className="l-weather-glance" hidden={view === "Weather"}><div className="l-weather-glance-main"><span>{weather ? <WeatherIcon code={weather.code} isDay={weather.isDay} size={42}/> : weatherLoading ? <Loader2 size={26} className="l-spin"/> : <Cloud size={36}/>}</span><strong>{weather ? `${Math.round(weather.temperature)}°` : "—"}</strong><div><p>{weather ? weather.condition || weatherLabel(weather.code) : weatherLoading ? "Loading weather…" : "Weather unavailable"}</p><small>{weather?.reading === "forecast" ? "Current-hour forecast" : "Current conditions"}{weather?.stale ? " · Saved reading" : ""}</small></div></div><div className="l-weather-mode" aria-label="Weather forecast views"><button aria-pressed={weatherMode === "hours"} onClick={() => setWeatherMode("hours")}>Hourly</button><button aria-pressed={weatherMode === "days"} onClick={() => setWeatherMode("days")}>3 days</button></div>{weatherMode === "hours" ? upcomingHours.length ? hourlyWeather(true) : <p className="l-form-description">Hourly forecast unavailable.</p> : <div className="l-weather-three">{weather?.days.map(day => <div key={day.date}><span>{day.date === today ? "Today" : format(`${day.date}T12:00:00Z`, { weekday: "short" })}</span><WeatherIcon code={day.code} size={17}/><strong>{day.high === null ? "—" : `${Math.round(day.high)}°`}<small>{day.low === null ? "—" : `${Math.round(day.low)}°`}</small></strong></div>)}</div>}{weatherError && <p className="l-weather-glance-error">{weatherError}</p>}</div>
    <div className="l-weather-expanded" hidden={view !== "Weather"}>{weatherDetails}</div>
    <footer className="l-panel-footer"><span>{weather?.stale ? "Saved weather" : "Weather"} · {relative(weather?.observedAt)}</span><button className="l-text-button" onClick={() => setView(view === "Weather" ? "Today" : "Weather")}>{view === "Weather" ? "Show all widgets" : "Forecast"}<ArrowRight size={12}/></button></footer>
  </section>;
  const assistant = <section className={`l-panel l-assistant-panel l-personal-core ${view === "Assistant" ? "l-core-focused" : ""}`} aria-labelledby="assistant-heading">
    <div className="l-core-overview" hidden={view === "Assistant" || dashboardChat}>
      <div className="l-core-eyebrow"><span className={coreBusy ? "l-core-busy-dot" : ""}/>{coreBusy ? "Working on your request" : "SYSTEM READY"}</div>
      <button className="l-core-launch" data-focus-trigger aria-label="Expand V.E.C.T.O.R. chat" aria-expanded={view === "Assistant"} onClick={() => setView("Assistant")}><AssistantVisual animate={motionEnabled} busy={coreBusy}/></button>
      <h2 id="assistant-heading"><Wordmark/></h2><p>Ready for your next command.</p>
      <SavedCommands commands={data.commands || []} ready={!!data.loadedAt} currentPrompt={chatInput} busy={coreBusy} onRun={prompt => openChat(prompt)} onChanged={(command: SavedCommand, deleted) => setData(current => ({ ...current, commands: deleted ? (current.commands || []).filter(item => item.id !== command.id) : (current.commands || []).some(item => item.id === command.id) ? (current.commands || []).map(item => item.id === command.id ? command : item) : [...(current.commands || []), command] }))}/>
      <form className="l-assistant-input" data-no-focus onSubmit={event => { event.preventDefault(); if (chatInput.trim()) { openChat(chatInput.trim()); setChatInput(""); } }}><textarea aria-label="Ask V.E.C.T.O.R." placeholder="Ask V.E.C.T.O.R.…" rows={2} maxLength={3000} value={chatInput} onChange={event => setChatInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><button type="submit" disabled={!chatInput.trim() || coreBusy} aria-label="Send to assistant"><ArrowUp size={17}/></button></form>
      <span className="l-core-scope">Your schedule. Your inboxes. Your next move.</span>
    </div>
    <div className={`l-core-inline-host ${view === "Today" ? "l-core-dashboard-host" : ""}`} data-no-focus hidden={view !== "Assistant" && !dashboardChat}><CoreChat inline compact={view !== "Assistant"} onExpand={() => setView("Assistant")} open={view === "Assistant" || view === "Today" && dashboardChat} onClose={() => {if(view === "Assistant"){setDashboardChat(true);setView("Today");}else setDashboardChat(false);}} onChanged={() => load()} onBusy={setCoreBusy} initialRequest={chatRequest} avatar={<AssistantVisual animate={motionEnabled} busy={coreBusy}/>}/></div>
    <footer className="l-panel-footer"><button className="l-text-button" onClick={() => setModal("tasks")}>{openTasks.length} open {openTasks.length === 1 ? "task" : "tasks"}<ArrowRight size={12}/></button><button className="l-text-button" data-no-focus onClick={() => {if(view === "Assistant"){setDashboardChat(true);setView("Today");}else if(dashboardChat)setView("Assistant");else openChat();}}>{view === "Assistant" ? "All widgets" : dashboardChat ? "Expand chat" : "Open chat"}{view === "Assistant" ? <Minimize2 size={12}/> : <ArrowUpRight size={12}/>}</button></footer>
  </section>;
  const calendarCount = calendarEvents.filter(event => eventOnDay(event, today)).length;
  const nextCourse = (coursework?.items || []).find(item => courseDay(item) >= today);
  const summaries = {
    Notepad: { icon: <Check size={18}/>, metric: `${openTasks.length} open tasks`, detail: openTasks[0]?.title || "Add your next task" },
    Calendar: { icon: <CalendarDays size={18}/>, metric: loading ? "Loading…" : `${calendarCount} ${calendarCount === 1 ? "event" : "events"} today`, detail: calendarAccount },
    Inbox: { icon: <Inbox size={18}/>, metric: loading ? "Loading…" : activeMailSource.updatedAt ? `${inboxMail.length} ${activeBox.label} summaries` : `${activeBox.label} · awaiting sync`, detail: inboxMail[0]?.subject || activeMailbox },
    Coursework: { icon: <BookOpen size={18}/>, metric: coursework?.connected ? `${courseItems.length} ${courseItems.length === 1 ? "dated item" : "dated items"}` : "Connect bCourses", detail: nextCourse?.title || "Your assignments and due dates" },
    Weather: { icon: weather ? <WeatherIcon code={weather.code} isDay={weather.isDay} size={23}/> : <CloudSun size={20}/>, metric: weather ? `${Math.round(weather.temperature)}° · ${weatherLocations[location].name}` : weatherLoading ? "Loading weather…" : "Weather unavailable", detail: weather ? weather.condition || weatherLabel(weather.code) : "Forecast and conditions" },
    Assistant: { icon: <AssistantVisual animate={motionEnabled} busy={coreBusy}/>, metric: "V.E.C.T.O.R.", detail: coreBusy ? "Reading saved data…" : "Ask about your day" },
  };
  const notepad = <Notepad tasksSource={data.sources.tasks} onConnections={()=>setModal("connections")} shoppingItems={data.shoppingItems || []} tasks={data.tasks} note={data.note} ready={!!data.loadedAt} expanded={view === "Notepad"} onExpand={() => setView(view === "Notepad" ? "Today" : "Notepad")} onChanged={() => load()}/>;
  const modules = { Notepad: notepad, Calendar: calendar, Assistant: assistant, Inbox: inbox, Weather: weatherPanel, Coursework: courses };

  return <div className="l-app l-focus-app" data-product={product} data-view={view.toLowerCase()} data-workspace={product === "overview" && view !== "Today" ? "focused" : "overview"} data-motion={motionEnabled ? "on" : "off"}>
    <header className="l-dashboard-top"><button className="l-dashboard-brand" onClick={() => { setProduct("overview"); setView("Today"); }} aria-label="Show all dashboard widgets"><span aria-hidden="true">v.</span><Wordmark/></button><div className="l-dashboard-top-actions"><span className="l-dashboard-private">Victor’s dashboard</span><ThemeToggle/><button className="l-icon-button" aria-label="Search dashboard" onClick={() => { setQuery(""); setModal("search"); }}><Search size={16}/></button><button className="l-icon-button" aria-label="Reload saved dashboard and weather" disabled={refreshing} onClick={refresh}><RefreshCw size={15} className={refreshing ? "l-spin" : ""}/></button><button className="l-icon-button" aria-label="Manage connections" onClick={() => { setCanvasError(""); setCanvasSignInPath(""); setModal("connections"); }}><Settings2 size={17}/></button><span className="l-dashboard-avatar">V</span></div></header>
    <main className="l-dashboard-main" id="main-content"><nav className="l-product-nav" aria-label="V.E.C.T.O.R. products"><button aria-current={product === "overview" ? "page" : undefined} onClick={() => setProduct("overview")}><LayoutGrid size={14}/>Overview</button><button aria-current={product === "summaries" ? "page" : undefined} onClick={() => setProduct("summaries")}><FileText size={14}/>Summaries</button><button aria-current={product === "jobs" ? "page" : undefined} onClick={() => setProduct("jobs")}><BriefcaseBusiness size={14}/>Jobs</button><button aria-current={product === "mail-lab" ? "page" : undefined} onClick={() => setProduct("mail-lab")}><Inbox size={14}/>Mail Lab</button></nav><div className="l-dashboard-heading"><DashboardDate fallbackDay={today}/><div className="l-heading-actions">{product === "overview" && <button className="l-brief-trigger" title={data.briefing?.title || "Read your morning brief"} onClick={() => setModal("briefing")}><Sunrise size={14}/><span>Morning brief</span><ArrowUpRight size={12}/></button>}{product === "overview" && view !== "Today" && <button className="l-all-widgets l-all-widgets-active" onClick={() => setView("Today")}><LayoutGrid size={14}/>Back to dashboard<kbd>esc</kbd></button>}</div></div>
      {error && <div className="l-error-banner" role="alert">{error}<button onClick={() => load()}>Try again</button></div>}
      {notice && <div className="l-toast" role="status"><Check size={15}/>{notice}<button className="l-icon-button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={13}/></button></div>}
      <div className="l-overview-workspace" hidden={product !== "overview"}>
      <div ref={board} className="l-focus-board" data-focus={view.toLowerCase()}>{(Object.keys(modules) as Exclude<View, "Today">[]).map(name => <DashboardWidget name={name} view={view} summary={summaries[name]} onFocus={setView} key={name}>{modules[name]}</DashboardWidget>)}</div>
      <span className="l-sr-only" role="status">{view === "Today" ? "All dashboard widgets are visible." : `${view === "Notepad" ? "Tasks" : view} expanded. Other widgets are compact. Press Escape to restore all widgets.`}</span>
      <footer className="l-dashboard-footer"><span><Clock3 size={11}/>Pacific time<span>·</span>{data.schedule.enabled ? "Morning update at 7:00 AM" : "Morning update pending"}</span><span>{refreshing ? "Updating…" : latest ? `Saved sources · ${relative(latest)}` : "Your private dashboard"}<button onClick={() => setModal("connections")}>Connections</button></span></footer>
      </div><Summaries location={location} active={product === "summaries"} data={data} since={summaryCheckpoint.since} firstVisit={summaryCheckpoint.firstVisit} weather={weather} weatherError={weatherError} onRefresh={refresh} refreshing={refreshing} onMail={mail=>{const account=mailAccount(mail,data.sources.gmail);if(account)setActiveMailbox(account);setMailRange(mailInRange(mail,"week")?"week":"older");setSummaryMail(mail);setMailFilter("all");setProduct("overview");setView("Inbox");}} onCalendar={()=>{setProduct("overview");setView("Calendar");}} onCoursework={()=>{setProduct("overview");setView("Coursework");}} onJobs={()=>setProduct("jobs")}/><JobsWorkspace active={product === "jobs"}/><MailLab account={activeMailbox} onAccountChange={setActiveMailbox} range={mailRange} onRangeChange={setMailRange} active={product === "mail-lab"} emails={data.emails} classifier={classifier} onOpen={mail => {if(mail.account)setActiveMailbox(mail.account);setMailFilter("groups");setSelectedMail(mail);setProduct("overview");setView("Inbox");}}/>
    </main>
    {(modal === "canvas" || modal === "connections") && <Modal title={modal === "canvas" ? "Connect bCourses" : "Connections"} wide={modal === "connections"} onClose={() => { setModal(""); setFeed(""); setCanvasSignInPath(""); setConfirmDisconnect(false); }}>
      {modal === "connections" && <><GoogleConnections onRefresh={() => { void load(); }}/><div className="l-connection-row"><span className="l-service-icon l-canvas-service"><BookOpen size={20}/></span><div><strong>bCourses / Canvas</strong><p>{coursework?.connected ? `${coursework.items.length} dated course items in your feed` : "Your course calendar isn’t connected yet"}</p><small>{coursework?.updatedAt ? `Last successful sync · ${relative(coursework.updatedAt)}` : "Connect using your Calendar Feed link below"}</small></div>{coursework?.connected && <button className="l-small-button" disabled={canvasBusy} onClick={() => canvasAction("refresh")}>Refresh</button>}</div><div className="l-settings-divider"/></>}
      <div className="l-canvas-setup"><h3>{coursework?.connected ? "Update your bCourses feed" : "Import your course calendar"}</h3><p>Dated assignments and course events appear automatically. Grades and submission status stay in bCourses.</p><ol><li>Open <a href={`${canvasUrl}/calendar`} target="_blank" rel="noreferrer">bCourses Calendar<ArrowUpRight size={11}/></a>.</li><li>Click <strong>Calendar Feed</strong> at the bottom of its right sidebar.</li><li>Copy the full link and paste it below.</li></ol><form onSubmit={event => { event.preventDefault(); canvasAction("connect"); }}><label className="l-field">Calendar Feed link<input type="url" required autoComplete="off" spellCheck={false} placeholder="https://bcourses.berkeley.edu/feeds/calendars/…" maxLength={2000} value={feed} onChange={event => setFeed(event.target.value)}/></label>{canvasError && <p className="l-chat-error" role="alert">{canvasError}</p>}{canvasSignInPath && <div><a className="l-button l-secondary" href={canvasSignInPath} target="_top">Sign in to V.E.C.T.O.R.<ArrowUpRight size={13}/></a><p className="l-form-description">After signing in, reopen Connections and paste your Calendar Feed link again.</p></div>}<div className="l-form-actions"><button className="l-button l-primary" disabled={canvasBusy || !feed.trim()}>{canvasBusy ? <Loader2 className="l-spin" size={14}/> : <Link2 size={14}/>} {coursework?.connected ? "Update connection" : "Connect bCourses"}</button>{coursework?.connected && <button type="button" className="l-text-button l-danger" disabled={canvasBusy} onClick={() => setConfirmDisconnect(true)}>Disconnect</button>}</div></form><p className="l-form-description">Your feed link is private and saved on the server. It won’t appear in workspace exports. Refreshes every 30 minutes while open and with the morning update.</p>{confirmDisconnect && <div className="l-disconnect-confirm"><p>Remove this feed and its saved course items?</p><button className="l-button l-danger-button" disabled={canvasBusy} onClick={() => canvasAction("disconnect")}>Disconnect bCourses</button><button className="l-text-button" onClick={() => setConfirmDisconnect(false)}>Keep connection</button></div>}</div>
      {modal === "connections" && <><div className="l-settings-divider"/><div className="l-connection-row"><span className="l-service-icon"><Sun size={20}/></span><div><strong>Weather</strong><p>{weatherLocations[location].name} · {weather?.source || "Weather forecast"}</p></div><button className="l-small-button" onClick={() => { setModal(""); setView("Weather"); }}>Change location</button></div><div className="l-connection-row"><span className="l-service-icon"><MessageCircle size={19}/></span><div><strong>ChatGPT assistant</strong><p>V.E.C.T.O.R. tools and your authorized connected apps</p><small>Live app requests continue in a separate ChatGPT tab.</small></div><button className="l-small-button" onClick={() => { setModal(""); openChat(); }}>Open chat</button></div><details className="l-workspace-settings"><summary>Workspace data<ChevronDown size={14}/></summary><div><button className="l-button l-secondary" onClick={() => { setModal(""); setView("Notepad"); }}><StickyNote size={13}/>Open tasks</button><button className="l-button l-secondary" onClick={exportData}><ArrowDownToLine size={13}/>Export workspace</button></div></details><p className="l-form-description">Direct Google connections refresh every 5 minutes while V.E.C.T.O.R. is open. Saved ChatGPT imports remain available for accounts without a direct connection. Each inbox stays separate. Calendar uses only huiv@berkeley.edu.</p></>}
    </Modal>}
    {modal === "briefing" && <Modal title="Morning brief" onClose={() => setModal("")}><div className="l-briefing-full"><p className="l-form-description">{data.briefing ? `${dateLabel(data.briefing.day, true)} · Prepared ${time(data.briefing.generatedAt)}` : "Daily at 7:00 AM Pacific"}</p><h3>{data.briefing?.title || "Your day starts here."}</h3><p>{data.briefing?.summary || "Connect your sources to bring your schedule, email and course deadlines into your morning briefing."}</p>{!!data.briefing?.priorities.length && <><h4>Worth your attention</h4><ol>{data.briefing.priorities.map((priority, index) => <li key={index}>{priority}</li>)}</ol></>}{!!data.briefing?.headsUp.length && <><h4>Keep in mind</h4>{data.briefing.headsUp.map((item, index) => <p className="l-headsup" key={index}>{item}</p>)}</>}<button className="l-button l-secondary" onClick={() => { setModal(""); openChat("Help me plan my day using my saved briefing and course deadlines."); }}>Talk through my day<ArrowRight size={13}/></button></div></Modal>}
    {modal === "search" && <Modal title="Search your workspace" wide onClose={() => setModal("")}><div className="l-command-search"><Search size={17}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an email, event, assignment or task…" aria-label="Search saved workspace"/><kbd>ESC</kbd></div><div className="l-search-results">{searchResults.length ? searchResults.map((item, index) => <button key={index} onClick={() => { setModal(""); item.run(); }}><Search size={14}/><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={14}/></button>) : <p>{query ? "No saved matches. Try another word." : "Search your saved information in one place."}</p>}</div></Modal>}
    {trashMail && <Modal title="Delete from Gmail?" onClose={() => {if(!mailBusy)setTrashMail(null);}}><div className="l-mail-trash-confirm"><p className="l-trash-message">Move “{trashMail.subject}” to Gmail Trash?</p><p className="l-trash-account">{mailAccount(trashMail,data.sources.gmail)}<span>You can restore this message in Gmail.</span></p>{mailError && <p role="alert" className="l-form-error">{mailError}</p>}<div className="l-trash-actions"><button className="l-button l-secondary" disabled={!!mailBusy} onClick={() => setTrashMail(null)}>Cancel</button>{mailReconnect ? <button className="l-button l-primary" onClick={() => {setTrashMail(null);setModal("connections");}}>Reconnect inbox in Connections</button> : <button className="l-button l-primary" disabled={!!mailBusy} onClick={() => void updateMail(trashMail,"trash")}>{mailBusy ? "Moving…" : "Move to Gmail Trash"}</button>}</div></div></Modal>}

    {(modal === "tasks" || modal === "task") && <Modal title={modal === "task" ? "Add a personal task" : "Personal tasks"} onClose={() => setModal("")}>{modal === "task" ? <form className="l-task-form" onSubmit={addTask}><label className="l-field">Task<input name="title" required maxLength={240} autoFocus placeholder="What needs doing?"/></label><div className="l-two-fields"><label className="l-field">Due date<input name="due" type="date"/></label><label className="l-field">Category<select name="category"><option>Personal</option><option>School</option><option>Work</option></select></label></div><button className="l-button l-primary" disabled={saving}>{saving ? "Saving…" : "Add task"}</button></form> : <><div className="l-personal-tasks">{data.tasks.length ? data.tasks.map(task => <div key={task.id} className={`l-task-row ${task.done ? "l-task-done" : ""}`}><button disabled={saving} className="l-task-check" aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`} onClick={() => write({ action: "task", value: { ...task, done: !task.done } })}>{task.done ? <Check size={14}/> : <Circle size={16}/>}</button><span><strong>{task.title}</strong><small>{task.category}{task.due && ` · ${dateLabel(task.due)}`}</small></span><button disabled={saving} className="l-icon-button" aria-label={`Delete ${task.title}`} onClick={() => write({ action: "deleteTask", id: task.id })}><Trash2 size={13}/></button></div>) : <div className="l-empty"><Check size={25}/><h3>No personal tasks yet.</h3><p>Add one here or ask your assistant.</p></div>}</div><button className="l-button l-primary" onClick={() => setModal("task")}><Plus size={14}/>Add task</button><p className="l-form-description">These tasks are saved in V.E.C.T.O.R.. Course submissions and Google Calendar are managed in their own apps.</p></>}</Modal>}

  </div>;
}
function LoadingRows() { return <div className="l-loading" role="status"><Loader2 size={18} className="l-spin"/><span>Loading your saved information…</span></div>; }

function DashboardWidget({ name, view, summary, children, onFocus }: { name: Exclude<View, "Today">; view: View; summary: { icon: React.ReactNode; metric: string; detail: string }; children: React.ReactNode; onFocus: (name: View) => void }) {
  const compact = view !== "Today" && view !== name;
  return <div className={`l-dashboard-widget l-widget-${name.toLowerCase()} ${compact ? "l-widget-compact" : ""} ${view === name ? "l-widget-focused" : ""}`} data-widget={name} onDoubleClick={event => {
    if (view !== name || !(event.target instanceof Element)) return;
    const target = event.target;
    if (target.closest('button, a, input, textarea, select, label, summary, [role="button"], [role="link"], [role="textbox"], [contenteditable]:not([contenteditable="false"]), [data-no-focus], svg, img, video, audio, canvas')) return;
    // Text can share its element with empty padding. Only collapse outside its painted bounds.
    const range = document.createRange();
    for (const child of target.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
      range.selectNodeContents(child);
      if (Array.from(range.getClientRects()).some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom)) return;
    }
    onFocus("Today");
  }} onClickCapture={event => { if (view === "Today" && !(event.target as HTMLElement).closest("[data-no-focus]")) onFocus(name); }}>
    <button className="l-widget-summary" data-focus-trigger hidden={!compact} onClick={() => onFocus(name)} aria-label={`Expand ${name === "Notepad" ? "Tasks" : name}`} aria-expanded={false}><span className={`l-summary-icon ${name === "Assistant" ? "l-summary-assistant" : ""}`}>{summary.icon}</span><span className="l-summary-copy"><small>{name === "Assistant" ? "Assistant" : name === "Notepad" ? "Tasks" : name}</small><strong>{summary.metric}</strong><span>{summary.detail}</span></span><Maximize2 size={13}/></button>
    <div className="l-widget-content" hidden={compact}>{children}</div>
  </div>;
}
