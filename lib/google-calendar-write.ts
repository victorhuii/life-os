import {z} from "zod";
import {calendarAccount,eventSchema,timezone,type LifeEvent} from "./life";
import {database,state} from "./store";
import {calendarCanEdit,GoogleConnectionError,googleAccessToken,googleJson,readGoogleGrant} from "./google-oauth";

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T12:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===value;});
export const createCalendarSchema=z.object({requestId:z.string().regex(/^[a-f0-9]{32}$/),calendarId:z.string().min(1).max(1024),title:z.string().trim().min(1).max(240),location:z.string().trim().max(300).default(""),allDay:z.boolean(),start:z.string().max(40),end:z.string().max(40)}).superRefine((value,ctx)=>{
 const validate=value.allDay?date:z.string().datetime({offset:true});
 if(!validate.safeParse(value.start).success||!validate.safeParse(value.end).success||!(Date.parse(value.end)>Date.parse(value.start)))ctx.addIssue({code:"custom",message:"Use valid start and end times; end must follow start."});
});
async function access(owner:string){
 const grant=await readGoogleGrant({resource:"calendar",account:calendarAccount},owner);
 if(!grant||!calendarCanEdit(grant.scopes))throw new GoogleConnectionError("Enable calendar editing in Connections, then authorize your Berkeley account.",409,true);
 return {Authorization:`Bearer ${await googleAccessToken(grant)}`};
}
async function writable(calendarId:string,headers:Record<string,string>){
 const calendar=await googleJson<{id:string;summary?:string;accessRole?:string;timeZone?:string; backgroundColor?:string}>(`https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`,{headers});
 if(calendar.id!==calendarId||!["owner","writer","writerWithoutPrivateAccess"].includes(calendar.accessRole||""))throw new GoogleConnectionError("This calendar is read-only. Choose a calendar you can edit.",403);
 return calendar;
}
async function markMutation(){await database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES ('google:calendar-mutation','calendar_mutation','{}',?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at").bind(new Date().toISOString()).run();}
function zonedMidnight(day:string,zone:string){let value=Date.parse(day+"T00:00:00Z"),target=value;const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});for(let i=0;i<3;i++){const p=Object.fromEntries(fmt.formatToParts(value).map(p=>[p.type,p.value]));value+=target-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);}return new Date(value).toISOString();}
export async function createCalendarEvent(raw:unknown,owner:string){
 const parsed=createCalendarSchema.safeParse(raw);if(!parsed.success)throw new GoogleConnectionError(parsed.error.issues[0]?.message||"Check the event details.");
 const input=parsed.data,headers=await access(owner),calendar=await writable(input.calendarId,headers);
 // Client-generated Google event ID makes retrying the same form idempotent.
 const base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`;
 const body={id:input.requestId,summary:input.title,location:input.location,start:input.allDay?{date:input.start}:{dateTime:input.start,timeZone:timezone},end:input.allDay?{date:input.end}:{dateTime:input.end,timeZone:timezone}};
 await markMutation();
 // Check only the exact caller-generated ID after an uncertain prior attempt.
 const claimId=`calendar:create:${input.requestId}`;
 const claim=await database().prepare("SELECT payload FROM life_records WHERE id=? AND kind='calendar_created'").bind(claimId).first<{payload:string}>();
 if(claim){const old=JSON.parse(claim.payload) as {event:LifeEvent;input:typeof input};if(JSON.stringify(old.input)!==JSON.stringify(input))throw new GoogleConnectionError("This form was already saved. Start a new event to change its details.",409);return {ok:true,event:old.event};}
 let item;
 try{item=await googleJson<{id:string;summary?:string;location?:string;htmlLink?:string;start:{dateTime?:string;date?:string};end:{dateTime?:string;date?:string}}>(base+"?sendUpdates=all",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(body)});}catch(error){if(!(error instanceof GoogleConnectionError)||error.providerStatus!==409)throw error;item=await googleJson<{id:string;summary?:string;location?:string;htmlLink?:string;start:{dateTime?:string;date?:string};end:{dateTime?:string;date?:string}}>(base+"/"+input.requestId,{headers});if(item.summary!==input.title||(item.location||"")!==input.location||(input.allDay?item.start.date!==input.start||item.end.date!==input.end:Date.parse(item.start.dateTime||"")!==Date.parse(input.start)||Date.parse(item.end.dateTime||"")!==Date.parse(input.end)))throw new GoogleConnectionError("This event ID is already in use. Start a new event form.",409);}
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([input.calendarId,item.id])));
 const id='gcal:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 const event=eventSchema.parse({id,title:item.summary||input.title,location:item.location||"",source:"Google Calendar",account:calendarAccount,calendarId:input.calendarId,googleEventId:item.id,calendarName:calendar.summary||input.calendarId,canEdit:true,allDay:input.allDay,start:input.allDay?zonedMidnight(item.start.date!,calendar.timeZone||timezone):item.start.dateTime,end:input.allDay?zonedMidnight(item.end.date!,calendar.timeZone||timezone):item.end.dateTime,...(item.htmlLink?{url:item.htmlLink}:{})});
 const now=new Date().toISOString();await database().batch([database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'event',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind('event:'+id,JSON.stringify(event),now),database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'calendar_created',?,?) ON CONFLICT(id) DO NOTHING").bind(claimId,JSON.stringify({event,input}),now)]);await markMutation();
 return {ok:true,event};
}
export async function deleteCalendarEvent(id:unknown,owner:string){
 if(typeof id!=="string"||id.length>200)throw new GoogleConnectionError("Choose a saved event.");
 const headers=await access(owner),snapshot=await state();
 const event=snapshot.events.find(event=>event.id===id&&event.source==="Google Calendar"&&event.account===calendarAccount);
 if(!event?.calendarId||!event.googleEventId)throw new GoogleConnectionError("Refresh Calendar to load this event’s Google identity, then try again.",409);
 await writable(event.calendarId,headers);await markMutation();
 const url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(event.calendarId)}/events/${encodeURIComponent(event.googleEventId)}?sendUpdates=all`;
 try{await googleJson(url,{method:"DELETE",headers});}catch(error){if(!(error instanceof GoogleConnectionError)||![404,410].includes(error.providerStatus||0))throw error;}
 await database().prepare("DELETE FROM life_records WHERE kind='event' AND json_extract(payload,'$.id')=?").bind(id).run();await markMutation();
 return {ok:true};
}
