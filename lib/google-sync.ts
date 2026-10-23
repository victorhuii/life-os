import { z } from "zod";
import { calendarAccount, eventSchema, mailSchema, mailboxAccountSchema, mailboxSourceKey, sourceAccount, type Source } from "./life";

export const googleSourceSchema = z.object({
  status: z.enum(["not_connected", "synced", "error"]),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  message: z.string().max(500).optional(),
  account: z.string().email().max(320).optional(),
});
export const inboxImportSchema = googleSourceSchema.extend({
  account: mailboxAccountSchema,
  emails: z.array(mailSchema).max(500).optional(),
});
export const googleSyncSchema = z.object({
  events: z.array(eventSchema).max(100).optional(),
  emails: z.array(mailSchema).max(500).optional(),
  inboxes: z.array(inboxImportSchema).max(3).optional(),
  sources: z.record(z.enum(["calendar", "gmail"]), googleSourceSchema).optional(),
});

export class GoogleSyncError extends Error {}

/** Validate the entire import before any saved snapshot can be changed. */
export function prepareGoogleSync(input: z.infer<typeof googleSyncSchema>) {
  const updates: Record<string, Source> = {};
  const inboxes = [...(input.inboxes || [])];
  const calendar = input.sources?.calendar;
  if (calendar) {
    if (calendar.account !== calendarAccount) throw new GoogleSyncError("Calendar imports must use huiv@berkeley.edu only.");
    if (calendar.status === "synced" && !input.events) throw new GoogleSyncError("A successful calendar sync must include the Berkeley events, or an empty list.");
    updates.calendar = calendar;
  }
  if (input.events) {
    if (calendar?.status !== "synced" || !calendar.updatedAt) throw new GoogleSyncError("Calendar events require a verified Berkeley calendar read and timestamp.");
    if (input.events.some(event => event.source !== "Google Calendar" || (event.account && event.account !== calendarAccount))) throw new GoogleSyncError("Calendar events must belong to huiv@berkeley.edu.");
  }
  if (input.emails) {
    const legacy = input.sources?.gmail;
    const account = sourceAccount(legacy);
    if (!legacy || !account) throw new GoogleSyncError("Email imports must identify the verified mailbox account.");
    inboxes.push({ ...legacy, account, emails: input.emails });
  }
  const seen = new Set<string>();
  for (const inbox of inboxes) {
    if (seen.has(inbox.account)) throw new GoogleSyncError("Import each mailbox only once per update.");
    seen.add(inbox.account);
    if (inbox.emails && (inbox.status !== "synced" || !inbox.updatedAt)) throw new GoogleSyncError("Inbox messages require a successful account read and timestamp.");
    if (inbox.status === "synced" && !inbox.emails) throw new GoogleSyncError("A successful inbox sync must include its messages, or an empty list for an empty inbox.");
    if (inbox.emails?.some(mail => mail.account && mail.account !== inbox.account)) throw new GoogleSyncError("An email’s mailbox must match the account being imported.");
    if (inbox.emails?.some(mail => {
      try {
        const url = new URL(mail.url);
        const account = url.searchParams.get("authuser");
        return url.protocol !== "https:" || url.hostname !== "mail.google.com" || (!!account?.includes("@") && account.toLowerCase() !== inbox.account);
      } catch { return true; }
    })) throw new GoogleSyncError("Email links must open Gmail for the mailbox being imported.");
    if (new Set(inbox.emails?.map(mail => mail.id)).size !== (inbox.emails?.length || 0)) throw new GoogleSyncError("Email IDs must be unique within each inbox.");
    const { emails: _emails, ...source } = inbox;
    updates[mailboxSourceKey(inbox.account)] = source;
  }
  // Keep compatibility with older source-only failure notifications.
  if (input.sources?.gmail && !input.emails) {
    const account = sourceAccount(input.sources.gmail);
    if (!account || input.sources.gmail.status === "synced") throw new GoogleSyncError("Specify the mailbox and include messages for a successful sync.");
    updates[mailboxSourceKey(account)] = { ...input.sources.gmail, account };
  }
  return {
    events: input.events?.map(event => ({ ...event, account: calendarAccount })),
    inboxes: inboxes.map(inbox => ({ ...inbox, emails: inbox.emails?.map(mail => ({ ...mail, account: inbox.account })) })),
    sources: updates,
  };
}
