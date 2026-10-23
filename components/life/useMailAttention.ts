"use client";
import {claimMailInference} from "./mail-inference-lock";
import {useCallback,useEffect,useRef,useState} from "react";
import type {Mail,MailboxAccount} from "@/lib/life";
import {mailFeatureFingerprint} from "@/lib/mail-learning";
import {attentionAccount,attentionCategories,attentionKey,attentionModelTag,attentionText,savedAttention,type AttentionRecord} from "@/lib/mail-attention";

export default function useMailAttention(candidates:Mail[],account:MailboxAccount,enabled:boolean){
 const [records,setRecords]=useState<Record<string,AttentionRecord>>({}),[loaded,setLoaded]=useState(false),[error,setError]=useState("");
 const [running,setRunning]=useState(false),[paused,setPaused]=useState(false),[visible,setVisible]=useState(true),[status,setStatus]=useState("");
 const releaseRef=useRef<(()=>void)|null>(null);
 const workerRef=useRef<Worker|null>(null),cancelRef=useRef<(()=>void)|null>(null),version=useRef(0),loadVersion=useRef(0);
 const latest=useRef(candidates);latest.current=candidates;
 const recordsRef=useRef(records);recordsRef.current=records;
 const halt=useCallback(()=>{version.current++;cancelRef.current?.();cancelRef.current=null;workerRef.current?.terminate();workerRef.current=null;releaseRef.current?.();releaseRef.current=null;setRunning(false);},[]);
 useEffect(()=>{const change=()=>setVisible(document.visibilityState==='visible');change();document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 const reload=useCallback(async()=>{
  const token=++loadVersion.current;setLoaded(false);setError("");
  if(!attentionAccount(account)){setLoaded(true);return;}
  try{const response=await fetch(`/api/mail-attention?account=${encodeURIComponent(account)}`,{cache:'no-store'}),body=await response.json() as {error?:string;records:AttentionRecord[]};if(!response.ok)throw Error(body.error||'Couldn’t load attention checks.');if(loadVersion.current!==token)return;
   setRecords(Object.fromEntries((body.records as AttentionRecord[]).filter(record=>record.account===account&&record.model===attentionModelTag).map(record=>[`${record.account}:${record.id}`,record])));setLoaded(true);
  }catch(caught){if(loadVersion.current===token)setError(caught instanceof Error?caught.message:'Couldn’t load attention checks.');}
 },[account]);
 useEffect(()=>{halt();setRecords({});setPaused(false);void reload();return()=>{loadVersion.current++;halt();};},[reload,halt]);
 useEffect(()=>{if(!enabled||!visible)halt();},[enabled,visible,halt]);
 const run=useCallback(async()=>{
  if(workerRef.current||!enabled||!visible||!loaded||!attentionAccount(account))return;
  const queue=latest.current.filter(mail=>!savedAttention(mail,recordsRef.current)).slice(0,8);if(!queue.length)return;
  const release=claimMailInference();if(!release)return;releaseRef.current=release;
  const token=++version.current;setRunning(true);setError("");setStatus('Loading DeBERTa attention…');
  let worker:Worker;
  try{worker=new Worker('/mail-semantic-worker.js?v=deberta-tasks-5',{type:'module'});workerRef.current=worker;}catch{release();releaseRef.current=null;setRunning(false);setError('This browser couldn’t start attention checks.');return;}
  const ask=(message:unknown,ready=false)=>new Promise<any>((resolve,reject)=>{
   const timer=window.setTimeout(()=>reject(Error(ready?'Attention model loading timed out.':'Attention check timed out.')),ready?240000:60000);
   const fail=(message:string)=>{clearTimeout(timer);reject(Error(message));};cancelRef.current=()=>fail('Stopped');
   worker.onerror=()=>fail('The attention model stopped. Retry to continue.');
   worker.onmessage=event=>{const value=event.data;if(value.type==='error')fail(value.message);else if(value.type===(ready?'ready':'result')){clearTimeout(timer);cancelRef.current=null;resolve(value);}else if(value.type==='progress')setStatus(value.source==='cache'?'Loading saved model…':`Downloading model · ${Math.round(value.progress||0)}%`);};
   worker.postMessage(message);
  });
  try{
   await ask({action:'load'},true);
   for(let i=0;i<queue.length&&version.current===token;i++){
    const mail=queue[i];if(!latest.current.some(current=>attentionKey(current)===attentionKey(mail)&&mailFeatureFingerprint(current)===mailFeatureFingerprint(mail)))continue;
    setStatus(`Checking attention · ${i+1}/${queue.length}`);
    const value=await ask({action:'classify',task:'attention',id:attentionKey(mail),text:attentionText(mail),categories:attentionCategories});
    if(version.current!==token)break;
    const response=await fetch('/api/mail-attention',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:mail.account,id:mail.id,fingerprint:mailFeatureFingerprint(mail),model:attentionModelTag,scores:value.scores})});
    const body=await response.json() as {error?:string;record:AttentionRecord};if(!response.ok)throw Error(body.error||'Couldn’t save the attention check.');
    if(version.current===token)setRecords(current=>({...current,[attentionKey(mail)]:body.record}));
   }
  }catch(caught){if(version.current===token)setError(caught instanceof Error?caught.message:'Attention checks failed.');}
  finally{worker.terminate();release();if(releaseRef.current===release)releaseRef.current=null;if(workerRef.current===worker){workerRef.current=null;cancelRef.current=null;setRunning(false);setStatus('');}}
 },[account,enabled,visible,loaded]);
 const pendingMail=candidates.filter(mail=>!savedAttention(mail,records)),pending=pendingMail.length;
 const pendingKey=pendingMail.map(mail=>attentionKey(mail)+":"+mailFeatureFingerprint(mail)).join("|");
 const runRef=useRef(run);runRef.current=run;
 useEffect(()=>{const wake=()=>{if(!paused&&!error)void runRef.current();};window.addEventListener("mail-inference-idle",wake);return()=>window.removeEventListener("mail-inference-idle",wake);},[paused,error]);
 useEffect(()=>{if(enabled&&visible&&loaded&&!paused&&!running&&!error&&pending)void runRef.current();},[enabled,visible,loaded,paused,running,error,pending,pendingKey]);
 const retry=()=>{setError('');setPaused(false);if(!loaded)void reload();else void runRef.current();};
 const decision=(mail:Mail)=>savedAttention(mail,records)?.decision;
 return {decision,loaded,error,running,status,pending,retry,pause:()=>{setPaused(true);halt();},paused};
}
