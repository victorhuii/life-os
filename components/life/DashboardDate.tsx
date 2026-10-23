"use client";

import { useEffect, useState } from "react";

export default function DashboardDate({ fallbackDay }: { fallbackDay: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  const date = now || new Date(`${fallbackDay}T12:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...(!now ? { timeZone: "UTC" } : {}), ...options }).format(date);
  const dateKey = now ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : fallbackDay;

  return <div className="l-date-heading"><h1><time dateTime={dateKey} aria-label={part({ weekday: "long", month: "long", day: "numeric", year: "numeric" })}><span className="l-date-number" aria-hidden="true">{part({ day: "2-digit" })}</span><span className="l-date-detail" aria-hidden="true"><span className="l-date-weekday">{part({ weekday: "long" })}</span><span className="l-date-month">{part({ month: "long" })}<span>{part({ year: "numeric" })}</span></span></span></time></h1><span className="l-date-local"><time dateTime={now?.toISOString()}>{now ? part({ hour: "numeric", minute: "2-digit" }) : "—"}</time><span>Local time</span></span></div>;
}
