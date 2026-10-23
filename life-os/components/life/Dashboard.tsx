"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUp, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Cloud, CloudMoon, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Clock3, FileText, Inbox, LayoutGrid, Link2, Loader2, MapPin, Maximize2, Minimize2, MessageCircle, Moon, Pause, Play, Plus, RefreshCw, Search, Settings2, Sun, Sunrise, Trash2, X } from "lucide-react";
import { courseDay } from "@/lib/canvas";
import { dayKey, eventOnDay, safeUrl, timezone, type CourseItem, type Coursework, type LifeEvent, type Mail, type State } from "@/lib/life";
import { weatherLabel, weatherLocations, type Weather, type WeatherLocation } from "@/lib/weather";
import CoreChat from "./CoreChat";
import AssistantVisual, { type AssistantAppearance } from "./AssistantVisual";
import "./dashboard.css";
import "./focus-dashboard.css";

type View = "Today" | "Calendar" | "Inbox" | "Coursework" | "Weather" | "Assistant";
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
function WeatherIcon({ code, isDay = true, size = 28 }: { code: number; isDay?: boolean; size?: number }) { const Icon = code === 0 ? isDay ? Sun : Moon : code <= 2 ? isDay ? CloudSun : CloudMoon : code === 3 ? Cloud : code <= 48 ? CloudFog : code <= 57 ? CloudDrizzle : code <= 67 ? CloudRain : code <= 77 ? CloudSnow : code <= 82 ? CloudRain : code <= 86 ? CloudSnow : CloudLightning; return <Icon size={size} strokeWidth={1.5}/>; }
function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={ref} className={`l-modal ${wide ? "l-wide" : ""}`} aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}><header><h2 id="modal-title">{title}</h2><button className="l-icon-button" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></header><div className="l-modal-body">{children}</div></dialog>;
}

