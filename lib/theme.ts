export type DashboardTheme = "light" | "dark";
export type ThemeOverride = { theme: DashboardTheme; until: number };
export const themeStorageKey = "life-os-theme";
export const themeOverrideKey = "vector-theme-override";

export function themeForTime(now: Date): DashboardTheme {
  return now.getHours() >= 21 || now.getHours() < 8 ? "dark" : "light";
}

export function nextThemeChange(now: Date) {
  const next = new Date(now);
  if (now.getHours() < 8) next.setHours(8, 0, 0, 0);
  else if (now.getHours() < 21) next.setHours(21, 0, 0, 0);
  else { next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); }
  return next;
}

export function validThemeOverride(value: unknown, boundary: number): ThemeOverride | null {
  if (!value || typeof value !== "object") return null;
  const choice = value as Partial<ThemeOverride>;
  return (choice.theme === "light" || choice.theme === "dark") && choice.until === boundary ? choice as ThemeOverride : null;
}

// Runs before page content is painted. Old permanent preferences become automatic;
// new manual choices expire at the next local 8 AM / 9 PM boundary.
export const themeBootstrapScript = `(() => {
  const now = new Date();
  const boundary = (${nextThemeChange.toString()})(now).getTime();
  let theme = (${themeForTime.toString()})(now);
  try {
    const choice = (${validThemeOverride.toString()})(JSON.parse(localStorage.getItem(${JSON.stringify(themeOverrideKey)}) || "null"), boundary);
    if (choice) theme = choice.theme;
    localStorage.setItem(${JSON.stringify(themeStorageKey)}, theme);
  } catch {}
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
})();`;
