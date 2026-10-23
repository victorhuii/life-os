import { env } from "cloudflare:workers";
import { dayKey, type State } from "./life";
export function database(){if(!env.DB) throw new Error("Database unavailable");return env.DB;}
export async function save(id:string,kind:string,value:unknown){await database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(id,kind,JSON.stringify(value),new Date().toISOString()).run();}
export async function state():Promise<State>{
 const rows=await database().prepare("SELECT id,kind,payload FROM life_records").all<{id:string,kind:string,payload:string}>();
 const out:State={tasks:[],events:[],emails:[],note:"",briefing:null,sources:{},schedule:{enabled:false,time:"07:00",timezone:"America/Los_Angeles"},loadedAt:new Date().toISOString()};
 for(const row of rows.results){const v=JSON.parse(row.payload);if(row.kind==="task")out.tasks.push(v);else if(row.kind==="event")out.events.push(v);else if(row.kind==="mail")out.emails.push(v);else if(row.id==="note")out.note=v;else if(row.id===`briefing:${dayKey()}`)out.briefing=v;else if(row.id==="sources")out.sources=v;else if(row.id==="schedule")out.schedule=v;else if(row.id==="canvas:snapshot")out.coursework=v;}
 if(out.coursework)out.sources.canvas={status:out.coursework.status,updatedAt:out.coursework.updatedAt,message:out.coursework.message};else delete out.sources.canvas;
 out.events.sort((a,b)=>a.start.localeCompare(b.start));out.emails.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));return out;
}
export function response(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
export function sameOrigin(request:Request){return request.headers.get("origin")===new URL(request.url).origin;}
