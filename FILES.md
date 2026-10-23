# Project files

Extract this ZIP to `~/Desktop/life-os`. Open that folder in VS Code. README.md has local setup and GitHub commands.

Source/configuration/documentation files. Build output, dependencies, private feed URLs, live snapshots, local databases and credentials are excluded.

```text
life-os/
  .gitignore
  .npmrc
  .openai/hosting.json
  AUTOMATION.md
  CORE.md
  FILES.md
  INTEGRATIONS.md
  README.md
  app/api/automation/route.ts
  app/api/canvas/route.ts
  app/api/core/action/route.ts
  app/api/core/route.ts
  app/api/state/route.ts
  app/api/weather/route.ts
  app/chatgpt-auth.ts
  app/globals.css
  app/layout.tsx
  app/mcp/route.ts
  app/page.tsx
  build/connector-preview-plugin.mjs
  build/connector-preview-worker.mjs
  build/sites-vite-plugin.LICENSE
  build/sites-vite-plugin.ts
  build/sites-worker.ts
  cloudflare-env.d.ts
  components.json
  components/connector-error.tsx
  components/life/AssistantVisual.tsx
  components/life/SavedCommands.tsx
  components/life/saved-commands.css
  components/life/MailReader.tsx
  components/life/mail-reader.css
  components/life/Notepad.tsx
  components/life/notepad.css
  components/life/useOrbMorph.ts
  components/life/orb-motion.css
  components/life/CalendarWorkspace.tsx
  components/life/calendar-workspace.css
  components/life/useCalendarVisibility.ts
  components/life/CoreChat.tsx
  components/life/CoreVisual.tsx
  components/life/Dashboard.tsx
  components/life/core-chat.css
  components/life/dashboard.css
  components/life/focus-dashboard.css
  components/ui/accordion.tsx
  components/ui/alert-dialog.tsx
  components/ui/alert.tsx
  components/ui/aspect-ratio.tsx
  components/ui/attachment.tsx
  components/ui/avatar.tsx
  components/ui/badge.tsx
  components/ui/breadcrumb.tsx
  components/ui/bubble.tsx
  components/ui/button-group.tsx
  components/ui/button.tsx
  components/ui/calendar.tsx
  components/ui/card.tsx
  components/ui/carousel.tsx
  components/ui/chart.tsx
  components/ui/checkbox.tsx
  components/ui/collapsible.tsx
  components/ui/combobox.tsx
  components/ui/command.tsx
  components/ui/context-menu.tsx
  components/ui/dialog.tsx
  components/ui/direction.tsx
  components/ui/drawer.tsx
  components/ui/dropdown-menu.tsx
  components/ui/empty.tsx
  components/ui/field.tsx
  components/ui/form.tsx
  components/ui/hover-card.tsx
  components/ui/input-group.tsx
  components/ui/input-otp.tsx
  components/ui/input.tsx
  components/ui/item.tsx
  components/ui/kbd.tsx
  components/ui/label.tsx
  components/ui/marker.tsx
  components/ui/menubar.tsx
  components/ui/message-scroller.tsx
  components/ui/message.tsx
  components/ui/native-select.tsx
  components/ui/navigation-menu.tsx
  components/ui/pagination.tsx
  components/ui/popover.tsx
  components/ui/progress.tsx
  components/ui/radio-group.tsx
  components/ui/resizable.tsx
  components/ui/scroll-area.tsx
  components/ui/select.tsx
  components/ui/separator.tsx
  components/ui/sheet.tsx
  components/ui/sidebar.tsx
  components/ui/skeleton.tsx
  components/ui/slider.tsx
  components/ui/sonner.tsx
  components/ui/spinner.tsx
  components/ui/switch.tsx
  components/ui/table.tsx
  components/ui/tabs.tsx
  components/ui/textarea.tsx
  components/ui/toggle-group.tsx
  components/ui/toggle.tsx
  components/ui/tooltip.tsx
  db/index.ts
  db/schema.ts
  drizzle.config.ts
  drizzle/0000_sad_kronos.sql
  drizzle/meta/0000_snapshot.json
  drizzle/meta/_journal.json
  eslint.config.mjs
  examples/d1/app/api/notes/route.ts
  examples/d1/db/schema.ts
  hooks/use-mobile.ts
  lib/canvas-store.ts
  lib/canvas.ts
  lib/connector-context.ts
  lib/connector-contract.mts
  lib/connector-errors.mts
  lib/connector-preview.d.ts
  lib/connectors.ts
  lib/core-actions.ts
  lib/core.ts
  lib/google-sync.ts
  lib/calendar-week.ts
  lib/google-calendar-write.ts
  lib/calendar-visibility.ts
  lib/orb-renderer.ts
  lib/life.ts
  lib/store.ts
  lib/utils.ts
  lib/weather-nws.ts
  lib/weather.ts
  next-env.d.ts
  next.config.ts
  package-lock.json
  package.json
  pnpm-workspace.yaml
  postcss.config.mjs
  public/favicon.svg
  public/file.svg
  public/globe.svg
  public/window.svg
  scripts/build-verified.sh
  scripts/connector-preview/connector-preview-session.mjs
  scripts/connector-preview/host-binding.mjs
  scripts/connector-preview/protocol.mjs
  scripts/execution-profile.mjs
  scripts/install-ci.mjs
  scripts/install-ci.sh
  scripts/install-pnpm.sh
  scripts/npm-install.mjs
  scripts/pnpm-install.mjs
  scripts/run-framework.mjs
  scripts/setup-local-db.mjs
  scripts/sites-env.mjs
  scripts/sites-env.sh
  scripts/test-orb-renderer.mjs
  scripts/test-notepad.mjs
  scripts/test-calendar-visibility.mjs
  scripts/test-core.mjs
  scripts/test-integrations.mjs
  scripts/test-google-sync.mjs
  tsconfig.json
  vendor/shadcn-tailwind-4.13.0.LICENSE.md
  vendor/shadcn-tailwind-4.13.0.css
  vite.config.ts
```

