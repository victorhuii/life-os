"use client";
import {calHacksAccount,calHacksMetadataVersion} from "@/lib/cal-hacks-mail";
import {useCallback,useEffect,useRef,useState} from "react";
import {mailboxes,mailboxSource,type MailboxAccount,type Source} from "@/lib/life";
export default function useMailImport(sources:Record<string,Source>,onRefresh:()=>Promise<void>){
 const [busy,setBusy]=useState<MailboxAccount|null>(null),[errors,setErrors]=useState<Partial<Record<MailboxAccount,string>>>({}),[tick,setTick]=useState(0),[busyRange,setBusyRange]=useState<"week"|"older"|null>(null);
 const lock=useRef(false),failed=useRef(new Set<MailboxAccount>()),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const page=useCallback(async(account:MailboxAccount,range:'week'|'older',reset=false)=>{
  if(lock.current)return;lock.current=true;setBusy(account);setBusyRange(range);failed.current.delete(account);setErrors(current=>({...current,[account]:''}));
  try{const response=await fetch('/api/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mailPage',resource:'gmail',account,range,reset})});const result=await response.json() as {error?:string};if(!response.ok||result.error)throw Error(result.error||'Couldn’t import this email page.');await onRefresh();}
  catch(error){failed.current.add(account);if(mounted.current)setErrors(current=>({...current,[account]:error instanceof Error?error.message:'Couldn’t import emails. Try again.'}));}
  finally{lock.current=false;if(mounted.current){setBusy(null);setBusyRange(null);setTick(value=>value+1);}}
 },[onRefresh]);
 const signature=mailboxes.map(box=>{const progress=mailboxSource(sources,box.account).mailSync;return `${box.account}:${progress?.metadataVersion}:${progress?.complete}:${progress?.nextPageToken||''}`;}).join('|');
 useEffect(()=>{if(busy)return;const box=mailboxes.find(box=>{const source=mailboxSource(sources,box.account),progress=source.mailSync;return ((progress&&!progress.complete)||(box.account===calHacksAccount&&source.status==="synced"&&progress?.metadataVersion!==calHacksMetadataVersion))&&!failed.current.has(box.account);});if(!box)return;const timer=setTimeout(()=>void page(box.account,'week'),500);return()=>clearTimeout(timer);},[signature,busy,tick,page,sources]);
 return {busy,busyRange,errors,page};
}
