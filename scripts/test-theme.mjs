import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = path.join(root, ".sites-runtime/theme-tests");
mkdirSync(temp, { recursive: true });
writeFileSync(path.join(temp, "theme.mjs"), ts.transpileModule(readFileSync(path.join(root, "lib/theme.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const { themeForTime, nextThemeChange, validThemeOverride, themeBootstrapScript, themeOverrideKey, themeStorageKey } = await import(pathToFileURL(path.join(temp, "theme.mjs")).href);
const originalTimezone = process.env.TZ;
process.env.TZ = "America/Los_Angeles";
try {
  for (const [time, expected] of [["00:00:00", "dark"], ["07:59:59", "dark"], ["08:00:00", "light"], ["12:00:00", "light"], ["20:59:59", "light"], ["21:00:00", "dark"], ["23:59:59", "dark"]]) {
    const now = new Date(`2026-10-19T${time}`);
    assert.equal(themeForTime(now), expected, time);
    const next = nextThemeChange(now); assert.ok(next > now); assert.equal(next.getMinutes(), 0); assert.ok([8, 21].includes(next.getHours()));
  }
  const spring = new Date("2026-03-07T21:00:00"), autumn = new Date("2026-10-31T21:00:00");
  assert.equal((nextThemeChange(spring) - spring) / 3600000, 10, "Spring clock change still switches at local 8 AM");
  assert.equal((nextThemeChange(autumn) - autumn) / 3600000, 12, "Autumn clock change still switches at local 8 AM");
  const night = new Date("2026-10-19T22:00:00"), until = nextThemeChange(night).getTime();
  const choice = { theme: "light", until };
  assert.deepEqual(validThemeOverride(choice, until), choice);
  assert.equal(validThemeOverride(choice, nextThemeChange(new Date("2026-10-20T08:00:00")).getTime()), null);
  for (const bad of [null, "dark", {}, { theme: "other", until }, { theme: "dark", until: "tomorrow" }]) assert.equal(validThemeOverride(bad, until), null);

  const bootstrap = (now, entries = {}, blocked = false) => {
    const storage = new Map(Object.entries(entries)), attributes = {}, root = { style: {}, setAttribute: (key, value) => { attributes[key] = value; } };
    class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
    vm.runInNewContext(themeBootstrapScript, { Date: ClockDate, document: { documentElement: root }, localStorage: { getItem: key => { if (blocked) throw Error("Storage unavailable"); return storage.get(key) ?? null; }, setItem: (key, value) => { if (blocked) throw Error("Storage unavailable"); storage.set(key, value); } } });
    assert.equal(attributes["data-theme"], root.style.colorScheme);
    return attributes["data-theme"];
  };
  assert.equal(bootstrap(night, { [themeStorageKey]: "light" }), "dark", "Legacy permanent light preferences must not block the new schedule");
  assert.equal(bootstrap(night, { [themeOverrideKey]: JSON.stringify(choice) }), "light", "Manual choice survives reload inside its time window");
  assert.equal(bootstrap(new Date("2026-10-20T21:00:00"), { [themeOverrideKey]: JSON.stringify(choice) }), "dark", "Old manual choices expire");
  assert.equal(bootstrap(night, { [themeOverrideKey]: "broken JSON" }), "dark");
  assert.equal(bootstrap(night, {}, true), "dark", "Initial theme works when browser storage is disabled");
  process.env.TZ = "Asia/Tokyo";
  assert.equal(themeForTime(new Date("2026-10-20T06:00:00Z")), "light", "Scheduling follows the device timezone");
  process.env.TZ = "America/Los_Angeles";
  assert.equal(themeForTime(new Date("2026-10-20T06:00:00Z")), "dark");
  console.log("PASS: 8 AM/9 PM boundaries, overnight and DST scheduling, local timezone, manual override expiry, pre-paint theme, old preference migration, corrupt and unavailable storage.");
} finally { if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; }