Direct Google connections: `lib/google-oauth.ts` handles encrypted grants and OAuth, `lib/google-direct.ts` reads and stores isolated account snapshots, `app/api/google/` exposes connection routes, and `components/life/GoogleConnections.tsx` renders controls. See `GOOGLE_SETUP.md` and `.dev.vars.example` for server setup. `scripts/test-google-oauth.mjs` validates OAuth and direct sync using isolated fixtures.

Jobs: `components/life/JobsWorkspace.tsx` and `jobs.css` render the product. `lib/jobs.ts` normalizes source feeds, `lib/job-sources.ts` seeds monitored boards, and `lib/jobs-store.ts` persists snapshots, marks and refresh state. `app/api/jobs/route.ts` handles authenticated user actions; `app/api/jobs/sync/route.ts` and the hosted `refresh_job_feed` MCP tool provide the public-feed updater behind private Site access. `scripts/test-jobs.mjs` contains isolated behavioral checks. `JOBS.md` documents coverage and operation.

Date and theme: `components/life/DashboardDate.tsx` displays the local date/clock. `components/life/Theme.tsx` and `lib/theme.ts` apply the local 9 PM–8 AM dark-mode schedule before paint, resume it after sleep/timezone changes, and preserve manual choices until the next boundary. `scripts/test-theme.mjs` checks boundaries, DST, initial rendering and preference expiry.

Job verification: `lib/job-matching.ts` reconciles employer identities and date evidence; `lib/job-index.ts` publishes bounded transactional index chunks. `lib/job-companies.ts` and `lib/job-company-catalog.json` classify companies with persistent overrides. `components/life/JobCard.tsx` renders source evidence and independent application/bookmark controls.

Full-message reading: `components/life/MailReader.tsx` renders on-demand Gmail bodies, `lib/mail-message.ts` decodes MIME parts, and `lib/mail-document.ts` prepares sandboxed HTML. `scripts/test-mail-message.mjs` covers full bodies, encoded headers, inline images and attachment-backed content.

Email topic classification: `lib/mail-learning.ts` contains starter/personal training, inference and grouped evaluation. `components/life/useMailClassifier.ts`, `MailGroups.tsx` and `MailLab.tsx` provide the topic and review workflow. `mail-training.worker.ts` and `public/mail-semantic-worker.js` run local training and pinned DeBERTa inference. `/api/mail-classifier` stores labels/models and `/api/mail-model/[...file]` streams allowlisted public weights. See `MAIL_LAB.md`; tests are in `scripts/test-mail-classifier.mjs`.

Weekly mail additions: `lib/google-mail-page.ts` imports and merges bounded, resumable Gmail pages; `lib/mail-range.ts` defines the shared seven-day/Archive split; `components/life/useMailImport.ts` continues pending weekly imports and exposes older-mail loading. Inbox, Groups and Mail Lab paginate displayed rows independently of the full reviewed training dataset.

`lib/job-time.ts` centralizes direct/community polling targets, exact Pacific posting-time display, observed detection delay and the source-posted past-hour filter. Jobs monitors due feeds whenever VECTOR is visible; employer timestamps remain distinct from detection time and date-only evidence.

`lib/cal-hacks-mail.ts` defines verified Gmail-thread participation, exact Sponsorship label/recipient matching, conversation deduplication, and Cal Hacks inbox filters. Gmail imports preserve custom label names and thread metadata; existing Cal Hacks weekly snapshots backfill automatically. Tests are in `scripts/test-google-oauth.mjs`.

Dashboard chat remains in the assistant card when a prompt or saved command is sent. `CoreChat.tsx` shares one conversation between compact and expanded layouts, while `Dashboard.tsx` keeps widget focus separate from chat visibility. Replies scroll inside the card.

`components/life/Summaries.tsx` adds the catch-up product tab; `summaries.css` styles its responsive cards. `useSummaryCheckpoint.ts` freezes the previous successful check for each visit/reload and saves later visible checks locally. First visits show an explicit 24-hour window. `lib/summary.ts` selects verified new emails, seven-day bCourses assignments, and upcoming/ongoing Berkeley events; jobs use `jobDetectedSince` and the validated `/api/jobs?since=...` filter to count all matching company groups without counting initial imports. Tests: `scripts/test-summary.mjs` and `scripts/test-jobs.mjs`. Loading and error boundaries give slow or failed page loads a visible status/retry action.

Summaries time tabs: Now (since the previous check), Last hour, Today and Yesterday use `summaryTimeWindow` / `summarizeTimeWindow` in `lib/summary.ts`. Day boundaries are Pacific civil midnights, including DST. `/api/jobs` validates optional exclusive `until` bounds. `SummaryWeatherHistory.tsx`, `lib/weather-history.ts` and `/api/weather/history` provide cached hourly model data for the selected period, attributed to Open-Meteo. Historical views use retained records rather than frozen past dashboard snapshots.
