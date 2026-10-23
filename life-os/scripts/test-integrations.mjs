import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
const root = fileURLToPath(new URL("../", import.meta.url));
const temp = path.join(root, ".sites-runtime/integration-tests");
mkdirSync(temp, { recursive: true });
for (const name of ["life", "canvas", "weather", "weather-nws", "core"]) {
  const source = readFileSync(path.join(root, `lib/${name}.ts`), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replaceAll('from "./life"', 'from "./life.mjs"').replaceAll('from "./weather"', 'from "./weather.mjs"');
  writeFileSync(path.join(temp, `${name}.mjs`), output);
}
const { canvasFeedUrl, parseCanvasFeed, courseDay } = await import(pathToFileURL(path.join(temp, "canvas.mjs")).href);
const { parseWeather } = await import(pathToFileURL(path.join(temp, "weather.mjs")).href);
const { answerWorkspace } = await import(pathToFileURL(path.join(temp, "core.mjs")).href);
const valid = "https://bcourses.berkeley.edu/feeds/calendars/user_testfeed1234.ics";
assert.equal(canvasFeedUrl(valid.replace("https:", "webcal:")), valid);
for (const url of [valid.replace("https:", "http:"), valid.replace("bcourses.berkeley.edu", "bcourses.berkeley.edu.evil.test"), valid.replace("bcourses.berkeley.edu", "127.0.0.1"), valid + "?url=https://example.test", "https://bcourses.berkeley.edu/other/user_testfeed1234.ics", "https://user:password@bcourses.berkeley.edu/feeds/calendars/user_testfeed1234.ics"]) assert.throws(() => canvasFeedUrl(url));
const feed = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:event-assignment-42\r
SUMMARY:Problem set\\, part 1 [DATA 142A]\r
DTSTART:20261021T065900Z\r
URL:https://bcourses.berkeley.edu/courses/1/assignments/42\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:event-assignment-43\r
SUMMARY:Midterm exam [DATA 142A]\r
DTSTART;TZID=America/Los_Angeles:20261020T093000\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:event-44\r
SUMMARY:Review session with a long\r
 folded title [DATA 142A]\r
DTSTART;VALUE=DATE:20261019\r
URL:javascript:alert(1)\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled\r
SUMMARY:Cancelled item\r
DTSTART:20261020T090000Z\r
STATUS:CANCELLED\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:invalid\r
SUMMARY:Invalid date\r
DTSTART;VALUE=DATE:20260230\r
END:VEVENT\r
END:VCALENDAR\r
`;
const items = parseCanvasFeed(feed);
assert.equal(items.length, 3);
assert.equal(items.find(i => i.id === "event-assignment-42").title, "Problem set, part 1");
assert.equal(items.find(i => i.id === "event-assignment-42").course, "DATA 142A");
assert.equal(courseDay(items.find(i => i.id === "event-assignment-42")), "2026-10-20");
assert.equal(items.find(i => i.id === "event-assignment-43").due, "2026-10-20T09:30:00-07:00");
assert.equal(items.find(i => i.id === "event-44").url, undefined);
assert.equal(items.find(i => i.id === "event-44").title, "Review session with a longfolded title");
assert.throws(() => parseCanvasFeed("<html>sign in</html>"));
const now = new Date("2026-10-17T02:00:00Z");
const empty = { tasks: [], events: [], emails: [], note: "", briefing: null, sources: {}, schedule: { enabled: false, time: "07:00", timezone: "America/Los_Angeles" }, loadedAt: now.toISOString() };
assert.match(answerWorkspace("What’s due next?", empty, now).reply, /Connect your bCourses/);
const connected = { ...empty, coursework: { connected: true, status: "synced", items, updatedAt: now.toISOString() } };
assert.equal(answerWorkspace("When is my next midterm?", connected, now).sources[0].kind, "assignment");
assert.equal(answerWorkspace("What assignments are due next?", connected, now).sources.length, 3);
assert.match(answerWorkspace("What assignments are due next?", { ...connected, coursework: { ...connected.coursework, status: "error" } }, now).reply, /refresh failed/);
const seconds = date => new Date(date).getTime() / 1000;
const weather = parseWeather({ current: { time: seconds(now), temperature_2m: 61.2, apparent_temperature: 59, weather_code: 2, is_day: 0, wind_speed_10m: 6.5 }, daily: { time: [seconds("2026-10-16T07:00:00Z")], temperature_2m_max: [68], temperature_2m_min: [null], precipitation_probability_max: [0], weather_code: [2] }, hourly: { time: [seconds("2026-10-17T01:00:00Z"), seconds("2026-10-17T03:00:00Z")], temperature_2m: [62, 60], weather_code: [2, 3] } }, "berkeley", now);
assert.equal(weather.days[0].date, "2026-10-16");
assert.equal(weather.days[0].low, null);
assert.equal(weather.hours.length, 1);
assert.equal(weather.isDay, false);
assert.equal(weather.location, "Berkeley");
assert.throws(() => parseWeather({ current: { temperature_2m: 60 } }, "berkeley", now));
console.log("PASS: Canvas URL restrictions, escaped/folded feeds, cancelled and invalid entries, Pacific deadlines, actual-source answers, stale coursework and weather parsing.");

const { parseNwsWeather, nwsUrl } = await import(pathToFileURL(path.join(temp, "weather-nws.mjs")).href);
assert.throws(() => nwsUrl("https://evil.test/points/37,-122"));
const period = { startTime: "2026-10-16T19:00:00-07:00", endTime: "2026-10-17T06:00:00-07:00", isDaytime: false, temperature: 60, temperatureUnit: "F", shortForecast: "Mostly Clear", probabilityOfPrecipitation: { value: 0 } };
const forecast = { properties: { periods: [period, { ...period, startTime: "2026-10-17T06:00:00-07:00", endTime: "2026-10-17T18:00:00-07:00", isDaytime: true, temperature: 74 }] } };
const observation = { properties: { timestamp: "2026-10-17T01:45:00Z", temperature: { value: 20, unitCode: "wmoUnit:degC" }, textDescription: "Clear", stationName: "Test airport" } };
const nws = parseNwsWeather(forecast, forecast, observation, "berkeley", now);
assert.equal(nws.temperature, 68);
assert.equal(nws.reading, "current");
assert.equal(nws.feelsLike, null);
assert.equal(nws.days[0].high, null);
assert.equal(nws.days[1].high, 74);
assert.equal(parseNwsWeather(forecast, forecast, null, "berkeley", now).reading, "forecast");
assert.equal(parseNwsWeather(forecast, forecast, { properties: { ...observation.properties, timestamp: "2026-10-16T20:00:00Z" } }, "berkeley", now).reading, "forecast");
console.log("PASS: NWS fallback, unit conversion, missing daily highs, stale observations, explicit forecast labeling and provider URL restrictions.");
