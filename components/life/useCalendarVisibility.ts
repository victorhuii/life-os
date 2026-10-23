"use client";

import { useEffect, useState } from "react";
import type { LifeEvent } from "@/lib/life";
import { calendarEventKey, eventHasEnded, hiddenCalendarEventsKey, readHiddenEvents } from "@/lib/calendar-visibility";

export default function useCalendarVisibility(events: LifeEvent[]) {
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  useEffect(() => {
    try { setHidden(readHiddenEvents(localStorage.getItem(hiddenCalendarEventsKey))); } catch { /* In-memory hiding still works. */ }
    const update = (event: StorageEvent) => {
      if (event.key === hiddenCalendarEventsKey || event.key === null) setHidden(readHiddenEvents(event.newValue));
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const nextEnd = events.reduce((next, event) => {
      const end = Date.parse(event.end);
      return end > now ? Math.min(next, end) : next;
    }, now + 60000);
    const timer = window.setTimeout(update, Math.max(250, Math.min(60000, nextEnd - Date.now())));
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [events, now]);
  function setEventHidden(event: LifeEvent, value: boolean) {
    const next = new Set(hidden);
    if (value) next.add(calendarEventKey(event)); else next.delete(calendarEventKey(event));
    setHidden(next);
    try { localStorage.setItem(hiddenCalendarEventsKey, JSON.stringify([...next])); } catch { /* Restricted storage: keep this session working. */ }
  }
  const isManuallyHidden = (event: LifeEvent) => hidden.has(calendarEventKey(event));
  const isHidden = (event: LifeEvent) => isManuallyHidden(event) || eventHasEnded(event, now);
  return { now, showHidden, setShowHidden, isHidden, isManuallyHidden, setEventHidden, visibleEvents: showHidden ? events : events.filter(event => !isHidden(event)) };
}
