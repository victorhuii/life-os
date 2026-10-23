"use client";
import {useEffect,useState} from "react";
import {ArrowUpRight,Check,Layers3} from "lucide-react";
import {groupsForAccount,type MailGroup} from "@/lib/mail-learning";
import type {Mail,MailboxAccount} from "@/lib/life";
import type {MailClassifier} from "./useMailClassifier";
import "./mail-lab.css";
export default function MailGroups({account,emails,classifier,onOpen,onLab,expanded}:{account:MailboxAccount;emails:Mail[];classifier:MailClassifier;onOpen:(mail:Mail)=>void;onLab:()=>void;expanded:boolean}){
 const error=classifier.errorFor(account);
 const [visible,setVisible]=useState(50);
 const mailGroups=groupsForAccount(account);
 const [group,setGroup]=useState<MailGroup>("shopping");
 const entries=emails.filter(mail=>!mail.hidden).map(mail=>({mail,prediction:classifier.classify(mail)}));
 const selectedGroup=mailGroups.some(category=>category.id===group)?group:mailGroups[0].id;
 useEffect(()=>setVisible(50),[account,group]);
 const selected=entries.filter(entry=>entry.prediction.label===selectedGroup);
 return <div className="l-mail-groups" data-no-focus>
  <div className="l-mail-group-categories" data-categories={mailGroups.length} aria-label="Email topics">{mailGroups.map(category=><button key={category.id} aria-pressed={selectedGroup===category.id} onClick={()=>setGroup(category.id)}><span>{category.label}</span><strong>{entries.filter(entry=>entry.prediction.label===category.id).length}</strong></button>)}</div>
  <div className="l-mail-groups-heading"><span><Layers3 size={13}/>{mailGroups.find(category=>category.id===selectedGroup)?.detail}</span><button className="l-text-button" onClick={onLab}>Mail Lab<ArrowUpRight size={12}/></button></div>
  {error&&<p className="l-inline-warning" role="alert">{error}<button onClick={()=>void classifier.reload(account)}>Retry</button></p>}
  {selected.length ? selected.slice(0,expanded?visible:1).map(({mail,prediction})=><article className="l-group-mail" key={`${mail.account}:${mail.id}`}><button className="l-group-mail-open" onClick={()=>onOpen(mail)}><small>{mail.sender}</small><strong>{mail.subject}</strong><span>{mail.summary}</span></button><div className="l-group-mail-label"><span>{prediction.method==="reviewed"?<><Check size={11}/>Reviewed</>:prediction.needsReview?"Split vote · review":prediction.method==="ensemble"?`${prediction.agreement}/3 model votes`:prediction.score<.65?"Review suggested":prediction.method==="semantic"?"DeBERTa suggestion":prediction.method==="personal"?"Personal model":"Starter suggestion"}</span><label><span className="l-sr-only">Change group for {mail.subject}</span><select value={prediction.label} disabled={!!classifier.busy||!classifier.ready} onChange={event=>void classifier.label(mail,event.target.value as MailGroup)}>{mailGroups.map(category=><option key={category.id} value={category.id}>{category.label}</option>)}</select></label>{prediction.method!=="reviewed"&&<button className="l-text-button" disabled={!!classifier.busy||!classifier.ready} onClick={()=>void classifier.label(mail,prediction.label)}>Confirm</button>}</div></article>) : <p className="l-group-empty">No saved messages in this group. Labels can be corrected in Mail Lab.</p>}
 {expanded&&selected.length>visible&&<button className="l-mail-load-more" onClick={()=>setVisible(count=>count+50)}>Show more · {visible} of {selected.length}</button>}
 </div>;
}
