import { env } from "cloudflare:workers";
import { calendarAccount, dayKey, mailAccount, type State } from "./life";
export function database(){if(!env.DB) throw new Error("Database unavailable");return env.DB;}
export async function save(id:string,kind:string,value:unknown){await database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(id,kind,JSON.stringify(value),new Date().toISOString()).run();}
export async function state():Promise<State>{
 const rows=await database().prepare("SELECT id,kind,payload,updated_at FROM life_records WHERE kind NOT IN ('job_source','job_mark','job_control','job_index','mail_label','mail_prediction','mail_model','mail_control','mail_import_lock','mail_attention','google_task_link','google_task_pending','google_task_lock','google_task_control')").all<{id:string,kind:string,payload:string,updated_at:string}>();
 const out:State={shoppingItems:[],commands:[],tasks:[],events:[],emails:[],note:"",briefing:null,sources:{},schedule:{enabled:false,time:"07:00",timezone:"America/Los_Angeles"},loadedAt:new Date().toISOString()};
 for(const row of rows.results){const v=JSON.parse(row.payload);if(row.kind==="command")(out.commands ||= []).push(v);else if(row.kind==="shopping_item")(out.shoppingItems ||= []).push({...v,createdAt:v.createdAt||row.updated_at});else if(row.kind==="task")out.tasks.push({...v,createdAt:v.createdAt||row.updated_at});else if(row.kind==="event")out.events.push(v);else if(row.kind==="mail")out.emails.push(v);else if(row.id==="note")out.note=v;else if(row.id===`briefing:${dayKey()}`)out.briefing=v;else if(row.id==="sources")out.sources=v;else if(row.id==="schedule")out.schedule=v;else if(row.id==="canvas:snapshot")out.coursework=v;}
 if(out.coursework)out.sources.canvas={status:out.coursework.status,updatedAt:out.coursework.updatedAt,message:out.coursework.message};else delete out.sources.canvas;
 out.emails=out.emails.flatMap(mail=>{const account=mailAccount(mail,out.sources.gmail);return account ? [{...mail,account}] : [];});
 const preferences=new Map(rows.results.filter(row=>row.kind==="mail_preference").map(row=>[row.id,JSON.parse(row.payload)]));
 out.emails=out.emails.flatMap(mail=>{const preference=preferences.get(`mail-pref:${mail.account}:${mail.id}`);return preference?.trashed ? [] : [{...mail,locallyRead:typeof preference?.read === "boolean" ? preference.read : undefined,hidden:!!preference?.hidden}];});
 out.events=out.events.flatMap(event=>{if(event.source!=="Google Calendar")return [event];const account=event.account||out.sources.calendar?.account;return account===calendarAccount ? [{...event,account}] : [];});
 if(out.sources.calendar?.account!==calendarAccount)out.sources.calendar={status:"not_connected",account:calendarAccount,message:"Berkeley calendar has not synced to V.E.C.T.O.R. yet."};
 const taskLinks=await database().prepare("SELECT payload FROM life_records WHERE kind='google_task_link'").all<{payload:string}>();
 const taskJobs=await database().prepare("SELECT id FROM life_records WHERE kind='google_task_pending'").all<{id:string}>();
 const linkedTasks=new Map(taskLinks.results.map(row=>{const link=JSON.parse(row.payload);return [link.localId,link];})),pendingTasks=new Set(taskJobs.results.map(row=>row.id.slice('google-task-pending:'.length)));
 out.tasks=out.tasks.map(task=>({...task,...(linkedTasks.has(task.id)?{googleTask:{account:calendarAccount,listName:linkedTasks.get(task.id).listName}}:{}),googleSyncPending:pendingTasks.has(task.id)}));
 out.events.sort((a,b)=>a.start.localeCompare(b.start));out.emails.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));return out;
}
export function response(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
export function sameOrigin(request:Request){return request.headers.get("origin")===new URL(request.url).origin;}
