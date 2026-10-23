"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {validCheckpoint} from "@/lib/summary";

const key='vector.summary.last-check.v1';
export default function useSummaryCheckpoint(loadedAt:string) {
  const [since,setSince]=useState(''),[firstVisit,setFirstVisit]=useState(false);
  const initialized=useRef(false);
  const beginVisit=useCallback(()=>{
    if(!initialized.current)return;
    let previous:string|null=null;try{previous=validCheckpoint(localStorage.getItem(key));}catch{}
    setFirstVisit(!previous);setSince(previous||new Date(Date.now()-86400000).toISOString());
  },[]);
  useEffect(()=>{
    if(!loadedAt)return;
    if(!initialized.current){initialized.current=true;beginVisit();}
    if(document.visibilityState==='visible')try{localStorage.setItem(key,new Date().toISOString());}catch{}
  },[loadedAt,beginVisit]);
  useEffect(()=>{
    let away=document.visibilityState==='hidden';
    const changed=()=>{if(document.visibilityState==='hidden')away=true;else if(away){away=false;beginVisit();}};
    document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);
  },[beginVisit]);
  return {since,firstVisit,beginVisit};
}
