import { z } from "zod";
export const timezone = "America/Los_Angeles";
export const calendarAccount = "huiv@berkeley.edu";
export const mailboxes = [
 { id: "main", label: "Main", account: "victorhui94@gmail.com" },
 { id: "berk", label: "Berk", account: "huiv@berkeley.edu" },
 { id: "cal-hacks", label: "Cal Hacks", account: "vhui@hackberkeley.org" },
] as const;
export const mailboxAccountSchema = z.enum(["victorhui94@gmail.com", "huiv@berkeley.edu", "vhui@hackberkeley.org"]);
export type MailboxAccount = z.infer<typeof mailboxAccountSchema>;
export const dayKey = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {timeZone: timezone, year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
export const taskSchema = z.object({id:z.string().max(100),title:z.string().trim().min(1).max(240),done:z.boolean(),createdAt:z.string().datetime({offset:true}).optional(),priority:z.enum(["high","normal","low"]),category:z.enum(["Personal","Work","School"]),due:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(`${value}T12:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;},"Use a valid calendar date").or(z.literal("")),minutes:z.number().int().min(5).max(480)});
export const shoppingItemSchema = taskSchema.extend({group:z.enum(["online","clothes","groceries"])});
export type ShoppingItem = z.infer<typeof shoppingItemSchema>;
export const savedCommandSchema = z.object({id:z.string().uuid(),label:z.string().trim().min(1).max(60),prompt:z.string().trim().min(1).max(3000)});
export type SavedCommand = z.infer<typeof savedCommandSchema>;
export const eventSchema = z.object({id:z.string().max(200),title:z.string().min(1).max(240),start:z.string().datetime({offset:true}),end:z.string().datetime({offset:true}),location:z.string().max(300).default(""),source:z.enum(["Google Calendar","Manual"]),url:z.string().url().max(2000).optional(),allDay:z.boolean().optional(),account:z.string().email().optional(),calendarId:z.string().max(1024).optional(),googleEventId:z.string().max(1024).optional(),canEdit:z.boolean().optional(),recurring:z.boolean().optional(),calendarName:z.string().max(240).optional(),calendarColor:z.string().regex(/^#[0-9a-f]{6}$/i).optional()}).refine(e=>new Date(e.end)>new Date(e.start),"End must follow start");
export const mailSchema = z.object({id:z.string().max(200),sender:z.string().max(240),subject:z.string().max(400),summary:z.string().max(1000),receivedAt:z.string().datetime({offset:true}),url:z.string().url().max(2000),priority:z.enum(["high","normal"]),unread:z.boolean().optional(),threadId:z.string().max(200).optional(),gmailLabels:z.array(z.string().max(500)).max(500).optional(),gmailThreadParticipated:z.boolean().optional(),gmailSponsorship:z.boolean().optional(),gmailMetadataVersion:z.number().int().optional(),account:mailboxAccountSchema.optional()});
export type Task=z.infer<typeof taskSchema>&{googleTask?:{account:string;listName:string};googleSyncPending?:boolean};
export type LifeEvent=z.infer<typeof eventSchema>;
export function eventOnDay(event:LifeEvent,day:string){return dayKey(new Date(event.start))<=day&&dayKey(new Date(new Date(event.end).getTime()-1))>=day;}
export type Mail=z.infer<typeof mailSchema> & { unread?: boolean; locallyRead?: boolean; hidden?: boolean };
export type GoogleCalendarInfo={id:string,name:string,color?:string,primary:boolean,enabled:boolean,canEdit?:boolean};
export type MailImportProgress={metadataVersion?:number;startedAt?:string;start:string|null;end:string;loaded:number;complete:boolean;nextPageToken?:string|null};
export type Source={mailSync?:MailImportProgress;mailHistory?:MailImportProgress;status:"not_connected"|"synced"|"error",updatedAt?:string,message?:string,account?:string,requiresReconnect?:boolean,calendars?:GoogleCalendarInfo[]};
export const mailboxSourceKey = (account: MailboxAccount) => `gmail:${account}`;
export function sourceAccount(source?: Source): MailboxAccount | undefined {
 if(source?.account) { const parsed=mailboxAccountSchema.safeParse(source.account.toLowerCase()); return parsed.success ? parsed.data : undefined; }
 const matches=mailboxes.filter(box=>source?.message?.toLowerCase().includes(box.account));
 return matches.length===1 ? matches[0].account : undefined;
}
/** Preserve older verified snapshots without inferring mailbox ownership from recipients. */
export function mailAccount(mail: Mail, legacySource?: Source): MailboxAccount | undefined {
 if(mail.account)return mailboxAccountSchema.safeParse(mail.account).success ? mail.account : undefined;
 try { const url=new URL(mail.url); const account=url.hostname==="mail.google.com" ? url.searchParams.get("authuser") : null; if(account?.includes("@")){const parsed=mailboxAccountSchema.safeParse(account.toLowerCase());return parsed.success ? parsed.data : undefined;} } catch {}
 return sourceAccount(legacySource);
}
export function mailboxSource(sources: Record<string,Source>, account: MailboxAccount): Source {
 return sources[mailboxSourceKey(account)] || (sourceAccount(sources.gmail)===account ? sources.gmail : {status:"not_connected",account});
}
export type Briefing={day:string,title:string,summary:string,priorities:string[],headsUp:string[],generatedAt:string,mode:"scheduled"|"manual"};
export type CourseItem={id:string,title:string,course:string,due:string,allDay:boolean,url?:string,kind:"assignment"|"event"};
export type Coursework={connected:boolean,status:"not_connected"|"synced"|"error",items:CourseItem[],updatedAt?:string,message?:string};
export type State={shoppingItems?:ShoppingItem[],commands?:SavedCommand[],tasks:Task[],events:LifeEvent[],emails:Mail[],note:string,briefing:Briefing|null,sources:Record<string,Source>,schedule:{enabled:boolean,time:string,timezone:string},loadedAt:string,coursework?:Coursework};
export function safeUrl(value:string){try{const u=new URL(value);return u.protocol==="https:"||u.protocol==="http:"?u.href:"#";}catch{return "#";}}
export function overview(tasks:Task[],events:LifeEvent[],day=dayKey()){
 const open=tasks.filter(t=>!t.done).sort((a,b)=>(a.priority==="high"?-1:1)-(b.priority==="high"?-1:1)||a.due.localeCompare(b.due));
 const due=open.filter(t=>t.due&&t.due<=day); const today=events.filter(e=>eventOnDay(e,day));
 return {open,due,today,summary:open.length?`You have ${open.length} open ${open.length===1?"task":"tasks"}${due.length?`, with ${due.length} due today or overdue`:""}. ${today.length?`${today.length} ${today.length===1?"event is":"events are"} on your agenda.`:"There are no saved events for today."}`:"Start with one thing that matters today. Add a priority below, then make a little room for it."};
}
