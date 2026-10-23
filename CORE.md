# VECTOR assistant

Click the animated **VECTOR** or its chat input. It expands in place while the other dashboard widgets shrink into a compact navigation rail. **All widgets** or Escape restores the overview.

## Workspace mode

This is a bounded assistant for the saved VECTOR workspace, not an embedded generative model. It can:

- Look up saved priorities, agenda, notes and email summaries.
- Find matching exam-related calendar or bCourses feed entries while identifying their source and snapshot time.
- Prepare a dashboard task from requests such as `Add a task to review lecture notes tomorrow`.
- Mark a specific dashboard task complete after you click its confirmation button.

Task drafts can be edited before saving. Creates use a stable request UUID to prevent duplicates when a request is retried. A study task's due date is never presented as a confirmed exam date. The assistant does not infer unseen deadlines.

## Connected ChatGPT

The dashboard chat focuses on saved information and confirmed task changes. The oversized ChatGPT handoff card and Connected apps mode have been removed. Use the small ChatGPT header link to open a separate conversation for broader requests. Calendar’s plus button opens Google Calendar directly; the Google connection remains read-only.

Select the **VECTOR** app in ChatGPT after installing/connecting it. Sites provisions the private app from this project's `/mcp` endpoint. If needed, find it under **Plugins > Personal > Created by you**. Gmail, Google Calendar and Drive keep their own connections and permissions.

Examples:

- “Add an event to my Google Calendar tomorrow from 2–3 PM called Midterm review.”
- “When is my next midterm? Check my course files and show me the source.”
- “Find emails I should reply to and summarize them.”
- “Add a VECTOR task to review those notes.”

Keep Main, Berk and Cal Hacks inboxes separate. Google Calendar uses only huiv@berkeley.edu and its enabled subcalendars. Resolve missing event details or ambiguous people before creating anything. Dashboard tasks and Google Calendar events have distinct destinations.

The ChatGPT conversation runs in a separate tab. Changes to VECTOR tasks appear on the dashboard on Refresh or its periodic reload. Live answers given in ChatGPT stay in that conversation; they are not silently written into the dashboard's briefing.

## Private tools exposed to ChatGPT

- `get_life_os_context`: read saved tasks, notes, briefing and source scope.
- `search_life_os`: search saved tasks, events, email summaries and notes.
- `create_life_os_task`: create a dashboard task with a retry-safe request UUID.
- `set_life_os_task_status`: complete or reopen an existing dashboard task.

Discovery contains no private data. Data-bearing tools require authenticated visitor identity. A Sites service token alone cannot call them. Keep this Site owner-private; shared records also rely on that access boundary.

## Files

- `components/life/CoreChat.tsx` and `core-chat.css`: inline conversation and editable task drafts.
- `lib/core.ts`: grounded lookup and bounded command routing.
- `lib/core-actions.ts`: validated and idempotent dashboard operations.
- `app/api/core/route.ts`: authenticated workspace requests.
- `app/api/core/action/route.ts`: confirmed dashboard changes.
- `app/mcp/route.ts`: stateless private ChatGPT tool server.
- `scripts/test-core.mjs`: routing, date, target and source-grounding checks.

The bounded dashboard assistant requires no model API key. A fully embedded generative assistant with live external tools would require a separately configured model backend and supported, eligible runtime app access. Existing ChatGPT app connections are not automatically available inside a hosted Site.

Official connection documentation: https://learn.chatgpt.com/docs/extend/mcp

See `INTEGRATIONS.md` for bCourses feed setup and current data limitations. The VECTOR ChatGPT read connection was verified during the dashboard redesign.

The conversation stays mounted when another widget expands, so messages and drafts remain available during the current page session. No microphone or background listening is enabled.

## Local calendar visibility

Events automatically disappear from the agenda at their end time. Ongoing events remain, and all-day events stay until their exclusive end at midnight in their calendar’s timezone. The browser checks the next event end and rechecks on focus or visibility changes.

Each event has a local Hide control immediately after its Google Calendar link. Manual hiding persists in this browser under `vector.calendar.hidden.v1`; no calendar records are deleted or changed on the server. Show hidden reveals ended and manually hidden events, and the eye button restores manual hides. Ended events remain available through Show hidden. Visibility choices are independent on each device.

## Tasks

The former notepad is a task list using the same saved personal tasks as the assistant. Add a task inline or expand the widget. Tasks are grouped by their original added date in Pacific time and remain open across days until checked off using the checkbox on the right. Completed tasks are kept in a separate view and can be reopened. Creation timestamps are set by the server and preserved on updates; older tasks use their stored timestamp.

On first load, existing note lines convert to tasks once in an atomic database batch; long lines split at the task title limit. The original note is archived server-side. The legacy note endpoint remains available for older clients. Task mutations require authentication and same-origin requests.

Weather shows a horizontally scrollable hourly forecast directly in the small dashboard widget, with a 3-day toggle. Expanding Weather shows up to 24 hourly periods, including day/night icons, alongside the daily forecast. Both Open-Meteo and NWS provide hourly data; expired hours are excluded.

## Saved commands

The desktop orb grows with the available viewport height, up to 340 px. Tablet and mobile orb sizes remain unchanged. Saved commands sit below it, with an expandable shelf on smaller screens. Name and save a prompt, edit it, run it in the existing assistant, or delete it. Up to 20 commands persist in D1 and appear on your other devices. Saving never runs a prompt; running dashboard task commands still produces a draft that requires confirmation. Save new prefills the editor from the current overview composer.

## Orb motion

Opening VECTOR captures the visible orb and morphs its black surface into the dark chat panel over 1,250 ms, then reveals the chat controls. Transition artwork is repainted at the largest endpoint’s resolution (up to 2× pixel density), rather than enlarging the tiny chat avatar. Particle ripples scale with small canvases to keep the full circle inside its bounds. The particle canvas runs on its own square layer with uniform scaling: it makes one eased turn with a small wind-up and settle, travels to the small chat orb and fades into it. Faint amber arcs counter-rotate around the core; minimizing reverses the same eased turn. It never stretches with the background. Minimizing grows the small core back into the dashboard orb over the same 1,250 ms. This uses the Web Animations API and a shared local vector renderer, with no external scripts or runtime animation dependency. Input and requests are not delayed. Escapes, widget changes, scrolling, resizing and reduced-motion changes clean up the temporary overlay. Reduced motion opens directly and uses a static particle frame.

The particle sphere reacts to hover and opens into a flowing torus during a real assistant request or confirmed task save. Offscreen/hidden-tab rendering pauses. Chat’s welcome and processing indicator reuse the amber identity; decorative canvases are hidden from assistive technology.

Design references: [RareFormLabs Thinking Orbs](https://github.com/RareFormLabs/thinking-orbs) for distinct activity states; [Codrops reveal effects](https://tympanus.net/Tutorials/PageRevealEffects/) and [Awwwards transition examples](https://www.awwwards.com/inspiration/animation-to-get-to-the-content-design-annuale) for shape-led reveals. Implementation and particle artwork are original; no reference source code or assets are bundled.
