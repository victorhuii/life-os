# Connect Google directly to Vector

Vector can authorize each Google account independently of ChatGPT's Gmail plugin. These are **data connections**, not a replacement for Vector's existing sign-in. Keep this dashboard owner-private. The account's authorization is bound to the signed-in Vector user.

## 1. Create the Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com/), create or select a project you control.

1. Enable **Gmail API**, **Google Calendar API**, and **Google Tasks API** in the API Library.
2. Open **Google Auth Platform** and configure the app's branding and contact information. Use **External** audience to allow accounts from all three domains. While the app is in Testing, add these test users: `victorhui94@gmail.com`, `huiv@berkeley.edu`, and `vhui@hackberkeley.org`.
3. Configure the requested data access scopes:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/tasks`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
4. Under **Clients**, create an OAuth client of type **Web application**.
5. Add the exact authorized redirect URI for your running app. For local development on port 5173:
   `http://localhost:5173/api/google/callback`
6. Save the client ID and secret in the server environment below. Do not paste the secret into a chat or commit it to Git.

Use the same hostname throughout sign-in. If you use `127.0.0.1` instead of `localhost`, register `http://127.0.0.1:5173/api/google/callback` and set the environment variable to that exact address. If the dev server chooses another port, update both Google and the environment value.

For a hosted deployment, register `https://YOUR-SITE-HOST/api/google/callback` and configure that value in the hosted server environment. This is a custom data authorization callback; do not replace the platform-managed `/callback` route.

## 2. Configure the server

Copy `.dev.vars.example` to `.dev.vars`, which is ignored by Git. Set:

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Your Google Web application client ID |
| `GOOGLE_CLIENT_SECRET` | That client's secret |
| `GOOGLE_REDIRECT_URI` | The exact callback URI registered above |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | A base64-encoded, cryptographically random 32-byte key |

Generate the encryption key once in your own terminal:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Restart `npm run dev` after configuring `.dev.vars`. For hosting, configure these names as server runtime secrets through your hosting provider. Never use `NEXT_PUBLIC_` prefixes. Keep the encryption key stable: losing or changing it makes previously saved connections unreadable. Disconnect accounts before rotating it, then reconnect afterward.

## 3. Authorize each connection

1. Open Vector at the configured address and sign in to Vector.
2. Open **Connections**. Any missing server settings are listed there.
3. Select **Connect Google** for **Main**, choose `victorhui94@gmail.com`, and approve Gmail access, including moving messages to Trash.
4. Repeat for **Berk** (`huiv@berkeley.edu`) and **Cal Hacks** (`vhui@hackberkeley.org`).
5. Connect **Berkeley Calendar**, choosing `huiv@berkeley.edu` and approving Calendar editing and calendar discovery.
6. Connect **Berkeley Google Tasks**, choose `huiv@berkeley.edu`, and approve Google Tasks read/write access. This is separate from Calendar; existing Calendar authorization does not grant Tasks access.

Inbox and Calendar permissions are requested separately. Google may ask you to select an account even if you are already signed in. Vector checks the returned identity against the requested account and rejects mismatches before importing mail or calendar events. Successful authorization imports the first snapshot immediately.

If Google blocks authorization for an organization account, its Workspace administrator may need to allow your OAuth client. Gmail modify access is a restricted scope; Google's verification rules apply when publishing an app for wider use. Testing-mode authorizations can expire, requiring Reconnect; do not treat a testing app as a permanent unattended connection.

## What gets synced

- Each inbox imports received mail from the past 7 days, including Gmail-archived received messages, by following every page token. Sent, Drafts, Spam and Trash are excluded. Each request fetches 25 summaries to stay within provider/runtime budgets; the open app continues until the week is complete, with a resumable cursor and visible import status. This is a page size, not a total message limit. Background refresh does not fetch full MIME bodies. Opening a message loads its complete body and headers directly from the verified Gmail account, including inline CID images. Bodies stay in browser memory, not dashboard records or exports. Other attachments open in Gmail. Needs attention shows unread messages unless locally moved to Read or Hidden. The Read and Hidden controls change VECTOR only, and survive refreshes separately per account. Reading through this integration does not mark messages as read.
- Calendar authenticates only as `huiv@berkeley.edu`. It discovers readable, non-hidden calendars in that account and combines the primary calendar with calendars checked in Google Calendar. It imports from seven days before today's UTC date through the following 38 days, up to 500 events across at most 30 selected calendars. Calendar discovery and events are paginated with a bounded request budget; the saved source message reports any import limit. Recurring events are expanded, all-day events retain each calendar's time zone, and each event shows its calendar name/color. Hidden, deleted, unchecked secondary, and availability-only calendars are excluded. Calendar selection in Vector follows Google Calendar; check/uncheck calendars there, then refresh here. If any selected calendar cannot be read, the entire last successful snapshot is preserved.
- Connected accounts refresh every five minutes while Vector is visible. A **Refresh** button triggers an earlier refresh, limited to once per 30 seconds. There is no direct-Google background job while the dashboard is closed.
- A failed refresh preserves the last successful snapshot and timestamp. Other inboxes, tasks and bCourses data remain separate.
- **Disconnect** removes that resource's credentials from Vector and stops its direct syncing. It retains imported records. It does not revoke the Google app's entire authorization, which could affect other resource connections. You can revoke it separately in your Google account's third-party access settings.

