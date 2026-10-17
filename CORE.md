# Personal Core assistant

Click the animated core or **Ask Core** in the bottom-right corner.

## Workspace mode

This is a bounded assistant for the saved Life OS workspace, not an embedded generative model. It can:

- Look up saved priorities, agenda, notes and email summaries.
- Find exam-related calendar entries while identifying their source and snapshot time.
- Prepare a dashboard task from requests such as `Add a task to review lecture notes tomorrow`.
- Mark a specific dashboard task complete after you click its confirmation button.

Task drafts can be edited before saving. Creates use a stable request UUID to prevent duplicates when a request is retried. A study task's due date is never presented as a confirmed exam date. The assistant does not infer unseen deadlines.

## Connected ChatGPT

For broader questions or actions across Google Calendar, Gmail or Google Drive, choose **Connected ChatGPT**, write your request, then **Copy & open ChatGPT**. Paste and send the prepared request there. Nothing is sent or executed automatically by the handoff button.

Select the **Victor / Life OS** app in ChatGPT after installing/connecting it. Sites provisions the private app from this project's `/mcp` endpoint. If needed, find it under **Plugins > Personal > Created by you**. Gmail, Google Calendar and Drive keep their own connections and permissions.

Examples:

- “Add an event to my Google Calendar tomorrow from 2–3 PM called Midterm review.”
- “When is my next midterm? Check my course files and show me the source.”
- “Find emails I should reply to and summarize them.”
- “Add a Life OS task to review those notes.”

Use only the email account selected for Life OS and its primary calendar. Other accounts stay excluded until the user asks to add them. Resolve missing event details or ambiguous people before creating anything. Dashboard tasks and Google Calendar events have distinct destinations.

The ChatGPT conversation runs in a separate tab. Changes to Life OS tasks appear on the dashboard on Refresh or its periodic reload. Live answers given in ChatGPT stay in that conversation; they are not silently written into the dashboard's briefing.

## Private tools exposed to ChatGPT

- `get_life_os_context`: read saved tasks, notes, briefing and source scope.
- `search_life_os`: search saved tasks, events, email summaries and notes.
- `create_life_os_task`: create a dashboard task with a retry-safe request UUID.
- `set_life_os_task_status`: complete or reopen an existing dashboard task.

Discovery contains no private data. Data-bearing tools require authenticated visitor identity. A Sites service token alone cannot call them. Keep this Site owner-private; shared records also rely on that access boundary.

## Files

- `components/life/CoreChat.tsx` and `core-chat.css`: drawer, conversation, drafts and handoff.
- `lib/core.ts`: grounded lookup and bounded command routing.
- `lib/core-actions.ts`: validated and idempotent dashboard operations.
- `app/api/core/route.ts`: authenticated workspace requests.
- `app/api/core/action/route.ts`: confirmed dashboard changes.
- `app/mcp/route.ts`: stateless private ChatGPT tool server.
- `scripts/test-core.mjs`: routing, date, target and source-grounding checks.

No model API key is needed for this ChatGPT handoff. A fully embedded generative assistant with live external tools would require a separately configured model backend and supported, eligible runtime app access. Existing ChatGPT app connections are not automatically available inside a hosted Site.

Official connection documentation: https://learn.chatgpt.com/docs/extend/mcp
