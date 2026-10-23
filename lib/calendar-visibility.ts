import type { LifeEvent } from "./life";

export const hiddenCalendarEventsKey = "vector.calendar.hidden.v1";

// Calendar IDs scope provider event IDs, including recurring occurrences.
export function calendarEventKey(event: LifeEvent): string {
  return JSON.stringify([event.account || "", event.calendarId || "", event.id]);
}

export function eventHasEnded(event: LifeEvent, now: number): boolean {
  const end = Date.parse(event.end);
  return Number.isFinite(end) && end <= now;
}

export function readHiddenEvents(value: string | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string" && key.length <= 2048).slice(-10000) : []);
  } catch { return new Set(); }
}