## Storage and validation

Access and refresh tokens are encrypted with AES-GCM using the server key, stored in private D1 records, and omitted from dashboard state, assistant context, exports and browser responses. OAuth uses single-use expiring state, a browser-bound HttpOnly cookie, PKCE, and the Vector user identity. Account management requires a signed-in user and same-origin requests. No new database migration is required.

Run `node scripts/test-google-oauth.mjs` for isolated tests against mocked Google responses and an in-memory database. Actual Google sign-in must also be tested after configuring your OAuth client; automated tests do not claim a live Google authorization.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

Connected accounts show **Connected directly**, the last import time and record count, with **Refresh** and **Disconnect** controls. **Reconnect** appears when Google authorization expires. The last sign-in result remains visible in Connections, including after a failed callback.

Existing Calendar connections need one **Reconnect** to grant `calendar.calendarlist.readonly` for discovery. Add that scope under Google Auth Platform → Data Access if it is not listed. Existing read-only Gmail connections keep syncing. To enable Delete, add `https://www.googleapis.com/auth/gmail.modify` under Google Auth Platform → Data Access, then choose **Enable Gmail delete** for each inbox in VECTOR Connections and approve Google consent. Delete requires explicit confirmation and moves one message to Gmail Trash; it does not permanently delete it. The server verifies the account identity before any Gmail message action.

Gmail Trash API: [Google messages.trash reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/trash).

The full-message reader uses Gmail `messages.get?format=full`, decodes nested MIME/charset data, and supports HTML or plain text. Existing `gmail.readonly` or `gmail.modify` consent works. Remote images load only when requested; email HTML is sanitized and rendered in an isolated sandbox with scripts, forms, and network connections blocked. It does not mark the Gmail message read.

## Calendar week view and editing

Calendar has Day and Week views. Week opens the enlarged widget and shows all seven days with events and dated VECTOR tasks; undated open tasks have a separate section. Times use America/Los_Angeles. Past events remain hidden by default; Show past / hidden restores them locally. Hide on a task affects only its calendar presentation in this browser. Task checkboxes and task deletion update VECTOR.

Creating or deleting Google events requires `calendar.events`, in addition to calendar discovery. Add that scope under Google Auth Platform → Data Access, then use **Enable calendar editing** in Connections (or the calendar event dialog) and authorize `huiv@berkeley.edu`. Existing read-only grants continue to sync. Refresh once to load writable-calendar metadata and provider event IDs for older saved events. New events can target an included calendar with write access. All-day forms use an inclusive last day, converted to Google's exclusive end date. Delete confirms the calendar and removes only the selected occurrence of a recurring event, notifying guests where applicable. Server authorization checks the owner grant, selected calendar access role, and saved event identity; it never accepts arbitrary client event/calendar IDs for deletion. Writes update the saved view; stale reads cannot overwrite edits. No real events are created or deleted during automated QA.

## Weekly mail and Archive

Past week is a rolling seven-day view. Older saved summaries move into VECTOR’s Archive view automatically by date; this never calls Gmail’s archive/delete/label APIs. Archive → Load older mail fetches another 25 older received messages using an independent cursor per account. Its Refresh button restarts from the newest older mail if you want to revisit that range. Weekly sync and older-mail imports merge by mailbox + Gmail ID, preserving existing summaries and reviewed labels; only a fully completed weekly provider read reconciles missing messages inside its exact time window. Failed or partial reads preserve the last saved data. Manual refresh can restart the weekly window, while automatic continuation resumes partial imports.

Inbox, Groups and Mail Lab show 50 rows at a time with Show more; all saved messages in the chosen range remain accessible. Mail Lab has the same Past week / Archive range choice. Personal training uses every saved confirmed example for that mailbox, including Archive, rather than the visible rows or current date filter. The existing 1,000-example lab storage limit remains separate from importing all weekly emails.

## Two-way Google Tasks

Tasks with checkboxes in Google Calendar belong to Google Tasks, a separate Google API. Enable that API and authorize **Connections → Berkeley Google Tasks**. The existing OAuth client and encryption key are reused; existing Gmail/Calendar grants stay separate.

All Google task lists are imported with complete pagination, including completed/hidden tasks. New tasks created here default to today's Berkeley date (the date picker can change it) and go into a **V.E.C.T.O.R.** Google task list, created when needed. Existing open local tasks join the connection too. Linked task names, due dates, completion/reopening, and deletions sync both ways. Urgency, category, and estimated minutes stay local; shopping lists stay separate. Google Tasks' API exposes the due date but not a due time, so time-of-day is not synchronized.

Local changes are saved with a durable outbox and attempted immediately. Provider failures preserve local changes and retry on refresh. Missing/removed Google tasks are reconciled only after every list/page was read successfully. Stable references recover an uncertain successful create without duplicating it. Explicit dirty fields preserve unrelated Google edits; provider ETags protect writes against concurrent changes. Tasks refresh on load, focus and every minute while the app is visible. This does not provide unattended sync while the app is closed. Disconnecting preserves saved tasks and stops Google access.

Validation: `node scripts/test-google-tasks.mjs`, existing OAuth/Calendar tests, task UI tests, typecheck and production build. Provider write tests use synthetic fixtures, never real Google tasks.

References: [Google Tasks API](https://developers.google.com/workspace/tasks/reference/rest), [task fields and due-date limitations](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks).
