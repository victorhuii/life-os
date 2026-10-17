# Victor / Life OS

A Jarvis-inspired personal control center for your daily briefing, priorities, calendar, inbox, notes, search, and focus sessions. The dark navy interface uses cyan accents, an animated particle core, subtle panel entrances and hover feedback. Motion can be paused in the top bar and respects reduced-motion settings. React and TypeScript, with Vinext/Vite, a Cloudflare Worker, and D1.

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
| `components/life/Dashboard.tsx` | The dashboard interface, panels, forms, search, timer, and dialogs |
| `components/life/dashboard.css` | Colors, spacing, fonts, animations, responsive layouts |
| `components/life/CoreVisual.tsx` | Animated particle sphere and orbit rings; pauses offscreen and when the page is hidden |
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

The local app uses an independent local database and starts empty. Add tasks and notes, or choose **Explore a preview** for sample data.

The live Site retains your real saved records, authorized Gmail/primary-calendar data, and its 7:00 AM Pacific cloud schedule. Gmail summaries, account connections, session cookies, API tokens, and database contents are not part of this ZIP or GitHub source.

Pushing this source to GitHub saves code. It does not automatically redeploy the existing Site or transfer its sign-in, app connections, database, or schedule. Changes to the live version can be published through Sites using the same Site identity.

Keep the hosted app owner-private. Its shared dashboard and service writer rely on the private Sites authentication boundary; a separately public deployment needs equivalent server-side authentication before handling real personal data. This is a full-stack Worker application, so GitHub Pages alone is not a hosting target.

The morning update currently includes one authorized Gmail account and its primary calendar. Additional accounts remain excluded until you ask to add them. Muse currently opens as a shortcut; a direct Muse sync has not been configured.

## Personal Core chat

Click the particle core or **Ask Core**. Workspace mode looks up saved information and prepares dashboard tasks with editable confirmation cards. **Connected ChatGPT** prepares a request to copy and send in a separate ChatGPT tab, where your authorized apps can perform live lookups and Google Calendar actions.

Install/connect the **Victor / Life OS** app in ChatGPT to use this project's private dashboard tools. The server exposes read/search, task creation and task completion through `/mcp`; Sites handles the connection. The Core panel does not contain an embedded generative model, and copying a request does not send it automatically. See `CORE.md` for full setup, capabilities and limits.

Additional source: `components/life/CoreChat.tsx`, `core-chat.css`, `lib/core.ts`, `lib/core-actions.ts`, `app/api/core/`, and `app/mcp/route.ts`. Run `node scripts/test-core.mjs` for the assistant routing checks.

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
- https://www.morgen.so/
