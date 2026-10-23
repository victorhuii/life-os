# Connections and data freshness

The main screen focuses on weather, Google Calendar, email summaries, bCourses deadlines and the assistant. It uses one dashboard with a moving Vector in the center. Click a widget to expand it; the other widgets shrink into compact summaries. Chat and email summaries expand inline. The assistant uses the particle orb. Motion respects reduced-motion preferences.

## Weather

Weather uses Open-Meteo's public forecast API, fetched by the server, with the National Weather Service as a fallback when the provider is unavailable or rate-limits the shared hosting address. Berkeley is the default. Expand the Weather widget to switch to San Francisco or Millbrae and see the hourly and three-day forecast. Temperature is Fahrenheit; time is Pacific. Your city preference is stored only on that device.

Responses are cached for 15 minutes. A failed request shows the last saved reading with a stale label, or an explicit unavailable state. No temperatures are invented. Attribution names the actual provider. NWS current temperatures use a recent nearby airport observation, named in the weather details. If that observation is missing or over two hours old, the current-hour forecast is explicitly labeled as a forecast. A missing daytime high stays blank rather than being inferred. Its public API is appropriate for this personal noncommercial dashboard; review its current terms before commercial reuse.

## bCourses / Canvas

1. Sign into https://bcourses.berkeley.edu/calendar.
2. Choose **Calendar Feed** in the calendar's right sidebar.
3. Copy the full link.
4. In Vector, choose **Connect bCourses** or **Connections**, paste it, and connect.

The server checks the feed before saving it. Only HTTPS URLs on `bcourses.berkeley.edu`, in the official `/feeds/calendars/user_…ics` path, are accepted. Redirects and other hosts are rejected. The private URL stays server-side and is omitted from state, assistant responses and workspace exports.

The feed contains dated assignments and course events, up to Canvas's feed limits. It does not contain undated assignments, Canvas To Do items, grades or submission status. A due date does not establish that work is unsubmitted. Open the actual bCourses item to submit or confirm its instructions.

The feed refreshes when its saved copy is more than 30 minutes old and the dashboard is open, on an explicit Refresh, and as part of the morning update. Failed refreshes retain old items with a warning. A new connection must pass validation before replacing a working feed. Disconnect removes both its saved URL and imported items.

## Google Calendar and Gmail

Calendar authenticates as **huiv@berkeley.edu** and combines its primary calendar with readable calendars checked in that account’s Google Calendar. Events retain their calendar name and color. Connections lists discovered calendars. Other Google account authorizations are rejected. Existing calendar grants require one Reconnect to approve read-only calendar-list discovery.

Inbox has three independent tabs:

- **Main** — victorhui94@gmail.com
- **Berk** — huiv@berkeley.edu
- **Cal Hacks** — vhui@hackberkeley.org

Each email is tagged with its verified mailbox account. Messages, counts, detail views, Gmail links, assistant requests and source timestamps stay scoped to that tab. A message addressed to Berkeley inside the personal inbox is still a Main message; recipient addresses do not establish account ownership. Older verified Main snapshots are retained.

The `/api/automation` import accepts `inboxes`, with an `account`, `status`, `updatedAt` and `emails` array per mailbox. An empty successful array clears only that mailbox. Omit `emails` on failed reads to preserve its saved messages; its error status and prior timestamp remain visible. Provider IDs are namespaced by account. Calendar imports require the Berkeley account and a successful source read. Invalid batches are rejected before writes.

Direct Google connections are available in **Connections**. See [GOOGLE_SETUP.md](GOOGLE_SETUP.md) to configure a Google Cloud OAuth client and server secrets. Each inbox and Berkeley Calendar authorizes separately with an exact account check; Calendar remains read-only and Gmail requests `gmail.modify` to support explicit Trash actions. A successful connection imports immediately; direct connections refresh every five minutes while the dashboard is visible. Tokens stay encrypted server-side and are excluded from dashboard state and exports.

ChatGPT snapshot imports remain supported independently. Connecting an account in ChatGPT does not populate the local database automatically. An account without a direct connection or a verified ChatGPT import is labeled **Not imported yet**. Local development data is separate from the hosted Site. No hosted ChatGPT connector has been declared; this direct OAuth implementation uses Google's APIs rather than the Sites connector relay.

## Assistant

The Vector expands into an inline conversation while other widgets become compact summaries. It can search saved email, calendar and bCourses information, prepare editable dashboard task drafts, and complete existing tasks. Exam answers use actual matching source items; study-task dates are not used as exam dates. Broader requests continue in a separate ChatGPT tab through a copyable prepared prompt. No embedded generative model is configured.

The private Vector ChatGPT tools are available through the platform-managed connection. Read context includes bCourses snapshots but never the feed URL. Personal tasks and notes remain stored and accessible in the interface even though the main navigation has been narrowed to the four main views.

## Files

- `components/life/Dashboard.tsx`: main views and connection forms.
- `components/life/dashboard.css`: interface layout, colors and responsive rules.
- `components/life/CoreChat.tsx`, `core-chat.css`: assistant conversation and handoff.
- `lib/canvas.ts`: strict URL validation, ICS parsing and Pacific due-date helpers.
- `lib/canvas-store.ts`: private configuration, verified connection and refresh behavior.
- `app/api/canvas/route.ts`: feed setup, refresh and disconnect.
- `lib/google-sync.ts`: Berkeley calendar restriction and per-account mailbox import validation.
- `scripts/test-google-sync.mjs`: SQLite tests for mailbox isolation, legacy snapshots and partial refreshes.
- `lib/weather.ts`, `lib/weather-nws.ts`, `app/api/weather/route.ts`: forecast parsing, provider request and cache.
- `app/mcp/route.ts`: private dashboard tools for ChatGPT.
- `scripts/test-core.mjs`, `scripts/test-integrations.mjs`: routing, grounding, feed validation and parser checks.

No database migration is required. These features use the existing D1 `life_records` table. Keep the hosted Site owner-private; the shared records rely on its access policy. Runtime integration data and cached forecasts are not included in the source ZIP.

## Design and technical references

- Amie: https://amie.so/art — calendar, inbox and tasks in a familiar daily view.
- Sunsama: https://www.sunsama.com/features/daily-planning-and-shutdown — daily planning and useful hierarchy.
- Linear: https://linear.app/now/how-we-redesigned-the-linear-ui — restrained navigation, alignment and density.
- Canvas calendar feed: https://community.instructure.com/en/kb/articles/662804-how-do-i-view-the-calendar-ical-feed-to-import-and-subscribe-to-an-external-calendar
- Berkeley guide: https://berkeley.service-now.com/kb/en/how-do-i-add-my-bcourses-calendar-to-bcal?id=kb_article_view&sysparm_article=KB0010692
- Open-Meteo API: https://open-meteo.com/en/docs

NWS documentation: https://www.weather.gov/documentation/services-web-API

Inbox defaults to Needs attention (unread), alongside All saved, Read, and Hidden. Read/Hide persist only in VECTOR per mailbox/message. Delete prompts before moving one message to Gmail Trash; old read-only grants require reconnection. Failed Trash requests preserve the saved message.

Opening a saved inbox item loads the complete Gmail message on demand after a profile/account check. The reader shows full HTML or plain text, recipient headers, inline images and attachment names; file attachments open in Gmail. Full bodies are excluded from saved state and exports.
