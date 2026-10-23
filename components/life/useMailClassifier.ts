"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {inboxLabSnapshot} from "@/lib/mail-lab-state";
import {mailInRange,type MailRange} from "@/lib/mail-range";
import MailTrainingWorker from "./mail-training.worker?worker";
import {mailboxes,type Mail,type MailboxAccount} from "@/lib/life";
import {featuresOf,labelFingerprint,mailFeatureFingerprint,mailModelText,predictMail,semanticTag,mainMailAccount,groupIds,validGroup,type MailGroup,type MailPrediction,type PersonalModel,type TrainingExample} from "@/lib/mail-learning";
import {ensembleModels,ensembleCategories,currentEnsemble,majorityPrediction,type ModelVote} from "@/lib/mail-ensemble";
import {claimMailInference} from "./mail-inference-lock";
export type ReviewedLabel={key:string;id:string;account:MailboxAccount;label:MailGroup;features:ReturnType<typeof featuresOf>;updatedAt:string};
type StoredPrediction=MailPrediction & {fingerprint:string;model:string};
type LabState={modelsByAccount:Partial<Record<MailboxAccount,PersonalModel|null>>;activeIdsByAccount:Partial<Record<MailboxAccount,string|null>>;labels:ReviewedLabel[];predictions:Record<string,StoredPrediction>;model:PersonalModel|null;activeId:string|null;models:{id:string;account:MailboxAccount;createdAt:string;examples:number;metrics:PersonalModel["metrics"]}[]};
const empty:LabState={modelsByAccount:{},activeIdsByAccount:{},labels:[],predictions:{},model:null,models:[],activeId:null};
const keyOf=(mail:Mail)=>`${mail.account}:${mail.id}`;
export default function useMailClassifier(emails:Mail[],range:MailRange="week",now=Date.now()){
 const [data,setData]=useState<LabState>(empty),[ready,setReady]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState("");
 const [semanticByAccount,setSemanticByAccount]=useState<Partial<Record<MailboxAccount,{running:boolean;status:string;done:number;total:number}>>>({});
 const [errors,setErrors]=useState<Partial<Record<MailboxAccount,string>>>({}),[busyAccount,setBusyAccount]=useState<MailboxAccount|null>(null),[runningAccount,setRunningAccount]=useState<MailboxAccount|null>(null);
 const [modelActivity,setModelActivity]=useState<{account:MailboxAccount;key:string;status:string;download?:number}|null>(null);
 const [paused,setPaused]=useState(false),[autoTick,setAutoTick]=useState(0);
 const releaseInference=useRef<(()=>void)|null>(null);
 const [modelCache,setModelCache]=useState<"checking"|"saved"|"missing"|"unavailable">("checking");
 const checkModelCache=useCallback(async()=>{try{if(!('caches'in window)){setModelCache("unavailable");return;}const cache=await caches.open("transformers-cache");let saved=true;for(const model of ensembleModels){const path=model.key==="deberta"?"/api/mail-model/onnx/model_int8.onnx":`/api/mail-model/ensemble/${model.key}/onnx/model_int8.onnx`;const response=await cache.match(new URL(path,window.location.origin).href);if(!response)saved=false;await response?.body?.cancel();}setModelCache(saved?"saved":"missing");}catch{setModelCache("unavailable");}},[]);
 useEffect(()=>{void checkModelCache();const check=()=>void checkModelCache();window.addEventListener("focus",check);return()=>window.removeEventListener("focus",check);},[checkModelCache]);
 const requestVersion=useRef(0);
 const setAccountError=(account:MailboxAccount,message:string)=>setErrors(current=>({...current,[account]:message}));
 const setSemantic=(account:MailboxAccount,update:React.SetStateAction<{running:boolean;status:string;done:number;total:number}>)=>setSemanticByAccount(current=>({...current,[account]:typeof update==="function"?update(current[account]||{running:false,status:"",done:0,total:0}):update}));
 const cancelPending=useRef<(()=>void)|null>(null);
 const semanticWorker=useRef<Worker|null>(null),trainingWorker=useRef<Worker|null>(null),cancelled=useRef(false),operation=useRef(false);
 const load=useCallback(async()=>{const version=++requestVersion.current;try{const result=await fetch("/api/mail-classifier",{cache:"no-store"});const value=await result.json() as LabState&{error?:string};if(!result.ok)throw Error(value.error||"Couldn’t load email groups.");if(version!==requestVersion.current)return;setData({...value,modelsByAccount:value.modelsByAccount||{[mainMailAccount]:value.model},activeIdsByAccount:value.activeIdsByAccount||{[mainMailAccount]:value.activeId}});setReady(true);setError("");}catch(caught){if(version===requestVersion.current)setError(caught instanceof Error?caught.message:"Couldn’t load email groups.");}},[]);
 useEffect(()=>{void load();const refresh=()=>{if(document.visibilityState==="visible"&&!operation.current&&!semanticWorker.current)void load();};window.addEventListener("focus",refresh);return()=>{window.removeEventListener("focus",refresh);semanticWorker.current?.terminate();trainingWorker.current?.terminate();releaseInference.current?.();};},[load]);
 const reviewed=useMemo(()=>new Map(data.labels.map(label=>[label.key,label])),[data.labels]);
 const classify=useCallback((mail:Mail):MailPrediction=>{
  const account=mail.account||mainMailAccount;
  const label=reviewed.get(keyOf(mail));if(label&&validGroup(account,label.label))return {label:label.label,score:1,scores:groupIds(account).map(()=>0),method:"reviewed"};
  const ensemble=data.predictions[keyOf(mail)];if(currentEnsemble(ensemble,account,mailFeatureFingerprint(mail))&&ensemble.votes?.length===3)return majorityPrediction(account,ensemble.votes);
  // A personal model remains a fallback until all three pretrained votes are available.
  const personal=data.modelsByAccount[account];if(personal)return predictMail(mail,personal);
  const cached=data.predictions[keyOf(mail)];if(cached?.fingerprint===mailFeatureFingerprint(mail)&&cached.model===semanticTag(account)&&validGroup(account,cached.label)&&cached.scores.length===groupIds(account).length)return {...cached,method:"semantic"};
  return predictMail(mail);
 },[data.modelsByAccount,data.predictions,reviewed]);
 async function post(body:unknown){const response=await fetch("/api/mail-classifier",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error||"Couldn’t save this classifier update.");}
 async function label(mail:Pick<Mail,"id"|"account">,category:MailGroup|null){
  if(operation.current)return;operation.current=true;setBusy(`${mail.account}:${mail.id}`);setBusyAccount(mail.account||mainMailAccount);setAccountError(mail.account||mainMailAccount,"");++requestVersion.current;
  try{await post({action:category?"label":"unlabel",id:mail.id,account:mail.account,...(category?{label:category}:{})});await load();}catch(caught){setAccountError(mail.account||mainMailAccount,caught instanceof Error?caught.message:"Couldn’t save label.");}finally{operation.current=false;setBusy("");setBusyAccount(null);}
 }
 async function train(account:MailboxAccount=mainMailAccount){
  if(operation.current)return;operation.current=true;setBusy("training");setBusyAccount(account);setAccountError(account,"");++requestVersion.current;
  try{
   const examples:TrainingExample[]=data.labels.filter(label=>label.account===account&&validGroup(account,label.label)).map(label=>({...label.features,key:label.key,label:label.label}));
   const model=await new Promise<PersonalModel>((resolve,reject)=>{const worker=new MailTrainingWorker();trainingWorker.current=worker;worker.onmessage=event=>{worker.terminate();trainingWorker.current=null;if(event.data.error)reject(Error(event.data.error));else resolve(event.data.model);};worker.onerror=()=>{worker.terminate();reject(Error("Training could not run in this browser. Retry after reloading."));};worker.postMessage({examples,account});});
   await post({action:"model",account,model});await load();
  }catch(caught){setAccountError(account,caught instanceof Error?caught.message:"Couldn’t train the model.");}finally{operation.current=false;setBusy("");setBusyAccount(null);}
 }
 async function activate(id:string|null,account:MailboxAccount=mainMailAccount){if(operation.current)return;operation.current=true;setBusy("activate");setBusyAccount(account);setAccountError(account,"");++requestVersion.current;try{await post({action:"activate",account,id});await load();}catch(caught){setAccountError(account,caught instanceof Error?caught.message:"Couldn’t switch model.");}finally{operation.current=false;setBusy("");setBusyAccount(null);}}
 function stop(account:MailboxAccount){if(account!==runningAccount)return;cancelled.current=true;cancelPending.current?.();cancelPending.current=null;semanticWorker.current?.terminate();semanticWorker.current=null;releaseInference.current?.();releaseInference.current=null;setRunningAccount(null);setModelActivity(null);setSemantic(account,current=>({...current,running:false,status:"Paused"}));}
 async function runSemantic(account:MailboxAccount=mainMailAccount){
  if(semanticWorker.current||operation.current||document.visibilityState!=="visible")return;
  const queue=inboxLabSnapshot(emails.filter(mail=>mailInRange(mail,range,now)),data.labels,data.predictions,account).pending.slice(0,8);
  if(!queue.length)return;
  const release=claimMailInference();if(!release)return;
  releaseInference.current=release;cancelled.current=false;setAccountError(account,"");setRunningAccount(account);
  setSemantic(account,{running:true,status:"Loading voting models…",done:0,total:queue.length});
  const votesByKey=new Map(queue.map(mail=>{const cached=data.predictions[keyOf(mail)];return [keyOf(mail),currentEnsemble(cached,account,mailFeatureFingerprint(mail))?[...(cached.votes||[])]:[] as ModelVote[]];}));
  let worker:Worker|null=null;
  try{
   for(const model of ensembleModels){
    if(cancelled.current)break;
    const pending=queue.filter(mail=>!votesByKey.get(keyOf(mail))!.some(vote=>vote.model===model.key));if(!pending.length)continue;
    worker=new Worker("/mail-semantic-worker.js?v=ensemble-6",{type:"module"});semanticWorker.current=worker;
    const currentWorker=worker;
    const ask=(message:unknown,loading=false)=>new Promise<any>((resolve,reject)=>{
     const timer=window.setTimeout(()=>reject(Error(loading?"Model loading timed out. Resume to retry.":"Classification timed out. Resume to retry.")),loading?240000:60000);
     const fail=(message:string)=>{clearTimeout(timer);reject(Error(message));};cancelPending.current=()=>fail("Stopped");
     currentWorker.onerror=()=>fail("The browser model stopped. Resume to retry.");
     currentWorker.onmessage=event=>{const value=event.data;if(value.type==="error")fail(value.message);else if(value.type===(loading?"ready":"result")){clearTimeout(timer);cancelPending.current=null;resolve(value);}else if(value.type==="progress"){
      const saved=value.source==="cache",percent=Math.max(0,Math.min(100,Math.round(value.progress||0)));
      setModelActivity({account,key:model.key,status:saved?"Loading saved files":`Downloading · ${percent}%`,download:saved?undefined:percent});
      setSemantic(account,current=>({...current,status:saved?`Loading saved ${model.name}…`:`Downloading ${model.name} · ${percent}%`}));
     }};
     currentWorker.postMessage(message);
    });
    setModelActivity({account,key:model.key,status:"Loading model"});
    setSemantic(account,current=>({...current,status:`Loading ${model.name}…`}));
    await ask({action:"load",model},true);
    for(const mail of pending){
     if(cancelled.current)break;
     setModelActivity({account,key:model.key,status:"Classifying"});
     setSemantic(account,current=>({...current,status:`${model.name} · voting`}));
     const result=await ask({action:"classify",id:keyOf(mail),text:mailModelText(mail),categories:ensembleCategories(account)});
     if(cancelled.current)break;
     const response=await fetch("/api/mail-classifier",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"vote",account,id:mail.id,model:model.key,scores:result.scores,fingerprint:mailFeatureFingerprint(mail)})});
     const body=await response.json() as {error?:string;prediction:StoredPrediction};if(!response.ok)throw Error(body.error||"Couldn’t save model vote.");
     if(cancelled.current)break;
     votesByKey.set(keyOf(mail),body.prediction.votes||[]);
     setData(current=>({...current,predictions:{...current.predictions,[keyOf(mail)]:body.prediction}}));
    }
    worker.terminate();if(semanticWorker.current===worker)semanticWorker.current=null;worker=null;
   }
   if(!cancelled.current)setSemantic(account,current=>({...current,running:false,status:"Up to date"}));
  }catch(caught){if(!cancelled.current){setAccountError(account,caught instanceof Error?caught.message:"Voting failed. Resume to retry.");setSemantic(account,current=>({...current,running:false,status:"Couldn’t classify"}));}}
  finally{setModelActivity(null);worker?.terminate();semanticWorker.current=null;cancelPending.current=null;release();if(releaseInference.current===release)releaseInference.current=null;setRunningAccount(null);void checkModelCache();}
 }
 // Automatically drain small, resumable batches across all inboxes. Never run while hidden.
 const runRef=useRef(runSemantic);runRef.current=runSemantic;
 const nextAccount=useRef(0);
 useEffect(()=>{
  const wake=()=>setAutoTick(tick=>tick+1),timer=window.setInterval(wake,5000);
  document.addEventListener("visibilitychange",wake);window.addEventListener("mail-inference-idle",wake);
  return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",wake);window.removeEventListener("mail-inference-idle",wake);};
 },[]);
 useEffect(()=>{
  if(document.visibilityState!=="visible"){if(runningAccount)stop(runningAccount);return;}
  if(!ready||paused||runningAccount||operation.current)return;
  for(let i=0;i<mailboxes.length;i++){
   const index=(nextAccount.current+i)%mailboxes.length,account=mailboxes[index].account;
   if(errors[account])continue;
   if(inboxLabSnapshot(emails.filter(mail=>mailInRange(mail,range,now)),data.labels,data.predictions,account).pending.length){
    const timer=window.setTimeout(()=>{nextAccount.current=(index+1)%mailboxes.length;void runRef.current(account);},1000);
    return()=>clearTimeout(timer);
   }
  }
 },[ready,paused,runningAccount,autoTick,emails,range,data.labels,data.predictions,errors]);
 function toggleAutomatic(account:MailboxAccount){if(!paused){setPaused(true);if(runningAccount)stop(runningAccount);}else{setPaused(false);setAccountError(account,"");setAutoTick(tick=>tick+1);}}
 const reload=async(account:MailboxAccount)=>{setAccountError(account,"");await load();};
 const modelFor=(account:MailboxAccount)=>data.modelsByAccount[account]||null;
 const staleFor=(account:MailboxAccount)=>{const model=modelFor(account),examples=data.labels.filter(label=>label.account===account).map(label=>({...label.features,key:label.key,label:label.label}));return !!model&&model.labelFingerprint!==labelFingerprint(examples);};
 const snapshotFor=(account:MailboxAccount)=>inboxLabSnapshot(emails.filter(mail=>mailInRange(mail,range,now)),data.labels,data.predictions,account);
 const semanticFor=(account:MailboxAccount)=>{const saved=semanticByAccount[account],snapshot=snapshotFor(account);return {running:saved?.running||false,status:saved?.running?saved.status:snapshot.pending.length===0?"Up to date":saved?.status.startsWith("Paused")||saved?.status.startsWith("Couldn’t")?saved.status:paused?"Paused":"Automatic",done:snapshot.current.length-snapshot.pending.length,total:snapshot.current.length};};
 const modelProgressFor=(account:MailboxAccount)=>{
  const snapshot=snapshotFor(account),reviewedKeys=new Set(snapshot.reviewed.map(label=>label.key));
  const candidates=snapshot.current.filter(mail=>!reviewedKeys.has(keyOf(mail)));
  return ensembleModels.map(model=>{
   const done=candidates.filter(mail=>{const cached=data.predictions[keyOf(mail)];return currentEnsemble(cached,account,mailFeatureFingerprint(mail))&&cached.votes?.some(vote=>vote.model===model.key);}).length;
   const active=runningAccount===account&&modelActivity?.account===account&&modelActivity.key===model.key;
   const status=!ready?"Loading progress":!candidates.length?"No emails to classify":done===candidates.length?"Complete":active?modelActivity.status:paused?"Paused":errors[account]?"Stopped":"Queued";
   return {...model,done,total:candidates.length,active,status,download:active?modelActivity.download:undefined};
  });
 };
 const errorFor=(account:MailboxAccount)=>errors[account]||error;
 const busyFor=(account:MailboxAccount)=>busyAccount===account?busy:"";
 return {modelProgressFor,paused,toggleAutomatic,data,ready,error,busy,busyAccount,modelCache,errorFor,busyFor,runningAccount,reload,snapshotFor,semanticFor,load,classify,label,train,activate,runSemantic,stop,reviewed,modelFor,staleFor};
}
export type MailClassifier=ReturnType<typeof useMailClassifier>;
