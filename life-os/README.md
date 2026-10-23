# Victor / Life OS

An expandable personal dashboard centered on an animated Personal Core. Choose the dark particle orb or the friendly Buddy character. Click weather, calendar, inbox, coursework or the core to expand it; the other widgets shrink into summaries. Chat and email details open inline. React and TypeScript, with Vinext/Vite, a Cloudflare Worker and D1.

Live private dashboard: https://victor-life-os.heartyaspen1.chatgpt.site

## 1. Put the project on your Mac

Extract `life-os-github.zip`. Move its `life-os` folder to your Desktop:

`~/Desktop/life-os`

Open that folder in VS Code: **File > Open Folder > Desktop > life-os**.

The ZIP already contains the complete folder structure. This is a standalone project; your existing portfolio can stay in its current folder.

## 2. Run locally

Install Node.js 22.13 or later. Then open VS Code's terminal in the `life-os` folder:

```bash
cd ~/Desktop/life-os
npm ci
npm run setup
npm run dev
```

`npm run setup` builds the app and applies the local database migrations. It is safe to rerun; already-applied migrations are skipped.

Open **http://localhost:5173**. To enable saving tasks and notes in local development, visit:

**http://localhost:5173/signin-with-chatgpt?return_to=/**

This development-only sign-in creates a simulated local identity. The hosted dashboard uses real ChatGPT authentication.

For later sessions:

```bash
cd ~/Desktop/life-os
npm run dev
```

Stop the server with **Control+C**.

## 3. Upload to GitHub

Create an empty GitHub repository called `life-os`. Leave the GitHub options for an initial README, license, and .gitignore unchecked, since this folder already has the project files.

Run these commands in the project terminal:

```bash
git init
git add .
git commit -m "Add Life OS dashboard"
git branch -M main
```

Replace `YOUR-USERNAME` with your GitHub username before running:

```bash
git remote add origin https://github.com/YOUR-USERNAME/life-os.git
git push -u origin main
```

Future updates:

```bash
git add .
git commit -m "Update Life OS"
git push
```

The included `.gitignore` excludes dependencies, builds, local databases, environment files, and temporary credentials.

## 4. Main files

| File / folder | Purpose |
| --- | --- |
| `components/life/Dashboard.tsx` | Main views, weather, calendar, email, coursework, search and connection forms |
| `components/life/dashboard.css` | Shared panels, forms and dialog styles |
| `components/life/focus-dashboard.css` | Expandable widget layout, core appearance, transitions and responsive rules |
| `components/life/CoreVisual.tsx` | Canvas particle sphere and orbital rings |
| `components/life/AssistantVisual.tsx` | Orb or animated SVG Buddy |
| `app/page.tsx` | Opens the dashboard |
| `app/layout.tsx` | Page title, metadata, global stylesheet |
| `app/globals.css` | Global styles |
| `lib/life.ts` | Types, input validation, Pacific dates, task ordering |
| `lib/store.ts` | Saved cloud/local records |
| `app/api/state/route.ts` | Reads the dashboard; saves tasks, events, notes |
| `app/api/automation/route.ts` | Reads update instructions and accepts generated briefings |
| `app/chatgpt-auth.ts` | Hosted sign-in helpers |
| `db/` and `drizzle/` | Database schema and versioned migrations |
| `scripts/setup-local-db.mjs` | Initializes your local database |
| `build/`, other `scripts/`, and connector helpers | Framework/runtime support; keep these files |
| `public/favicon.svg` | Your V logo favicon |
| `.openai/hosting.json` | Identity and database binding for the existing private Site |
| `FILES.md` | Complete list of every included file |
| `AUTOMATION.md` | Hosted briefing update workflow |

The dashboard lives in `Dashboard.tsx`; this project does not use the old portfolio's `App.jsx` entry point.

## 5. Local copy vs. the live dashboard

The local app uses an independent local database and starts empty. Add personal tasks and notes through the assistant and Connections. Weather is fetched independently. Connect your bCourses feed separately in your local copy if needed.

The live Site retains your real saved records, authorized Gmail/primary-calendar data, and its 7:00 AM Pacific cloud schedule. Gmail summaries, account connections, session cookies, API tokens, and database contents are not part of this ZIP or GitHub source.

Pushing this source to GitHub saves code. It does not automatically redeploy the existing Site or transfer its sign-in, app connections, database, or schedule. Changes to the live version can be published through Sites using the same Site identity.

Keep the hosted app owner-private. Its shared dashboard and service writer rely on the private Sites authentication boundary; a separately public deployment needs equivalent server-side authentication before handling real personal data. This is a full-stack Worker application, so GitHub Pages alone is not a hosting target.

The morning update currently includes one authorized Gmail account and its primary calendar. Additional accounts remain excluded until you ask to add them. Google Calendar and Gmail remain saved snapshots. Reload reads those snapshots; live app actions continue in ChatGPT.

## Weather, coursework and chat

Expand the Weather widget for a forecast or to change location. Berkeley is the default; temperatures are Fahrenheit and times are Pacific. Data is fetched from Open-Meteo with a National Weather Service fallback and cached for 15 minutes. The weather details identify the actual source and whether a value is an observation or a forecast.

For **bCourses**, open **Calendar → Calendar Feed**, copy the full link, then choose **Connect bCourses** in Life OS. The link is verified and saved privately on the server, and is excluded from workspace exports. Your dated assignments and course events refresh every 30 minutes while open and with the morning briefing. Canvas To Do items, undated work, grades and submission status are not included.

Click **Personal Core** or its input to expand chat. Other widgets become compact summaries. Use **All widgets**, the minimize control, or Escape to restore the overview. Orb/Buddy and Pause are below the core; these appearance preferences stay on your device. Messages and drafts remain available as you switch widgets during this page session. Saved-data mode looks up your workspace and bCourses deadlines and prepares editable personal tasks. **Connected apps** prepares a request to copy and send in a separate ChatGPT tab for live lookups and Calendar actions.

The **Victor / Life OS** app exposes the hosted dashboard's private read/search and task tools through `/mcp`. Sites handles its connection. This is a bounded workspace assistant plus a ChatGPT handoff; an embedded generative model is not configured. Copying a request does not send it automatically. Local data and your hosted ChatGPT app's data are separate.

See `INTEGRATIONS.md` for connection setup and freshness details, and `CORE.md` for assistant behavior. Additional source files:

| File | Purpose |
| --- | --- |
| `components/life/CoreChat.tsx`, `core-chat.css` | Assistant conversation, task drafts and ChatGPT handoff |
| `lib/core.ts`, `lib/core-actions.ts` | Grounded workspace answers and validated task actions |
| `lib/canvas.ts`, `lib/canvas-store.ts` | Feed validation, parsing and private configuration |
| `lib/weather.ts`, `lib/weather-nws.ts`, `app/api/weather/route.ts` | Weather API parsing and caching |
| `app/api/canvas/route.ts` | bCourses setup, refresh and disconnect |
| `app/mcp/route.ts` | Private hosted Life OS tools for ChatGPT |

Run `node scripts/test-core.mjs` and `node scripts/test-integrations.mjs` for the focused behavior checks.

## 6. Useful commands

```bash
npm run typecheck
npm run build
npm run db:generate
npm run db:setup
```

After a database schema edit, run `npm run db:generate`, inspect the new migration, then `npm run setup`. Keep already-applied migrations unchanged.

## Design references

- https://linear.app/now/how-we-redesigned-the-linear-ui
- https://amie.so/art
- https://www.sunsama.com/features/daily-planning-and-shutdown
