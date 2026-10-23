import {calendarAccount,dayKey,taskSchema,type Task} from "./life";
import {database,save} from "./store";
import {GoogleConnectionError,googleAccessToken,googleJson,readGoogleGrant,tasksScope,type GoogleGrant} from "./google-oauth";

const base="https://tasks.googleapis.com/tasks/v1";
const listTitle="V.E.C.T.O.R.";
type RemoteTask={id:string;title?:string;due?:string;status?:string;updated?:string;etag?:string;notes?:string;deleted?:boolean};
type TaskList={id:string;title:string};
export type TasksSnapshot={lists:TaskList[];items:{list:TaskList;task:RemoteTask}[]};
type Link={localId:string;listId:string;taskId:string;listName:string;lastSynced?:{title:string;due:string;done:boolean}};
type Pending={fields?:Record<string,boolean>;deleted?:boolean;version:string};
const remoteFields=(task:RemoteTask)=>({title:(task.title||"Untitled task").slice(0,240),due:task.due?.slice(0,10)||"",done:task.status==="completed"});
const linkId=(id:string)=>`google-task-link:${id}`;
const pendingId=(id:string)=>`google-task-pending:${id}`;
const read=async<T>(id:string)=>{const row=await database().prepare("SELECT payload FROM life_records WHERE id=?").bind(id).first<{payload:string}>();return row?JSON.parse(row.payload) as T:null;};
const local=async(id:string)=>read<Task>(`task:${id}`);
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const reference=async(id:string)=>`V.E.C.T.O.R. task reference: ${await hash('vector-google-tasks-v1:'+id)}`;
const headersFor=async(grant:GoogleGrant)=>{
 if(grant.resource!=="tasks"||grant.account!==calendarAccount||!grant.scopes.includes(tasksScope))throw new GoogleConnectionError("Connect Berkeley Google Tasks in Connections.",409,true);
 return {Authorization:`Bearer ${await googleAccessToken(grant)}`};
};
/** Full pages are required before reconciling removals. An incomplete read changes nothing locally. */
export async function readGoogleTasks(grant:GoogleGrant):Promise<TasksSnapshot>{
 const headers=await headersFor(grant),lists:TaskList[]=[],items:TasksSnapshot['items']=[];
 let pageToken:string|undefined,calls=0;
 do{
  if(++calls>25)throw new GoogleConnectionError("Your task lists need more pages than one sync can read. Saved tasks are preserved.",409);
  const params=new URLSearchParams({maxResults:'100'});if(pageToken)params.set('pageToken',pageToken);
  const result=await googleJson<{items?:TaskList[];nextPageToken?:string}>(`${base}/users/@me/lists?${params}`,{headers});
  lists.push(...result.items||[]);pageToken=result.nextPageToken;
 }while(pageToken);
 for(const list of lists){
  pageToken=undefined;
  do{
   if(++calls>25)throw new GoogleConnectionError("Your task lists need more pages than one sync can read. Saved tasks are preserved.",409);
   const params=new URLSearchParams({maxResults:'100',showCompleted:'true',showHidden:'true',showDeleted:'true',showAssigned:'true'});if(pageToken)params.set('pageToken',pageToken);
   const result=await googleJson<{items?:RemoteTask[];nextPageToken?:string}>(`${base}/lists/${encodeURIComponent(list.id)}/tasks?${params}`,{headers});
   for(const task of result.items||[])items.push({list,task});pageToken=result.nextPageToken;
  }while(pageToken);
 }
 return {lists,items};
}
async function source(status:'synced'|'error',message:string,requiresReconnect=false){
 await database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES ('sources','sources',?,?) ON CONFLICT(id) DO UPDATE SET payload=json_patch(life_records.payload,excluded.payload),updated_at=excluded.updated_at").bind(JSON.stringify({tasks:{account:calendarAccount,status,message,requiresReconnect,...(status==='synced'?{updatedAt:new Date().toISOString()}:{})}}),new Date().toISOString()).run();
}
async function queueStatement(id:string,fields:Record<string,boolean>,deleted=false){
 return database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'google_task_pending',?,?) ON CONFLICT(id) DO UPDATE SET payload=json_patch(life_records.payload,excluded.payload),updated_at=excluded.updated_at").bind(pendingId(id),JSON.stringify({fields,deleted,version:crypto.randomUUID()}),new Date().toISOString());
}
export async function saveTaskWithGoogle(task:Task,previous:Task|null,owner:string){
 const fields=Object.fromEntries((['title','due','done'] as const).filter(field=>!previous||task[field]!==previous[field]).map(field=>[field,true]));
 const ops=[database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'task',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(`task:${task.id}`,JSON.stringify(task),new Date().toISOString())];
 if(Object.keys(fields).length)ops.push(await queueStatement(task.id,fields));
 await database().batch(ops);
 if(!Object.keys(fields).length)return {ok:true};
 try{const result=await syncGoogleTasks(owner,true);return {ok:true,...(result.error?{syncWarning:`Saved here. ${result.error}`}:{})};}catch{return {ok:true,syncWarning:'Saved here. Google Tasks sync will retry.'};}
}
export async function deleteTaskWithGoogle(id:string,owner:string){
 await database().batch([database().prepare("DELETE FROM life_records WHERE id=? AND kind='task'").bind(`task:${id}`),await queueStatement(id,{},true)]);
 try{const result=await syncGoogleTasks(owner,true);return {ok:true,...(result.error?{syncWarning:`Removed here. ${result.error}`}:{})};}catch{return {ok:true,syncWarning:'Removed here. Google Tasks sync will retry.'};}
}
export async function syncGoogleTasks(owner:string,force=false):Promise<{resource:"tasks";account:typeof calendarAccount;connected:boolean;skipped?:boolean;count?:number;pending?:number;error?:string}>{
 const target={resource:'tasks',account:calendarAccount} as const,grant=await readGoogleGrant(target,owner);
 if(!grant)return {...target,connected:false};
 const db=database(),token=crypto.randomUUID(),now=new Date().toISOString();
 const lock=await db.prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES ('google:tasks-lock','google_task_lock',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE updated_at < ? RETURNING id").bind(JSON.stringify(token),now,new Date(Date.now()-180000).toISOString()).first();
 if(!lock)return {...target,connected:true,skipped:true};
 try{
  const attempt=await read<{at:number}>('google:tasks-last');if(!force&&attempt&&Date.now()-attempt.at<60000)return {...target,connected:true,skipped:true};
  const started=Date.now(),snapshot=await readGoogleTasks(grant),headers=await headersFor(grant);
  if(Date.now()-started>100000)throw new GoogleConnectionError("Task sync timed out before saving. Your tasks are preserved.",503);
  const rows=await db.prepare("SELECT id,kind,payload FROM life_records WHERE kind IN ('task','google_task_link','google_task_pending')").all<{id:string;kind:string;payload:string}>();
  const links=new Map<string,Link>(rows.results.filter(row=>row.kind==='google_task_link').map(row=>{const link=JSON.parse(row.payload) as Link;return [link.localId,link];}));
  const pending=new Map<string,Pending>(rows.results.filter(row=>row.kind==='google_task_pending').map(row=>[row.id.slice('google-task-pending:'.length),JSON.parse(row.payload)]));
  // Changes made by the assistant or another task view also join the same outbox.
  for(const row of rows.results.filter(row=>row.kind==='task')){const task=JSON.parse(row.payload) as Task,link=links.get(task.id);if(link?.lastSynced&&!pending.has(task.id)){const fields=Object.fromEntries((['title','due','done'] as const).filter(field=>task[field]!==link.lastSynced![field]).map(field=>[field,true]));if(Object.keys(fields).length){const statement=await queueStatement(task.id,fields);await statement.run();pending.set(task.id,(await read<Pending>(pendingId(task.id)))!);}}}
  // Existing open local tasks join the connection on first authorization as well.
  for(const row of rows.results.filter(row=>row.kind==='task')){const task=JSON.parse(row.payload) as Task;if(!task.done&&!links.has(task.id)&&!pending.has(task.id)){const value={fields:{title:true,due:true,done:true},version:crypto.randomUUID()};await save(pendingId(task.id),'google_task_pending',value);pending.set(task.id,value);}}
  const byRemote=new Map([...links.values()].map(link=>[`${link.listId}:${link.taskId}`,link]));
  const markers=new Map<string,string>();for(const [id,job]of pending)if(!links.has(id)&&!job.deleted)markers.set(await reference(id),id);
  const seen=new Set<string>();
  for(const {list,task:remote}of snapshot.items){
   let link=byRemote.get(`${list.id}:${remote.id}`);
   const marker=remote.notes?.split('\n').find(line=>markers.has(line));
   const id=link?.localId||(marker?markers.get(marker)!:`gtask:${await hash(JSON.stringify([list.id,remote.id]))}`);
   seen.add(id);
   const previous=await local(id),job=await read<Pending>(pendingId(id));
   if(remote.deleted){if(link){await db.batch([db.prepare("DELETE FROM life_records WHERE id=? AND kind='task'").bind(`task:${id}`),db.prepare("DELETE FROM life_records WHERE id=?").bind(pendingId(id)),db.prepare("DELETE FROM life_records WHERE id=?").bind(linkId(id))]);}continue;}
   link={localId:id,listId:list.id,taskId:remote.id,listName:list.title,lastSynced:remoteFields(remote)};links.set(id,link);await save(linkId(id),'google_task_link',link);
   if(job?.deleted)continue;
   const value=taskSchema.parse({id,title:(job?.fields?.title&&previous?previous.title:remote.title||'Untitled task').slice(0,240),done:job?.fields?.done&&previous?previous.done:remote.status==='completed',due:job?.fields?.due&&previous?previous.due:remote.due?.slice(0,10)||'',createdAt:previous?.createdAt||new Date().toISOString(),priority:previous?.priority||'normal',category:previous?.category||'Personal',minutes:previous?.minutes||30});
   if(previous)await db.prepare("UPDATE life_records SET payload=?,updated_at=? WHERE id=? AND kind='task' AND payload=?").bind(JSON.stringify(value),now,`task:${id}`,JSON.stringify(previous)).run();
   else await db.prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'task',?,?) ON CONFLICT(id) DO NOTHING").bind(`task:${id}`,JSON.stringify(value),now).run();
  }
  // Missing tasks/lists are removed only after all provider pages succeeded.
  for(const [id,link]of links){if(!seen.has(id)){await db.batch([db.prepare("DELETE FROM life_records WHERE id=? AND kind='task'").bind(`task:${id}`),db.prepare("DELETE FROM life_records WHERE id=?").bind(linkId(id)),db.prepare("DELETE FROM life_records WHERE id=?").bind(pendingId(id))]);links.delete(id);}}
  let destination=snapshot.lists.find(list=>list.title===listTitle),writes=0;
  const queued=await db.prepare("SELECT id,payload FROM life_records WHERE kind='google_task_pending' ORDER BY updated_at LIMIT 10").all<{id:string;payload:string}>();
  for(const row of queued.results){
   if(Date.now()-started>100000)throw new GoogleConnectionError('Task sync will continue on the next refresh.',503);
   const id=row.id.slice('google-task-pending:'.length),job=JSON.parse(row.payload) as Pending,task=await local(id);let link=links.get(id);
   if(job.deleted){if(link){try{await googleJson(`${base}/lists/${encodeURIComponent(link.listId)}/tasks/${encodeURIComponent(link.taskId)}`,{method:'DELETE',headers});}catch(error){if(!(error instanceof GoogleConnectionError)||![404,410].includes(error.providerStatus||0))throw error;}await db.prepare("DELETE FROM life_records WHERE id=?").bind(linkId(id)).run();}}
   else if(task){
    const body:Record<string,unknown>={};if(job.fields?.title)body.title=task.title;if(job.fields?.done){body.status=task.done?'completed':'needsAction';if(!task.done)body.completed=null;}if(job.fields?.due)body.due=task.due?`${task.due}T00:00:00.000Z`:null;
    let remote:RemoteTask;
    if(link){const known=snapshot.items.find(item=>item.list.id===link!.listId&&item.task.id===link!.taskId)?.task;remote=await googleJson(`${base}/lists/${encodeURIComponent(link.listId)}/tasks/${encodeURIComponent(link.taskId)}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json',...(known?.etag?{'If-Match':known.etag}:{})},body:JSON.stringify(body)});}
    else{
     if(!destination){destination=await googleJson<TaskList>(`${base}/users/@me/lists`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({title:listTitle})});}
     remote=await googleJson(`${base}/lists/${encodeURIComponent(destination.id)}/tasks`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({title:task.title,status:task.done?'completed':'needsAction',due:`${task.due||dayKey(task.createdAt?new Date(task.createdAt):new Date())}T00:00:00.000Z`,notes:await reference(id)})});
     link={localId:id,listId:destination.id,taskId:remote.id,listName:destination.title,lastSynced:remoteFields(remote)};await save(linkId(id),'google_task_link',link);
     if(!task.due)await db.prepare("UPDATE life_records SET payload=?,updated_at=? WHERE id=? AND kind='task' AND payload=?").bind(JSON.stringify({...task,due:remote.due?.slice(0,10)||dayKey()}),new Date().toISOString(),`task:${id}`,JSON.stringify(task)).run();
    }
    if(link)await save(linkId(id),"google_task_link",{...link,lastSynced:remoteFields(remote)});
    writes++;
   }
   await db.prepare("DELETE FROM life_records WHERE id=? AND kind='google_task_pending' AND payload=?").bind(row.id,row.payload).run();
  }
  const remaining=await db.prepare("SELECT COUNT(*) AS count FROM life_records WHERE kind='google_task_pending'").first<{count:number}>();
  const message=remaining?.count?`${remaining.count} tasks waiting to sync.`:'Tasks synced both ways.';
  await source('synced',message);await save('google:tasks-last','google_task_control',{at:Date.now()});
  return {...target,connected:true,count:snapshot.items.filter(item=>!item.task.deleted).length+writes,pending:remaining?.count||0};
 }catch(error){const message=error instanceof GoogleConnectionError?error.message:'Couldn’t sync Google Tasks. Saved tasks are preserved.';await source('error',message,error instanceof GoogleConnectionError&&error.requiresReconnect);return {...target,connected:true,error:message};}
 finally{await db.prepare("DELETE FROM life_records WHERE id='google:tasks-lock' AND payload=?").bind(JSON.stringify(token)).run();}
}
