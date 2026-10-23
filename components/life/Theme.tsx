"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { nextThemeChange, themeBootstrapScript, themeForTime, themeOverrideKey, themeStorageKey, validThemeOverride, type DashboardTheme, type ThemeOverride } from "@/lib/theme";

const ThemeContext = createContext({ theme: "light" as DashboardTheme, mounted: false, toggle: () => {} });

function applyTheme(theme: DashboardTheme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  try { localStorage.setItem(themeStorageKey, theme); } catch {}
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<DashboardTheme>("light");
  const [mounted, setMounted] = useState(false);
  const override = useRef<ThemeOverride | null>(null);

  useEffect(() => {
    const readOverride = () => {
      try { override.current = validThemeOverride(JSON.parse(localStorage.getItem(themeOverrideKey) || "null"), nextThemeChange(new Date()).getTime()); }
      catch { override.current = null; }
    };
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const now = new Date(), boundary = nextThemeChange(now).getTime();
      override.current = validThemeOverride(override.current, boundary);
      const next = override.current?.theme || themeForTime(now);
      applyTheme(next); setTheme(next); setMounted(true);
      // Also catch device clock/timezone changes and browser sleep.
      timer = setTimeout(sync, Math.min(60000, boundary - now.getTime() + 20));
    };
    const onStorage = (event: StorageEvent) => { if (event.key === themeOverrideKey || event.key === null) { readOverride(); sync(); } };
    readOverride(); sync();
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", sync);
    return () => { clearTimeout(timer); window.removeEventListener("focus", sync); window.removeEventListener("pageshow", sync); window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", sync); };
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    override.current = { theme: next, until: nextThemeChange(new Date()).getTime() };
    try { localStorage.setItem(themeOverrideKey, JSON.stringify(override.current)); } catch {}
    applyTheme(next); setTheme(next);
  };

  return <ThemeContext.Provider value={{ theme, mounted, toggle }}><script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}/>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, mounted, toggle } = useContext(ThemeContext);
  const dark = mounted && theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return <button type="button" className="l-icon-button l-theme-toggle" disabled={!mounted} aria-label={label} aria-description="Automatic dark mode from 9 PM to 8 AM in your local time. Manual changes last until the next scheduled switch." title={`${label} · Auto: dark 9 PM–8 AM`} onClick={toggle}>{dark ? <Sun size={16}/> : <Moon size={16}/>}</button>;
}
