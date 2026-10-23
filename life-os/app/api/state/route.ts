import { z } from "zod";
import { taskSchema, eventSchema } from "@/lib/life";
import { state,save,response,database,sameOrigin } from "@/lib/store";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic="force-dynamic";
// Shared owner-private board. Sites dispatch authenticates every request.
// Do not make this Site public without redesigning its access boundaries.
export async function GET(){try{return response(await state());}catch{return response({error:"Your dashboard could not load. Please try again."},503);}}
export async function POST(request:Request){
 if(!sameOrigin(request)||!await getChatGPTUser())return response({error:"Please sign in to save changes."},403);
 try{
 const b=z.discriminatedUnion("action",[z.object({action:z.literal("task"),value:taskSchema}),z.object({action:z.literal("deleteTask"),id:z.string().max(100)}),z.object({action:z.literal("event"),value:eventSchema}),z.object({action:z.literal("deleteEvent"),id:z.string().max(200)}),z.object({action:z.literal("note"),value:z.string().max(10000)})]).parse(await request.json());
 if(b.action==="task"){const t=taskSchema.parse(b.value);await save(`task:${t.id}`,"task",t);}
 else if(b.action==="deleteTask"){const id=z.string().max(100).parse(b.id);await database().prepare("DELETE FROM life_records WHERE id=? AND kind='task'").bind(`task:${id}`).run();}
 else if(b.action==="event"){const e=eventSchema.parse(b.value);if(e.source!=="Manual")return response({error:"Use the scheduled sync for calendar imports."},400);await save(`event:${e.id}`,"event",e);}
 else if(b.action==="deleteEvent"){const id=z.string().max(200).parse(b.id);await database().prepare("DELETE FROM life_records WHERE id=? AND kind='event'").bind(`event:${id}`).run();}
 else if(b.action==="note")await save("note","note",z.string().max(10000).parse(b.value));
 else return response({error:"Unknown action."},400);
 return response({ok:true});
 }catch{return response({error:"Could not save. Check the fields and try again."},400);}
}