export default function Dashboard() {
  const [data, setData] = useState<State>(initial);
  const accounts = [...new Set(data.sources.gmail?.message?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])];
  const selectedEmail = accounts.length === 1 ? accounts[0] : "Selected Gmail account";
  const gmailUrl = accounts.length === 1 ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(selectedEmail)}` : "https://mail.google.com/";
  const calendarUrl = accounts.length === 1 ? `https://calendar.google.com/calendar/r?authuser=${encodeURIComponent(selectedEmail)}` : "https://calendar.google.com/";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setViewState] = useState<View>("Today");
  const [appearance, setAppearance] = useState<AssistantAppearance>("orb");
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [modal, setModal] = useState("");
  const [query, setQuery] = useState("");
  const [today, setToday] = useState(dayKey());
  const [selectedDay, setSelectedDay] = useState(dayKey());
  const [week, setWeek] = useState(monday(dayKey()));
  const [mailFilter, setMailFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("upcoming");
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [location, setLocation] = useState<WeatherLocation>("berkeley");
  const [coreBusy, setCoreBusy] = useState(false);
  const [chatRequest, setChatRequest] = useState<ChatRequest | undefined>();
  const [chatInput, setChatInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [canvasError, setCanvasError] = useState("");
  const [feed, setFeed] = useState("");
  const [note, setNote] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const loadId = useRef(0);
  const weatherId = useRef(0);
  const board = useRef<HTMLDivElement>(null);
  const previousRects = useRef(new Map<string, DOMRect>());
  const lastFeature = useRef("Assistant");
  const setView = useCallback((next: View) => {
    const widgets = board.current?.querySelectorAll<HTMLElement>("[data-widget]");
    previousRects.current.clear();
    widgets?.forEach(widget => previousRects.current.set(widget.dataset.widget!, widget.getBoundingClientRect()));
    widgets?.forEach(widget => widget.getAnimations().forEach(animation => animation.cancel()));
    if (next !== "Today") lastFeature.current = next;
    setViewState(next);
  }, []);
  useLayoutEffect(() => {
    const widgets = board.current?.querySelectorAll<HTMLElement>("[data-widget]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (motionEnabled && !reduced) widgets?.forEach(widget => {
      const before = previousRects.current.get(widget.dataset.widget!);
      const after = widget.getBoundingClientRect();
      if (!before || !before.width || !after.width || !after.height) return;
      widget.animate([
        { transformOrigin: "0 0", transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
        { transformOrigin: "0 0", transform: "none" },
      ], { duration: 430, easing: "cubic-bezier(.22,.8,.22,1)" });
    });
    previousRects.current.clear();
    if (view !== "Today" && window.matchMedia("(max-width: 720px)").matches) board.current?.scrollIntoView({ block: "start", behavior: motionEnabled && !reduced ? "smooth" : "auto" });
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest("[hidden]")) {
      const name = view === "Today" ? lastFeature.current : view;
      board.current?.querySelector<HTMLButtonElement>(`[data-widget="${name}"] [data-focus-trigger]:not([hidden])`)?.focus({ preventScroll: true });
    }
  }, [view, motionEnabled]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => { let off = false; try { off = localStorage.getItem("life-os-motion") === "off"; } catch {} setMotionEnabled(!reduced.matches && !off); };
    try { const saved = localStorage.getItem("life-os-assistant-appearance"); if (saved === "orb" || saved === "buddy") setAppearance(saved); } catch {}
    updateMotion(); reduced.addEventListener("change", updateMotion);
    return () => reduced.removeEventListener("change", updateMotion);
  }, []);
  const chooseAppearance = (value: AssistantAppearance) => { setAppearance(value); try { localStorage.setItem("life-os-assistant-appearance", value); } catch {} };
  const toggleMotion = () => setMotionEnabled(current => { const next = !current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches; try { localStorage.setItem("life-os-motion", next ? "on" : "off"); } catch {} return next; });


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
  useEffect(() => { setNote(data.note); }, [data.note]);
  useEffect(() => {
    const timer = setInterval(() => { const day = dayKey(); setToday(previous => { if (previous !== day) { setSelectedDay(day); setWeek(monday(day)); } return day; }); if (document.visibilityState === "visible") load(); }, 60000);
    const weatherTimer = setInterval(() => { if (document.visibilityState === "visible") loadWeather(location); }, 15 * 60000);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) setView("Today"); if ((event.metaKey || event.ctrlKey) && event.key === "k") { event.preventDefault(); setQuery(""); setModal("search"); } };
    window.addEventListener("keydown", key); return () => { clearInterval(timer); clearInterval(weatherTimer); window.removeEventListener("keydown", key); };
  }, [load, loadWeather, location]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (view === "Inbox" && selectedMail) board.current?.querySelector<HTMLButtonElement>(".l-inline-mail-detail > button")?.focus({ preventScroll: true }); }, [view, selectedMail]);
  const openChat = (text = "", mode: ChatRequest["mode"] = "workspace") => { if (text) setChatRequest({ id: crypto.randomUUID(), text, mode }); else setChatRequest(undefined); setView("Assistant"); };
  const refresh = () => { load(); loadWeather(location); };
  async function write(body: unknown) {
    setSaving(true);
    try { const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "Couldn’t save."); await load(); return true; }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : "Couldn’t save. Try again."); return false; }
    finally { setSaving(false); }
  }
  async function canvasAction(action: "connect" | "refresh" | "disconnect") {
    if (canvasBusy) return; setCanvasBusy(true); setCanvasError("");
    try {
      const response = await fetch("/api/canvas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "connect" ? { feedUrl: feed } : {}) }) });
      const result = await response.json() as Coursework & { error?: string };
      if (!response.ok) throw new Error(result.error || "Couldn’t update bCourses.");
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
  function exportData() { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `life-os-${today}.json`; a.click(); URL.revokeObjectURL(url); }

  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const events = data.events.filter(event => eventOnDay(event, selectedDay)).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const emails = data.emails.filter(mail => mailFilter === "all" || mail.priority === "high").sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const coursework = data.coursework;
  const courseItems = (coursework?.items || []).filter(item => courseFilter === "all" || courseDay(item) >= today).sort((a, b) => a.due.localeCompare(b.due));
  const openTasks = data.tasks.filter(task => !task.done);
  const sources = Object.values(data.sources).map(source => source.updatedAt).filter((value): value is string => !!value).sort();
  const latest = sources.at(-1);
  const searchResults = useMemo(() => { const term = query.trim().toLowerCase(); if (!term) return []; return [
    ...data.events.map(event => ({ title: event.title, detail: `Calendar · ${dateLabel(dayKey(new Date(event.start)))}`, run: () => { setView("Calendar"); setSelectedDay(dayKey(new Date(event.start))); setWeek(monday(dayKey(new Date(event.start)))); } })),
    ...data.emails.map(mail => ({ title: mail.subject, detail: mail.sender, run: () => { setView("Inbox"); setSelectedMail(mail); } })),
    ...(data.coursework?.items || []).map(item => ({ title: item.title, detail: `${item.course || "bCourses"} · ${dateLabel(courseDay(item))}`, run: () => { setView("Coursework"); setCourseFilter("all"); } })),
    ...data.tasks.map(task => ({ title: task.title, detail: `Task · ${task.category}`, run: () => setModal("tasks") })),
  ].filter(item => `${item.title} ${item.detail}`.toLowerCase().includes(term)).slice(0, 12); }, [query, data]);
  const calendar = <section className={`l-panel l-calendar-panel ${view === "Calendar" ? "l-panel-full" : ""}`} aria-labelledby="calendar-heading">
    <header className="l-panel-header"><div className="l-section-title"><CalendarDays size={17}/><h2 id="calendar-heading"><button data-focus-trigger aria-expanded={view === "Calendar"} onClick={() => setView(view === "Calendar" ? "Today" : "Calendar")}>Calendar{view === "Calendar" ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}</button></h2></div><div className="l-header-actions"><a className="l-icon-button" href={calendarUrl} target="_blank" rel="noreferrer" aria-label="Open Google Calendar"><ArrowUpRight size={16}/></a><button className="l-icon-button" aria-label="Create a Google Calendar event with ChatGPT" onClick={() => openChat("Help me add an event to my Google Calendar. Ask me for the title, date and time.", "connected")}><Plus size={17}/></button></div></header>
    <div className="l-calendar-toolbar"><span>{format(`${week}T12:00:00Z`, { month: "long", year: "numeric" })}</span><div><button className="l-small-button" onClick={() => { setWeek(monday(today)); setSelectedDay(today); }}>Today</button><button className="l-icon-button" aria-label="Previous week" onClick={() => { setWeek(addDays(week, -7)); setSelectedDay(addDays(selectedDay, -7)); }}><ChevronLeft size={15}/></button><button className="l-icon-button" aria-label="Next week" onClick={() => { setWeek(addDays(week, 7)); setSelectedDay(addDays(selectedDay, 7)); }}><ChevronRight size={15}/></button></div></div>
    <div className="l-week" aria-label="Choose a calendar day">{days.map(day => { const hasEvent = data.events.some(event => eventOnDay(event, day)); return <button key={day} onClick={() => setSelectedDay(day)} aria-pressed={day === selectedDay} aria-label={dateLabel(day, true)} className={`${day === today ? "l-is-today" : ""} ${day === selectedDay ? "l-selected-day" : ""}`}><span>{format(`${day}T12:00:00Z`, { weekday: "short" })}</span><strong>{Number(day.slice(-2))}</strong><i className={hasEvent ? "l-has-event" : ""}/></button>; })}</div>
    <div className="l-agenda-heading"><span>{selectedDay === today ? "Today’s schedule" : dateLabel(selectedDay, true)}</span><small>{events.length} {events.length === 1 ? "event" : "events"}</small></div>
    <div className="l-agenda">{loading ? <LoadingRows/> : events.length ? events.map(event => <AgendaRow event={event} key={event.id}/>) : <div className="l-empty l-calendar-empty"><CalendarDays size={24} strokeWidth={1.3}/><h3>No events saved for this day.</h3><p>{data.sources.calendar?.updatedAt ? "Your primary calendar snapshot is clear." : "Your Google Calendar hasn’t synced yet."}</p><button className="l-text-button" onClick={() => openChat(`Check my live primary Google Calendar for ${selectedDay}.`, "connected")}>Check live calendar<ArrowRight size={13}/></button></div>}</div>
    <footer className="l-panel-footer"><span><i className={`l-status-dot ${data.sources.calendar?.status === "error" ? "l-warning" : ""}`}/>Primary calendar · {relative(data.sources.calendar?.updatedAt)}</span>{data.sources.calendar?.status === "error" && <small>Saved copy</small>}</footer>
  </section>;
  const inbox = <section className={`l-panel l-inbox-panel ${view === "Inbox" ? "l-panel-full" : ""}`} aria-labelledby="inbox-heading">
    <header className="l-panel-header"><div className="l-section-title"><Inbox size={17}/><h2 id="inbox-heading"><button data-focus-trigger aria-expanded={view === "Inbox"} onClick={() => setView(view === "Inbox" ? "Today" : "Inbox")}>Inbox{view === "Inbox" ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}</button></h2><span className="l-count">{data.emails.length}</span></div><a className="l-icon-button" href={gmailUrl} target="_blank" rel="noreferrer" aria-label="Open Gmail"><ArrowUpRight size={16}/></a></header>
    <div className="l-tabs"><button aria-pressed={mailFilter === "attention"} onClick={() => setMailFilter("attention")}>Needs attention</button><button aria-pressed={mailFilter === "all"} onClick={() => setMailFilter("all")}>All saved</button></div>
    <div className="l-mail-list">{view === "Inbox" && selectedMail ? <div className="l-inline-mail-detail"><button className="l-text-button" onClick={() => setSelectedMail(null)}><ChevronLeft size={13}/>Back to summaries</button><div className="l-mail-detail"><span className="l-mail-detail-sender">{selectedMail.sender}<small>{format(selectedMail.receivedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span><h3>{selectedMail.subject}</h3><p>{selectedMail.summary}</p><div className="l-form-actions"><a className="l-button l-primary" href={safeUrl(selectedMail.url)} target="_blank" rel="noreferrer">Read in Gmail<ArrowUpRight size={13}/></a><button className="l-button l-secondary" onClick={() => { const subject = selectedMail.subject; setSelectedMail(null); openChat(`Help me review the email with subject “${subject}”.`, "connected"); }}>Ask assistant</button></div><p className="l-form-description">Saved summary · {relative(data.sources.gmail?.updatedAt)}. Open Gmail for the full message and replies.</p></div></div> : loading ? <LoadingRows/> : emails.length ? emails.slice(0, view === "Inbox" ? 30 : 3).map(mail => <button className="l-mail-row" key={mail.id} onClick={() => setSelectedMail(mail)}><span className="l-avatar" style={{ "--avatar-hue": `${[...mail.sender].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360}` } as React.CSSProperties}>{mail.sender[0]}</span><span className="l-mail-copy"><span className="l-mail-sender">{mail.sender}<small>{dayKey(new Date(mail.receivedAt)) === today ? time(mail.receivedAt) : dateLabel(dayKey(new Date(mail.receivedAt)))}</small></span><strong>{mail.subject}</strong><span className="l-mail-summary">{mail.summary}</span></span></button>) : <div className="l-empty"><Inbox size={25} strokeWidth={1.3}/><h3>{mailFilter === "attention" && data.emails.length ? "No saved emails flagged for attention." : "No email summaries yet."}</h3><p>Ask ChatGPT to refresh your selected inbox.</p><button className="l-text-button" onClick={() => openChat("Refresh the saved Life OS inbox summaries from my selected Gmail account.", "connected")}>Refresh with ChatGPT<ArrowRight size={13}/></button></div>}</div>
    <footer className="l-panel-footer"><span>Saved summaries · {relative(data.sources.gmail?.updatedAt)}</span><button className="l-text-button" onClick={() => view === "Inbox" ? openChat("Summarize my emails") : setView("Inbox")}>{view === "Inbox" ? "Ask assistant" : "View inbox"}<ArrowRight size={12}/></button></footer>
  </section>;
  const courses = <section className={`l-panel l-course-panel ${view === "Coursework" ? "l-panel-full" : ""}`} aria-labelledby="coursework-heading">
    <header className="l-panel-header"><div className="l-section-title"><BookOpen size={17}/><h2 id="coursework-heading"><button data-focus-trigger aria-expanded={view === "Coursework"} onClick={() => setView(view === "Coursework" ? "Today" : "Coursework")}>Coursework{view === "Coursework" ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}</button></h2><span className="l-provider-label">bCourses</span></div><div className="l-header-actions">{coursework?.connected && <button disabled={canvasBusy} className="l-icon-button" aria-label="Refresh bCourses feed" onClick={() => canvasAction("refresh")}><RefreshCw size={14} className={canvasBusy ? "l-spin" : ""}/></button>}<a className="l-icon-button" href={canvasUrl} target="_blank" rel="noreferrer" aria-label="Open bCourses"><ArrowUpRight size={16}/></a></div></header>
    {coursework?.connected ? <><div className="l-tabs"><button aria-pressed={courseFilter === "upcoming"} onClick={() => setCourseFilter("upcoming")}>Upcoming</button><button aria-pressed={courseFilter === "all"} onClick={() => setCourseFilter("all")}>All saved</button></div>{coursework.status === "error" && <div className="l-inline-warning">{coursework.message}</div>}<div className="l-course-list">{courseItems.length ? courseItems.slice(0, view === "Coursework" ? 100 : 5).map(item => <div className="l-course-row" key={item.id}><span className="l-course-icon"><FileText size={16}/></span><div><a href={safeUrl(item.url || canvasUrl)} target="_blank" rel="noreferrer">{item.title}<ArrowUpRight size={12}/></a><p>{item.course || "bCourses"}{item.kind === "event" && " · Course event"}</p></div><span className={`l-due ${courseDay(item) === today ? "l-due-today" : ""}`}>{dueLabel(item, today)}<small>{item.allDay ? "All day" : time(item.due)}</small></span></div>) : <div className="l-empty"><Check size={25} strokeWidth={1.5}/><h3>No upcoming dated items.</h3><p>Check bCourses for undated assignments and submission status.</p></div>}</div><footer className="l-panel-footer"><span>Calendar feed · {relative(coursework.updatedAt)}</span><button className="l-text-button" onClick={() => view === "Coursework" ? openChat("What assignments are due next?") : setView("Coursework")}>{view === "Coursework" ? "Ask assistant" : "View all"}<ArrowRight size={12}/></button></footer></> : <div className="l-connect-course"><span className="l-connect-course-icon"><BookOpen size={23} strokeWidth={1.4}/></span><h3>Connect your course calendar</h3><p>See dated assignments and course events<br className="l-desktop-break"/> from your bCourses calendar.</p><button className="l-button l-primary" onClick={() => { setCanvasError(""); setModal("canvas"); }}><Link2 size={14}/>Connect bCourses</button><span className="l-connection-footnote">Uses your private Calendar Feed link.</span></div>}
  </section>;
  const weatherDetails = <div className="l-weather-modal"><label className="l-field">Location<select value={location} onChange={event => { const value = event.target.value as WeatherLocation; setLocation(value); try { localStorage.setItem("life-os-weather", value); } catch {} }}>{Object.entries(weatherLocations).map(([key, city]) => <option key={key} value={key}>{city.name}</option>)}</select></label>{weatherError && <p className="l-inline-warning">{weatherError}</p>}{weather ? <><div className="l-weather-current"><WeatherIcon code={weather.code} isDay={weather.isDay} size={46}/><strong>{Math.round(weather.temperature)}°<small>F</small></strong><div>{weather.condition || weatherLabel(weather.code)}<p>{weather.feelsLike === null ? weather.reading === "forecast" ? "Current-hour forecast" : "Nearby station observation" : `Feels like ${Math.round(weather.feelsLike)}°`}</p></div></div><div className="l-weather-hourly">{weather.hours.slice(0, 6).map(hour => <div key={hour.at}><small>{time(hour.at).replace(":00", "")}</small><WeatherIcon code={hour.code} size={21}/><strong>{hour.temperature === null ? "—" : `${Math.round(hour.temperature)}°`}</strong></div>)}</div><div className="l-weather-days">{weather.days.map(day => <div key={day.date}><span>{day.date === today ? "Today" : format(`${day.date}T12:00:00Z`, { weekday: "short" })}</span><WeatherIcon code={day.code} size={19}/><small>{day.rain === null ? "—" : `${day.rain}% rain`}</small><strong>{day.high === null ? "—" : `${Math.round(day.high)}°`}<span>{day.low === null ? "—" : `${Math.round(day.low)}°`}</span></strong></div>)}</div><p className="l-form-description">Updated {relative(weather.observedAt)} · Data from <a href={safeUrl(weather.sourceUrl || "https://open-meteo.com/")} target="_blank" rel="noreferrer">{weather.source || "Open-Meteo"}</a>.{weather.observationLabel && <><br/>{weather.observationLabel}</>}</p></> : <div className="l-empty">{weatherLoading ? <Loader2 className="l-spin" size={26}/> : <Cloud size={26}/>}<p>{weatherLoading ? "Loading forecast…" : "Couldn’t load the current forecast."}</p></div>}<button className="l-button l-secondary" disabled={weatherLoading} onClick={() => loadWeather(location)}><RefreshCw size={13}/>Refresh weather</button></div>;
  const weatherPanel = <section className="l-panel l-weather-panel" aria-labelledby="weather-heading">
    <header className="l-panel-header"><div className="l-section-title"><CloudSun size={17}/><h2 id="weather-heading"><button data-focus-trigger aria-expanded={view === "Weather"} onClick={() => setView(view === "Weather" ? "Today" : "Weather")}>Weather{view === "Weather" ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}</button></h2></div><span className="l-weather-place">{weatherLocations[location].name}</span></header>
    <div className="l-weather-glance" hidden={view === "Weather"}><div className="l-weather-glance-main"><span>{weather ? <WeatherIcon code={weather.code} isDay={weather.isDay} size={42}/> : weatherLoading ? <Loader2 size={26} className="l-spin"/> : <Cloud size={36}/>}</span><strong>{weather ? `${Math.round(weather.temperature)}°` : "—"}</strong><div><p>{weather ? weather.condition || weatherLabel(weather.code) : weatherLoading ? "Loading weather…" : "Weather unavailable"}</p><small>{weather?.reading === "forecast" ? "Current-hour forecast" : "Current conditions"}{weather?.stale ? " · Saved reading" : ""}</small></div></div><div className="l-weather-three">{weather?.days.map(day => <div key={day.date}><span>{day.date === today ? "Today" : format(`${day.date}T12:00:00Z`, { weekday: "short" })}</span><WeatherIcon code={day.code} size={17}/><strong>{day.high === null ? "—" : `${Math.round(day.high)}°`}<small>{day.low === null ? "—" : `${Math.round(day.low)}°`}</small></strong></div>)}</div>{weatherError && <p className="l-weather-glance-error">{weatherError}</p>}</div>
    <div className="l-weather-expanded" hidden={view !== "Weather"}>{weatherDetails}</div>
    <footer className="l-panel-footer"><span>{weather?.stale ? "Saved weather" : "Weather"} · {relative(weather?.observedAt)}</span><button className="l-text-button" onClick={() => setView(view === "Weather" ? "Today" : "Weather")}>{view === "Weather" ? "Show all widgets" : "Forecast"}<ArrowRight size={12}/></button></footer>
  </section>;
  const assistant = <section className={`l-panel l-assistant-panel l-personal-core ${view === "Assistant" ? "l-core-focused" : ""}`} aria-labelledby="assistant-heading">
    <div className="l-core-overview" hidden={view === "Assistant"}>
      <div className="l-core-eyebrow"><span className={coreBusy ? "l-core-busy-dot" : ""}/>{coreBusy ? "Reading saved data" : "Personal Core"}</div>
      <button className={`l-core-launch l-appearance-${appearance}`} data-focus-trigger aria-label="Expand Personal Core chat" aria-expanded={view === "Assistant"} onClick={() => openChat()}><AssistantVisual appearance={appearance} animate={motionEnabled} busy={coreBusy}/></button>
      <h2 id="assistant-heading">Personal Core</h2><p>What can I help you with?</p>
      <div className="l-core-appearance" data-no-focus role="group" aria-label="Assistant appearance"><button aria-pressed={appearance === "orb"} onClick={() => chooseAppearance("orb")}>Orb</button><button aria-pressed={appearance === "buddy"} onClick={() => chooseAppearance("buddy")}>Buddy</button><span/><button aria-pressed={motionEnabled} className="l-core-motion" aria-label={motionEnabled ? "Pause assistant animation" : "Enable assistant animation"} onClick={toggleMotion}>{motionEnabled ? <Pause size={12}/> : <Play size={12}/>}</button></div>
      <div className="l-core-suggestions">{["What’s due next?", "Summarize my emails"].map(prompt => <button key={prompt} onClick={() => openChat(prompt)}>{prompt}<ArrowUpRight size={12}/></button>)}</div>
      <form className="l-assistant-input" onSubmit={event => { event.preventDefault(); if (chatInput.trim()) { openChat(chatInput.trim()); setChatInput(""); } }}><textarea aria-label="Ask Personal Core" placeholder="Ask your core…" rows={2} maxLength={3000} value={chatInput} onChange={event => setChatInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><button type="submit" disabled={!chatInput.trim() || coreBusy} aria-label="Send to assistant"><ArrowUp size={17}/></button></form>
      <span className="l-core-scope">Saved data here · live actions in ChatGPT</span>
    </div>
    <div className="l-core-inline-host" hidden={view !== "Assistant"}><CoreChat inline open={view === "Assistant"} onClose={() => setView("Today")} onChanged={() => load()} onBusy={setCoreBusy} initialRequest={chatRequest} avatar={<AssistantVisual appearance={appearance} animate={motionEnabled} busy={coreBusy}/>}/></div>
    <footer className="l-panel-footer"><button className="l-text-button" onClick={() => setModal("tasks")}>{openTasks.length} open {openTasks.length === 1 ? "task" : "tasks"}<ArrowRight size={12}/></button><button className="l-text-button" onClick={() => view === "Assistant" ? setView("Today") : openChat()}>{view === "Assistant" ? "All widgets" : "Open chat"}{view === "Assistant" ? <Minimize2 size={12}/> : <ArrowUpRight size={12}/>}</button></footer>
  </section>;
  const calendarCount = data.events.filter(event => eventOnDay(event, today)).length;
  const nextCourse = (coursework?.items || []).find(item => courseDay(item) >= today);
  const summaries = {
    Calendar: { icon: <CalendarDays size={18}/>, metric: loading ? "Loading…" : `${calendarCount} ${calendarCount === 1 ? "event" : "events"} today`, detail: "Primary Google Calendar" },
    Inbox: { icon: <Inbox size={18}/>, metric: loading ? "Loading…" : `${data.emails.length} saved summaries`, detail: data.emails[0]?.subject || "Your selected Gmail inbox" },
    Coursework: { icon: <BookOpen size={18}/>, metric: coursework?.connected ? `${courseItems.length} ${courseItems.length === 1 ? "dated item" : "dated items"}` : "Connect bCourses", detail: nextCourse?.title || "Your assignments and due dates" },
    Weather: { icon: weather ? <WeatherIcon code={weather.code} isDay={weather.isDay} size={23}/> : <CloudSun size={20}/>, metric: weather ? `${Math.round(weather.temperature)}° · ${weatherLocations[location].name}` : weatherLoading ? "Loading weather…" : "Weather unavailable", detail: weather ? weather.condition || weatherLabel(weather.code) : "Forecast and conditions" },
    Assistant: { icon: <AssistantVisual appearance={appearance} animate={motionEnabled} busy={coreBusy}/>, metric: "Personal Core", detail: coreBusy ? "Reading saved data…" : "Ask about your day" },
  };
  const modules = { Calendar: calendar, Assistant: assistant, Inbox: inbox, Weather: weatherPanel, Coursework: courses };

  return <div className="l-app l-focus-app" data-motion={motionEnabled ? "on" : "off"}>
    <header className="l-dashboard-top"><button className="l-dashboard-brand" onClick={() => setView("Today")} aria-label="Show all dashboard widgets"><span>v.</span>Life OS</button><div className="l-dashboard-top-actions"><span className="l-dashboard-private">Victor’s dashboard</span><button className="l-icon-button" aria-label="Search dashboard" onClick={() => { setQuery(""); setModal("search"); }}><Search size={16}/></button><button className="l-icon-button" aria-label="Reload saved dashboard and weather" disabled={refreshing} onClick={refresh}><RefreshCw size={15} className={refreshing ? "l-spin" : ""}/></button><button className="l-icon-button" aria-label="Manage connections" onClick={() => { setCanvasError(""); setModal("connections"); }}><Settings2 size={17}/></button><span className="l-dashboard-avatar">V</span></div></header>
    <main className="l-dashboard-main" id="main-content"><div className="l-dashboard-heading"><div><p>{format(`${today}T12:00:00Z`, { weekday: "long", month: "long", day: "numeric" })}</p><h1>Your day.</h1></div><button className={`l-all-widgets ${view !== "Today" ? "l-all-widgets-active" : ""}`} onClick={() => setView("Today")}><LayoutGrid size={14}/>{view === "Today" ? "All widgets" : "Back to dashboard"}{view !== "Today" && <kbd>esc</kbd>}</button></div>
      {error && <div className="l-error-banner" role="alert">{error}<button onClick={() => load()}>Try again</button></div>}
      {notice && <div className="l-toast" role="status"><Check size={15}/>{notice}<button className="l-icon-button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={13}/></button></div>}
      <button className="l-daily-summary" onClick={() => setModal("briefing")}><span><Sunrise size={17}/>Morning brief</span><p>{loading ? "Loading your day…" : data.briefing?.summary || "Your schedule, email and course deadlines come together here as your sources connect."}</p><ArrowUpRight size={15}/></button>
      <div className="l-dashboard-focus-label"><span>{view === "Today" ? "At a glance" : `${view === "Assistant" ? "Personal Core" : view} · expanded`}</span><small>{view === "Today" ? "Click a widget to make room for it" : "The rest of your day stays within reach"}</small></div>
      <div ref={board} className="l-focus-board" data-focus={view.toLowerCase()}>{(Object.keys(modules) as Exclude<View, "Today">[]).map(name => <DashboardWidget name={name} view={view} summary={summaries[name]} onFocus={setView} key={name}>{modules[name]}</DashboardWidget>)}</div>
      <span className="l-sr-only" role="status">{view === "Today" ? "All dashboard widgets are visible." : `${view} expanded. Other widgets are compact. Press Escape to restore all widgets.`}</span>
      <footer className="l-dashboard-footer"><span><Clock3 size={11}/>Pacific time<span>·</span>{data.schedule.enabled ? "Morning update at 7:00 AM" : "Morning update pending"}</span><span>{refreshing ? "Updating…" : latest ? `Saved sources · ${relative(latest)}` : "Your private dashboard"}<button onClick={() => setModal("connections")}>Connections</button></span></footer>
    </main>
    {(modal === "canvas" || modal === "connections") && <Modal title={modal === "canvas" ? "Connect bCourses" : "Connections"} wide={modal === "connections"} onClose={() => { setModal(""); setFeed(""); setConfirmDisconnect(false); }}>
      {modal === "connections" && <><div className="l-connection-row"><span className="l-service-icon l-google">G</span><div><strong>Google Calendar</strong><p>Primary calendar · {selectedEmail}</p><small>{data.sources.calendar?.updatedAt ? `Saved snapshot · ${relative(data.sources.calendar.updatedAt)}` : "Awaiting first sync"}</small></div><button className="l-small-button" onClick={() => { setModal(""); openChat("Refresh my Life OS primary Google Calendar snapshot.", "connected"); }}>Refresh in ChatGPT<ArrowUpRight size={12}/></button></div><div className="l-connection-row"><span className="l-service-icon l-mail-service"><Inbox size={20}/></span><div><strong>Gmail</strong><p>{selectedEmail}</p><small>{data.sources.gmail?.updatedAt ? `Saved summaries · ${relative(data.sources.gmail.updatedAt)}` : "Awaiting first sync"}</small></div><a className="l-small-button" href={gmailUrl} target="_blank" rel="noreferrer">Open Gmail<ArrowUpRight size={12}/></a></div><div className="l-connection-row"><span className="l-service-icon l-canvas-service"><BookOpen size={20}/></span><div><strong>bCourses / Canvas</strong><p>{coursework?.connected ? `${coursework.items.length} dated course items in your feed` : "Your course calendar isn’t connected yet"}</p><small>{coursework?.updatedAt ? `Last successful sync · ${relative(coursework.updatedAt)}` : "Connect using your Calendar Feed link below"}</small></div>{coursework?.connected && <button className="l-small-button" disabled={canvasBusy} onClick={() => canvasAction("refresh")}>Refresh</button>}</div><div className="l-settings-divider"/></>}
      <div className="l-canvas-setup"><h3>{coursework?.connected ? "Update your bCourses feed" : "Import your course calendar"}</h3><p>Dated assignments and course events appear automatically. Grades and submission status stay in bCourses.</p><ol><li>Open <a href={`${canvasUrl}/calendar`} target="_blank" rel="noreferrer">bCourses Calendar<ArrowUpRight size={11}/></a>.</li><li>Click <strong>Calendar Feed</strong> at the bottom of its right sidebar.</li><li>Copy the full link and paste it below.</li></ol><form onSubmit={event => { event.preventDefault(); canvasAction("connect"); }}><label className="l-field">Calendar Feed link<input type="url" required autoComplete="off" spellCheck={false} placeholder="https://bcourses.berkeley.edu/feeds/calendars/…" maxLength={2000} value={feed} onChange={event => setFeed(event.target.value)}/></label>{canvasError && <p className="l-chat-error" role="alert">{canvasError}</p>}<div className="l-form-actions"><button className="l-button l-primary" disabled={canvasBusy || !feed.trim()}>{canvasBusy ? <Loader2 className="l-spin" size={14}/> : <Link2 size={14}/>} {coursework?.connected ? "Update connection" : "Connect bCourses"}</button>{coursework?.connected && <button type="button" className="l-text-button l-danger" disabled={canvasBusy} onClick={() => setConfirmDisconnect(true)}>Disconnect</button>}</div></form><p className="l-form-description">Your feed link is private and saved on the server. It won’t appear in workspace exports. Refreshes every 30 minutes while open and with the morning update.</p>{confirmDisconnect && <div className="l-disconnect-confirm"><p>Remove this feed and its saved course items?</p><button className="l-button l-danger-button" disabled={canvasBusy} onClick={() => canvasAction("disconnect")}>Disconnect bCourses</button><button className="l-text-button" onClick={() => setConfirmDisconnect(false)}>Keep connection</button></div>}</div>
      {modal === "connections" && <><div className="l-settings-divider"/><div className="l-connection-row"><span className="l-service-icon"><Sun size={20}/></span><div><strong>Weather</strong><p>{weatherLocations[location].name} · {weather?.source || "Weather forecast"}</p></div><button className="l-small-button" onClick={() => { setModal(""); setView("Weather"); }}>Change location</button></div><div className="l-connection-row"><span className="l-service-icon"><MessageCircle size={19}/></span><div><strong>ChatGPT assistant</strong><p>Life OS tools and your authorized connected apps</p><small>Live app requests continue in a separate ChatGPT tab.</small></div><button className="l-small-button" onClick={() => { setModal(""); openChat(); }}>Open chat</button></div><details className="l-workspace-settings"><summary>Workspace data<ChevronDown size={14}/></summary><div><label className="l-field">Personal note<textarea value={note} onChange={event => setNote(event.target.value)} rows={4} maxLength={10000} placeholder="A note to keep around…"/></label><button className="l-button l-secondary" disabled={saving} onClick={async () => { if (await write({ action: "note", value: note })) setNotice("Note saved."); }}>Save note</button><button className="l-button l-secondary" onClick={exportData}><ArrowDownToLine size={13}/>Export workspace</button></div></details><p className="l-form-description">Calendar and email are saved snapshots, refreshed through ChatGPT and your 7:00 AM briefing. Reloading the dashboard reads those saved snapshots. Only your selected email account is in scope.</p></>}
    </Modal>}
    {modal === "briefing" && <Modal title="Morning brief" onClose={() => setModal("")}><div className="l-briefing-full"><p className="l-form-description">{data.briefing ? `${dateLabel(data.briefing.day, true)} · Prepared ${time(data.briefing.generatedAt)}` : "Daily at 7:00 AM Pacific"}</p><h3>{data.briefing?.title || "Your day starts here."}</h3><p>{data.briefing?.summary || "Connect your sources to bring your schedule, email and course deadlines into your morning briefing."}</p>{!!data.briefing?.priorities.length && <><h4>Worth your attention</h4><ol>{data.briefing.priorities.map((priority, index) => <li key={index}>{priority}</li>)}</ol></>}{!!data.briefing?.headsUp.length && <><h4>Keep in mind</h4>{data.briefing.headsUp.map((item, index) => <p className="l-headsup" key={index}>{item}</p>)}</>}<button className="l-button l-secondary" onClick={() => { setModal(""); openChat("Help me plan my day using my saved briefing and course deadlines."); }}>Talk through my day<ArrowRight size={13}/></button></div></Modal>}
    {modal === "search" && <Modal title="Search your workspace" wide onClose={() => setModal("")}><div className="l-command-search"><Search size={17}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an email, event, assignment or task…" aria-label="Search saved workspace"/><kbd>ESC</kbd></div><div className="l-search-results">{searchResults.length ? searchResults.map((item, index) => <button key={index} onClick={() => { setModal(""); item.run(); }}><Search size={14}/><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={14}/></button>) : <p>{query ? "No saved matches. Try another word." : "Search your saved information in one place."}</p>}</div></Modal>}
    {(modal === "tasks" || modal === "task") && <Modal title={modal === "task" ? "Add a personal task" : "Personal tasks"} onClose={() => setModal("")}>{modal === "task" ? <form className="l-task-form" onSubmit={addTask}><label className="l-field">Task<input name="title" required maxLength={240} autoFocus placeholder="What needs doing?"/></label><div className="l-two-fields"><label className="l-field">Due date<input name="due" type="date"/></label><label className="l-field">Category<select name="category"><option>Personal</option><option>School</option><option>Work</option></select></label></div><button className="l-button l-primary" disabled={saving}>{saving ? "Saving…" : "Add task"}</button></form> : <><div className="l-personal-tasks">{data.tasks.length ? data.tasks.map(task => <div key={task.id} className={`l-task-row ${task.done ? "l-task-done" : ""}`}><button disabled={saving} className="l-task-check" aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`} onClick={() => write({ action: "task", value: { ...task, done: !task.done } })}>{task.done ? <Check size={14}/> : <Circle size={16}/>}</button><span><strong>{task.title}</strong><small>{task.category}{task.due && ` · ${dateLabel(task.due)}`}</small></span><button disabled={saving} className="l-icon-button" aria-label={`Delete ${task.title}`} onClick={() => write({ action: "deleteTask", id: task.id })}><Trash2 size={13}/></button></div>) : <div className="l-empty"><Check size={25}/><h3>No personal tasks yet.</h3><p>Add one here or ask your assistant.</p></div>}</div><button className="l-button l-primary" onClick={() => setModal("task")}><Plus size={14}/>Add task</button><p className="l-form-description">These tasks are saved in Life OS. Course submissions and Google Calendar are managed in their own apps.</p></>}</Modal>}

  </div>;
}
function LoadingRows() { return <div className="l-loading" role="status"><Loader2 size={18} className="l-spin"/><span>Loading your saved information…</span></div>; }
function AgendaRow({ event }: { event: LifeEvent }) { return <div className="l-event"><div className="l-event-time">{event.allDay ? "All day" : time(event.start)}{!event.allDay && <small>{time(event.end)}</small>}</div><div className="l-event-rule"/><div className="l-event-copy"><h3>{event.title}</h3>{event.location && <p><MapPin size={11}/>{event.location}</p>}<span>{event.source}</span></div>{event.url && <a className="l-icon-button" aria-label={`Open ${event.title}`} href={safeUrl(event.url)} target="_blank" rel="noreferrer"><ArrowUpRight size={14}/></a>}</div>; }

function DashboardWidget({ name, view, summary, children, onFocus }: { name: Exclude<View, "Today">; view: View; summary: { icon: React.ReactNode; metric: string; detail: string }; children: React.ReactNode; onFocus: (name: View) => void }) {
  const compact = view !== "Today" && view !== name;
  return <div className={`l-dashboard-widget l-widget-${name.toLowerCase()} ${compact ? "l-widget-compact" : ""} ${view === name ? "l-widget-focused" : ""}`} data-widget={name} onClickCapture={event => { if (view === "Today" && !(event.target as HTMLElement).closest("[data-no-focus]")) onFocus(name); }}>
    <button className="l-widget-summary" data-focus-trigger hidden={!compact} onClick={() => onFocus(name)} aria-label={`Expand ${name}`} aria-expanded={false}><span className={`l-summary-icon ${name === "Assistant" ? "l-summary-assistant" : ""}`}>{summary.icon}</span><span className="l-summary-copy"><small>{name === "Assistant" ? "Assistant" : name}</small><strong>{summary.metric}</strong><span>{summary.detail}</span></span><Maximize2 size={13}/></button>
    <div className="l-widget-content" hidden={compact}>{children}</div>
  </div>;
}
