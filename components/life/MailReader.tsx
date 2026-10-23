"use client";

import {useEffect,useMemo,useState} from "react";
import {ArrowUpRight,Loader2,Paperclip,RefreshCw} from "lucide-react";
import {safeUrl,type Mail} from "@/lib/life";
import type {MailMessage} from "@/lib/mail-message";
import {mailDocument} from "@/lib/mail-document";
import "./mail-reader.css";

type Props={mail:Mail;onConnections:()=>void};
export default function MailReader({mail,onConnections}:Props){
  const [message,setMessage]=useState<MailMessage|null>(null);
  const [error,setError]=useState("");
  const [reconnect,setReconnect]=useState(false);
  const [loading,setLoading]=useState(true);
  const [retry,setRetry]=useState(0);
  const [images,setImages]=useState(false);
  const [plain,setPlain]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    setMessage(null);setError("");setReconnect(false);setLoading(true);setImages(false);setPlain(false);
    void (async()=>{
      try{
        const response=await fetch("/api/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"message",resource:"gmail",account:mail.account,id:mail.id}),signal:controller.signal});
        const result=await response.json() as MailMessage & {error?:string;requiresReconnect?:boolean};
        if(!response.ok || result.error){if(!controller.signal.aborted)setReconnect(!!result.requiresReconnect);throw new Error(result.error||"Couldn’t load this message.");}
        if(!controller.signal.aborted)setMessage(result);
      }catch(caught){if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:"Couldn’t load this message.");}
      finally{if(!controller.signal.aborted)setLoading(false);}
    })();
    return()=>controller.abort();
  },[mail.id,mail.account,retry]);
  const document=useMemo(()=>message?.html ? mailDocument(message.html,message.inlineImages||{},images) : "",[message,images]);
  return <div className="l-mail-reader" data-no-focus><h3>{message?.subject || mail.subject}</h3>
    {loading ? <div className="l-mail-reader-loading" role="status"><Loader2 size={18} className="l-spin"/>Loading complete message from Gmail…</div> : error ? <div className="l-mail-reader-error" role="alert"><p>{error}</p><div>{reconnect ? <button className="l-button l-secondary" onClick={onConnections}>Open Connections</button> : <button className="l-button l-secondary" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={13}/>Retry</button>}<a className="l-text-button" href={safeUrl(mail.url)} target="_blank" rel="noreferrer">Open full message in Gmail<ArrowUpRight size={13}/></a></div></div> : message && <>
      <dl className="l-mail-reader-headers"><div><dt>From</dt><dd>{message.from || mail.sender}</dd></div>{message.to && <div><dt>To</dt><dd>{message.to}</dd></div>}{message.cc && <div><dt>Cc</dt><dd>{message.cc}</dd></div>}{message.date && <div><dt>Date</dt><dd>{message.date}</dd></div>}</dl>
      {message.html && <div className="l-mail-reader-toolbar"><span>Complete message</span><div>{!plain && <button className="l-text-button" aria-pressed={images} onClick={()=>setImages(value=>!value)}>{images?"Hide remote images":"Show remote images"}</button>}{message.text && <button className="l-text-button" aria-pressed={plain} onClick={()=>setPlain(value=>!value)}>{plain?"Formatted":"Plain text"}</button>}</div></div>}
      {message.html && !plain ? <iframe className="l-mail-reader-frame" title={`Complete email: ${mail.subject}`} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={document}/> : message.text ? <div className="l-mail-reader-text">{message.text}</div> : <p className="l-mail-reader-no-body">This message has no readable text body. Open Gmail to view its attachments or original format.</p>}
      {!!message.attachments.length && <section className="l-mail-reader-attachments" aria-label="Email attachments"><h4><Paperclip size={14}/>Attachments and inline files</h4>{message.attachments.map((attachment,index)=><a key={index} href={safeUrl(mail.url)} target="_blank" rel="noreferrer"><span>{attachment.name}{attachment.inline && " · inline"}</span><small>{attachment.size?`${Math.max(1,Math.round(attachment.size/1024))} KB`:attachment.mimeType}</small><ArrowUpRight size={12}/></a>)}<p>Open attachments in Gmail.</p></section>}
    </>}
  </div>;
}
