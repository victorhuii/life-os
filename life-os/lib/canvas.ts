import { dayKey, type CourseItem } from "./life";

// Only Berkeley's published calendar-feed endpoint may be fetched. Feed URLs
// contain a private token and must never be returned with snapshots or exports.
export function canvasFeedUrl(input: string): string {
  const url = new URL(input.trim().replace(/^webcal:/i, "https:"));
  if (url.protocol !== "https:" || url.hostname !== "bcourses.berkeley.edu" || url.port || url.username || url.password || url.search || url.hash || !/^\/feeds\/calendars\/user_[a-zA-Z0-9_-]{8,512}\.ics$/.test(url.pathname)) {
    throw new Error("Use the Calendar Feed link from bcourses.berkeley.edu → Calendar.");
  }
  return url.href;
}

function unescapeText(value: string) {
  return value.replace(/\\[nN]/g, "\n").replace(/\\([,;\\])/g, "$1").trim();
}
function cleanText(value: string) {
  return unescapeText(value).replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").trim();
}
function calendarDate(value: string, params: string): { due: string; allDay: boolean } | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) return null;
  const [, year, month, date, hour, minute, second, utc] = match;
  const day = `${year}-${month}-${date}`;
  const probe = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== day) return null;
  if (!hour) return { due: day, allDay: true };
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (utc) return { due: `${day}T${hour}:${minute}:${second}Z`, allDay: false };
  const zone = params.match(/TZID="?([^;"\r\n]+)/i)?.[1] || "America/Los_Angeles";
  // Canvas normally emits UTC. Local timestamps are accepted only when their
  // zone is explicit and supported; never silently shift an unknown deadline.
  if (!["America/Los_Angeles", "US/Pacific", "UTC", "Etc/UTC"].includes(zone)) return null;
  if (zone === "UTC" || zone === "Etc/UTC") return { due: `${day}T${hour}:${minute}:${second}Z`, allDay: false };
  let offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" }).formatToParts(probe).find(p => p.type === "timeZoneName")?.value.replace("GMT", "") || "-8";
  offset = `${Number(offset) < 0 ? "-" : "+"}${String(Math.abs(Number(offset))).padStart(2, "0")}:00`;
  return { due: `${day}T${hour}:${minute}:${second}${offset}`, allDay: false };
}

export function parseCanvasFeed(ics: string): CourseItem[] {
  if (!/^BEGIN:VCALENDAR\s*$/m.test(ics.replace(/\r/g, "")) || !/END:VCALENDAR/.test(ics)) throw new Error("bCourses did not return a calendar feed. Copy its Calendar Feed URL again.");
  const lines = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  let event: Record<string, { value: string; params: string }> | null = null;
  const items = new Map<string, CourseItem>();
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { event = {}; continue; }
    if (line === "END:VEVENT") {
      if (!event || event.STATUS?.value === "CANCELLED") { event = null; continue; }
      const start = event.DTSTART && calendarDate(event.DTSTART.value, event.DTSTART.params);
      const title = cleanText(event.SUMMARY?.value || "");
      const id = event.UID?.value;
      if (start && title && id && id.length <= 300) {
        let url: string | undefined;
        try { const u = new URL(unescapeText(event.URL?.value || "")); if (u.protocol === "https:" && u.hostname === "bcourses.berkeley.edu" && !u.username && !u.password) url = u.href; } catch {}
        const courseMatch = title.match(/\s+\[([^\]]+)\]$/);
        const course = courseMatch?.[1] || cleanText(event["X-CANVAS-COURSE-NAME"]?.value || "");
        items.set(id, { id, title: (courseMatch ? title.slice(0, courseMatch.index) : title).slice(0, 400), course: course.slice(0, 200), due: start.due, allDay: start.allDay, ...(url ? { url } : {}), kind: /assignment|quiz/i.test(id) || /\/(assignments|quizzes)\//.test(url || "") ? "assignment" : "event" });
      }
      event = null; continue;
    }
    if (!event) continue;
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const [key, ...params] = line.slice(0, colon).split(";");
    if (["SUMMARY", "UID", "URL", "DTSTART", "STATUS", "X-CANVAS-COURSE-NAME"].includes(key)) event[key] = { value: line.slice(colon + 1), params: params.join(";") };
  }
  return [...items.values()].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 1000);
}
export function courseDay(item: CourseItem) { return item.allDay ? item.due : dayKey(new Date(item.due)); }
