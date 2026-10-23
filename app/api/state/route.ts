import {saveTaskWithGoogle,deleteTaskWithGoogle} from "@/lib/google-tasks";
import { z } from "zod";
import { dayKey,shoppingItemSchema, taskSchema, eventSchema, savedCommandSchema, mailboxAccountSchema } from "@/lib/life";
import { state,save,response,database,sameOrigin } from "@/lib/store";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic="force-dynamic";
// Shared owner-private board. Sites dispatch authenticates every request.
// Do not make this Site public without redesigning its access boundaries.
export async function GET(){try{return response(await state());}catch{return response({error:"Your dashboard could not load. Please try again."},503);}}
export async function POST(request:Request){
 const user=await getChatGPTUser();
 if(!sameOrigin(request)||!user)return response({error:"Please sign in to save changes."},403);
 try{
 const b=z.discriminatedUnion("action",[z.object({action:z.literal("migrateNote")}),z.object({action:z.literal("mailPreference"),account:mailboxAccountSchema,id:z.string().min(1).max(200),read:z.boolean().optional(),hidden:z.boolean().optional()}),z.object({action:z.literal("saveCommand"),value:savedCommandSchema}),z.object({action:z.literal("deleteCommand"),id:z.string().uuid()}),z.object({action:z.literal("shoppingItem"),value:shoppingItemSchema}),z.object({action:z.literal("task"),value:taskSchema}),z.object({action:z.literal("deleteTask"),id:z.string().max(100)}),z.object({action:z.literal("event"),value:eventSchema}),z.object({action:z.literal("deleteEvent"),id:z.string().max(200)}),z.object({action:z.literal("note"),value:z.string().max(10000),previous:z.string().max(10000).optional()})]).parse(await request.json());
 if(b.action==="migrateNote"){
   const row=await database().prepare("SELECT payload,updated_at FROM life_records WHERE id='note' AND kind='note'").first<{payload:string,updated_at:string}>();
   const note=row ? JSON.parse(row.payload) : "";
   if(typeof note==="string" && note.trim()){
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(note))),byte=>byte.toString(16).padStart(2,"0")).join("");
     const titles=note.split(/\r?\n/).flatMap(line=>Array.from({length:Math.ceil(line.length/240)},(_,i)=>line.slice(i*240,(i+1)*240).trim())).filter(Boolean);
     const ops=titles.map((title,i)=>{const task=taskSchema.parse({id:`note-${hash}-${i}`,title,done:false,priority:"normal",category:"Personal",due:"",minutes:30,createdAt:row!.updated_at});return database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) SELECT ?,'task',?,? WHERE EXISTS(SELECT 1 FROM life_records WHERE id='note' AND payload=?) ON CONFLICT(id) DO NOTHING").bind(`task:${task.id}`,JSON.stringify(task),new Date().toISOString(),row!.payload);});
     ops.push(database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) SELECT 'notepad:archive:'||?,'note_archive',payload,updated_at FROM life_records WHERE id='note' AND payload=? ON CONFLICT(id) DO NOTHING").bind(hash,row!.payload));
     ops.push(database().prepare("UPDATE life_records SET payload='\"\"' WHERE id='note' AND payload=?").bind(row!.payload));
     await database().batch(ops);
   }
 }
 else if(b.action==="mailPreference"){
   const patch={...(b.read!==undefined?{read:b.read}:{}),...(b.hidden!==undefined?{hidden:b.hidden}:{})};
   await database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail_preference',?,?) ON CONFLICT(id) DO UPDATE SET payload=json_patch(life_records.payload,excluded.payload),updated_at=excluded.updated_at").bind(`mail-pref:${b.account}:${b.id}`,JSON.stringify(patch),new Date().toISOString()).run();
 }
 else if(b.action==="saveCommand"){
   const result=await database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) SELECT ?,'command',?,? WHERE EXISTS(SELECT 1 FROM life_records WHERE id=? AND kind='command') OR (SELECT COUNT(*) FROM life_records WHERE kind='command')<20 ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(`command:${b.value.id}`,JSON.stringify(b.value),new Date().toISOString(),`command:${b.value.id}`).run();
   if(!result.meta.changes)return response({error:"You can save up to 20 commands. Remove one to add another."},409);
 }
 else if(b.action==="deleteCommand")await database().prepare("DELETE FROM life_records WHERE id=? AND kind='command'").bind(`command:${b.id}`).run();
 else if(b.action==="shoppingItem"){
   const existing=await database().prepare("SELECT payload,updated_at FROM life_records WHERE id=? AND kind='shopping_item'").bind(`shopping:${b.value.id}`).first<{payload:string,updated_at:string}>();
   const item=shoppingItemSchema.parse({...b.value,createdAt:existing ? JSON.parse(existing.payload).createdAt || existing.updated_at : new Date().toISOString()});
   await save(`shopping:${item.id}`,"shopping_item",item);
 }
 else if(b.action==="task"){
  const existing=await database().prepare("SELECT payload,updated_at FROM life_records WHERE id=? AND kind='task'").bind(`task:${b.value.id}`).first<{payload:string,updated_at:string}>();
  const previous=existing?JSON.parse(existing.payload):null;
  const t=taskSchema.parse({...b.value,due:existing?b.value.due:b.value.due||dayKey(),createdAt:existing?previous.createdAt||existing.updated_at:new Date().toISOString()});
  return response(await saveTaskWithGoogle(t,previous,user.userId));
 }
 else if(b.action==="deleteTask")return response(await deleteTaskWithGoogle(b.id,user.userId));
 else if(b.action==="event"){const e=eventSchema.parse(b.value);if(e.source!=="Manual")return response({error:"Use the scheduled sync for calendar imports."},400);await save(`event:${e.id}`,"event",e);}
 else if(b.action==="deleteEvent"){const id=z.string().max(200).parse(b.id);await database().prepare("DELETE FROM life_records WHERE id=? AND kind='event'").bind(`event:${id}`).run();}
 else if(b.action==="note"){
   if(b.previous===undefined)await save("note","note",b.value);
   else {
     // Compare-and-swap prevents autosave in one tab from overwriting another tab.
     const result=await database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) SELECT 'note','note',?,? WHERE ?='' OR EXISTS(SELECT 1 FROM life_records WHERE id='note') ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE life_records.payload=?").bind(JSON.stringify(b.value),new Date().toISOString(),b.previous,JSON.stringify(b.previous)).run();
     if(!result.meta.changes)return response({error:"Your saved note changed in another window. Your draft is still available."},409);
   }
 }
 else return response({error:"Unknown action."},400);
 return response({ok:true});
 }catch{return response({error:"Could not save. Check the fields and try again."},400);}
}
