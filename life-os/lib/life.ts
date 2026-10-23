import { z } from "zod";
export const timezone = "America/Los_Angeles";
export const dayKey = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {timeZone: timezone, year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
export const taskSchema = z.object({id:z.string().max(100),title:z.string().trim().min(1).max(240),done:z.boolean(),priority:z.enum(["high","normal","low"]),category:z.enum(["Personal","Work","School"]),due:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(`${value}T12:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;},"Use a valid calendar date").or(z.literal("")),minutes:z.number().int().min(5).max(480)});
export const eventSchema = z.object({id:z.string().max(200),title:z.string().min(1).max(240),start:z.string().datetime({offset:true}),end:z.string().datetime({offset:true}),location:z.string().max(300).default(""),source:z.enum(["Google Calendar","Manual"]),url:z.string().url().max(2000).optional(),allDay:z.boolean().optional()}).refine(e=>new Date(e.end)>new Date(e.start),"End must follow start");
export const mailSchema = z.object({id:z.string().max(200),sender:z.string().max(240),subject:z.string().max(400),summary:z.string().max(1000),receivedAt:z.string().datetime({offset:true}),url:z.string().url().max(2000),priority:z.enum(["high","normal"])});
export type Task=z.infer<typeof taskSchema>;
export type LifeEvent=z.infer<typeof eventSchema>;
export function eventOnDay(event:LifeEvent,day:string){return dayKey(new Date(event.start))<=day&&dayKey(new Date(new Date(event.end).getTime()-1))>=day;}
export type Mail=z.infer<typeof mailSchema>;
export type Source={status:"not_connected"|"synced"|"error",updatedAt?:string,message?:string};
export type Briefing={day:string,title:string,summary:string,priorities:string[],headsUp:string[],generatedAt:string,mode:"scheduled"|"manual"};
export type CourseItem={id:string,title:string,course:string,due:string,allDay:boolean,url?:string,kind:"assignment"|"event"};
export type Coursework={connected:boolean,status:"not_connected"|"synced"|"error",items:CourseItem[],updatedAt?:string,message?:string};
export type State={tasks:Task[],events:LifeEvent[],emails:Mail[],note:string,briefing:Briefing|null,sources:Record<string,Source>,schedule:{enabled:boolean,time:string,timezone:string},loadedAt:string,coursework?:Coursework};
export function safeUrl(value:string){try{const u=new URL(value);return u.protocol==="https:"||u.protocol==="http:"?u.href:"#";}catch{return "#";}}
export function overview(tasks:Task[],events:LifeEvent[],day=dayKey()){
 const open=tasks.filter(t=>!t.done).sort((a,b)=>(a.priority==="high"?-1:1)-(b.priority==="high"?-1:1)||a.due.localeCompare(b.due));
 const due=open.filter(t=>t.due&&t.due<=day); const today=events.filter(e=>eventOnDay(e,day));
 return {open,due,today,summary:open.length?`You have ${open.length} open ${open.length===1?"task":"tasks"}${due.length?`, with ${due.length} due today or overdue`:""}. ${today.length?`${today.length} ${today.length===1?"event is":"events are"} on your agenda.`:"There are no saved events for today."}`:"Start with one thing that matters today. Add a priority below, then make a little room for it."};
}
