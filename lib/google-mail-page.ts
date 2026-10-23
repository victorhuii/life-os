import {calHacksAccount,calHacksMetadataVersion,threadMailFlags,type GmailMetadata,type GmailLabel} from "./cal-hacks-mail";
import {mailSchema,mailAccount,mailboxSource,mailboxSourceKey,type MailImportProgress,type Mail} from "./life";
import {database,state} from "./store";
import {googleAccessToken,googleJson,GoogleConnectionError,readGoogleGrant,type GoogleGrant,type GoogleTarget} from "./google-oauth";
import {mailWeekMs} from "./mail-range";
const base='https://gmail.googleapis.com/gmail/v1/users/me';
function text(value=''){return value.replace(/&(?:amp|lt|gt|quot|apos|#39|#\d+|#x[\da-f]+);/gi,entity=>{const known:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"};if(known[entity.toLowerCase()])return known[entity.toLowerCase()];const n=entity.toLowerCase().startsWith('&#x')?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):entity;}).replace(/\s+/g,' ').trim();}
export async function readMailPage(grant:GoogleGrant,mode:'week'|'older'='week',previous?:MailImportProgress){
 const readStartedAt=new Date().toISOString(),now=Date.now(),cutoff=Math.floor((now-mailWeekMs)/1000);
 const hacks=grant.account===calHacksAccount;
 const progress:MailImportProgress=previous?.nextPageToken&&(!hacks||previous.metadataVersion===calHacksMetadataVersion)?previous:{startedAt:readStartedAt,start:mode==='week'?new Date(cutoff*1000).toISOString():null,end:new Date((mode==='week'?Math.ceil(now/1000):cutoff)*1000).toISOString(),loaded:0,complete:false,nextPageToken:null,...(hacks?{metadataVersion:calHacksMetadataVersion}:{})};
 const token=await googleAccessToken(grant),headers={Authorization:`Bearer ${token}`};
 const profile=await googleJson<{emailAddress:string}>(base+'/profile',{headers});if(profile.emailAddress?.toLowerCase()!==grant.account)throw new GoogleConnectionError('The Gmail identity doesn’t match this inbox. Reconnect the correct account.',403,true);
 const labels=hacks?(await googleJson<{labels?:GmailLabel[]}>(base+'/labels',{headers})).labels||[]:[];
 const threads=new Map<string,Promise<ReturnType<typeof threadMailFlags>>>();
 async function threadFlags(threadId:string){
  if(!/^[a-z0-9_-]{1,200}$/i.test(threadId))throw new GoogleConnectionError('Gmail returned an invalid thread ID. Try refreshing this inbox.');
  if(!threads.has(threadId)){threads.set(threadId,(async()=>{
   const query=new URLSearchParams({format:'metadata'});for(const name of ['From','To','Cc','Delivered-To','X-Original-To'])query.append('metadataHeaders',name);
   const thread=await googleJson<{id:string;messages?:GmailMetadata[]}>(base+`/threads/${encodeURIComponent(threadId)}?${query}`,{headers});
   if(thread.id!==threadId||!thread.messages)throw new GoogleConnectionError('Couldn’t verify Gmail thread details. Your saved mail is preserved.');
   return threadMailFlags(thread.messages,labels);
  })());}
  return threads.get(threadId)!;
 }
 const q=[progress.start?`after:${Math.floor(Date.parse(progress.start)/1000)-1}`:'',`before:${Math.ceil(Date.parse(progress.end)/1000)}`,'-in:sent','-in:drafts'].filter(Boolean).join(' ');
 const params=new URLSearchParams({q,maxResults:'25',includeSpamTrash:'false'});if(progress.nextPageToken)params.set('pageToken',progress.nextPageToken);
 const list=await googleJson<{messages?:{id:string}[];nextPageToken?:string}>(base+'/messages?'+params,{headers});
 const emails:Mail[]=[];
 for(let i=0;i<(list.messages||[]).length;i+=5){const batch=await Promise.all((list.messages||[]).slice(i,i+5).map(async({id})=>{const item=await googleJson<{id:string;threadId:string;internalDate:string;snippet?:string;labelIds?:string[];payload?:{headers?:{name:string;value:string}[]}}>(base+`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,{headers});const header=(name:string)=>item.payload?.headers?.find(field=>field.name.toLowerCase()===name)?.value||'';const flags=hacks?await threadFlags(item.threadId):{};return mailSchema.parse({...flags,threadId:item.threadId,id:item.id,account:grant.account,sender:text(header('from')).slice(0,240)||'Unknown sender',subject:text(header('subject')).slice(0,400)||'(No subject)',summary:text(item.snippet).slice(0,1000),receivedAt:new Date(Number(item.internalDate)).toISOString(),url:`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(grant.account)}#inbox/${encodeURIComponent(item.threadId)}`,unread:item.labelIds?item.labelIds.includes('UNREAD'):undefined,priority:item.labelIds?.includes('IMPORTANT')?'high':'normal'});}));emails.push(...batch);}
 return {emails,readStartedAt,mailRange:mode,mailProgress:{...progress,loaded:progress.loaded+emails.length,nextPageToken:list.nextPageToken||null,complete:!list.nextPageToken},message:`${mode==='week'?'Past 7 days':'Older mail'} · ${progress.loaded+emails.length} imported${list.nextPageToken?' · Importing…':''}. Gmail unchanged.`};
}
/** Merge pages: aging out of the week never removes mail or reviewed labels. */
export async function storeMailPage(grant:GoogleGrant,snapshot:{emails:Mail[];readStartedAt?:string;mailRange?:'week'|'older';mailProgress?:MailImportProgress;message:string}){
 const old=await state(),source=mailboxSource(old.sources,grant.account),now=new Date().toISOString(),ops=[];
 // Migrate old, non-scoped row IDs without deleting other messages in this mailbox.
 const rows=await database().prepare("SELECT id,payload FROM life_records WHERE kind='mail'").all<{id:string;payload:string}>();
 for(const row of rows.results){const mail=JSON.parse(row.payload),account=mailAccount(mail,old.sources.gmail);if(account===grant.account&&snapshot.emails.some(item=>item.id===mail.id)&&row.id!==`mail:${grant.account}:${mail.id}`)ops.push(database().prepare("DELETE FROM life_records WHERE id=? AND kind='mail'").bind(row.id));else if(account&&!mail.account)ops.push(database().prepare("UPDATE life_records SET payload=? WHERE id=? AND kind='mail'").bind(JSON.stringify({...mail,account}),row.id));}
 for(const mail of snapshot.emails){if(snapshot.readStartedAt)ops.push(database().prepare("UPDATE life_records SET payload=json_remove(payload,'$.trashed') WHERE id=? AND kind='mail_preference' AND updated_at<=?").bind(`mail-pref:${grant.account}:${mail.id}`,snapshot.readStartedAt));ops.push(database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(`mail:${grant.account}:${mail.id}`,JSON.stringify(mail),now));}
 if(snapshot.mailRange==='week'&&snapshot.mailProgress?.complete&&snapshot.mailProgress.startedAt&&snapshot.mailProgress.start){ops.push(database().prepare("DELETE FROM life_records WHERE kind='mail' AND json_extract(payload,'$.account')=? AND unixepoch(json_extract(payload,'$.receivedAt'))>=unixepoch(?) AND unixepoch(json_extract(payload,'$.receivedAt'))<unixepoch(?) AND updated_at<?").bind(grant.account,snapshot.mailProgress.start,snapshot.mailProgress.end,snapshot.mailProgress.startedAt));}
 const field=snapshot.mailRange==='older'?'mailHistory':'mailSync';
 const update={account:grant.account,status:'synced',updatedAt:now,message:snapshot.message,...(snapshot.mailProgress?{[field]:snapshot.mailProgress}:{}),requiresReconnect:false};
 ops.push(database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES ('sources','sources',?,?) ON CONFLICT(id) DO UPDATE SET payload=json_patch(life_records.payload,excluded.payload),updated_at=excluded.updated_at").bind(JSON.stringify({[mailboxSourceKey(grant.account)]:update}),now));
 await database().batch(ops);
}
export async function continueMailImport(target:GoogleTarget,owner:string,mode:'week'|'older',reset=false){
 if(target.resource!=='gmail')throw new GoogleConnectionError('Choose an inbox.');
 const grant=await readGoogleGrant(target,owner);if(!grant)throw new GoogleConnectionError('Connect this inbox in Connections first.',409,true);
 const lockId=`gmail:page-lock:${target.account}`,nonce=crypto.randomUUID(),now=new Date().toISOString();
 const claim=await database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail_import_lock',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE life_records.updated_at<? RETURNING id").bind(lockId,nonce,now,new Date(Date.now()-120000).toISOString()).first();
 if(!claim)return {ok:true,skipped:true};
 try{const source=mailboxSource((await state()).sources,target.account),previous=reset?undefined:mode==='week'?source.mailSync:source.mailHistory;
 if(previous?.complete&&(target.account!==calHacksAccount||previous.metadataVersion===calHacksMetadataVersion))return {ok:true,complete:true};
 const page=await readMailPage(grant,mode,previous);await storeMailPage(grant,page);return {ok:true,complete:page.mailProgress.complete,loaded:page.mailProgress.loaded};
 }finally{await database().prepare("DELETE FROM life_records WHERE id=? AND payload=?").bind(lockId,nonce).run();}
}
