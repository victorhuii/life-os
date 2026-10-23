"use client";
import {useEffect,useState} from "react";
import type {WeatherHistory} from "@/lib/weather-history";
import {weatherLabel,type WeatherLocation} from "@/lib/weather";
import {safeUrl,timezone} from "@/lib/life";
export default function SummaryWeatherHistory({location,start,end}:{location:WeatherLocation;start:string;end:string}){
  const [value,setValue]=useState<WeatherHistory|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setValue(null);setError('');void(async()=>{try{const response=await fetch('/api/weather/history?'+new URLSearchParams({location}),{signal:controller.signal});const result=await response.json() as WeatherHistory&{error?:string};if(!response.ok||!Array.isArray(result.hours))throw Error(result.error||'Weather history unavailable.');setValue(result);}catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Weather history unavailable.');}})();return()=>controller.abort();},[location]);
  const hours=(value?.hours||[]).filter(hour=>Date.parse(hour.at)+3600000>Date.parse(start)&&Date.parse(hour.at)<Date.parse(end));
  const temperatures=hours.flatMap(hour=>hour.temperature===null?[]:[hour.temperature]);
  const conditions=[...new Set(hours.map(hour=>weatherLabel(hour.code)))];
  const sample=hours.filter((_,i)=>i%Math.max(1,Math.ceil(hours.length/6))===0);
  return value?<>{hours.length?<><p className="s-weather-now">{temperatures.length?`${Math.round(Math.min(...temperatures))}–${Math.round(Math.max(...temperatures))}°F`:'Temperature unavailable'}</p><p className="s-weather-copy">{conditions.join(', ')}.</p><div className="s-hours">{sample.map(hour=><div key={hour.at}><small>{new Date(hour.at).toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',timeZoneName:'short'})}</small><strong>{hour.temperature===null?'—':`${Math.round(hour.temperature)}°`}</strong></div>)}</div></>:<p className="s-muted">No weather readings available for this period.</p>}<p className="s-footnote">{value.stale?'Saved data · ':''}Hourly model data, not station observations · <a href={safeUrl(value.sourceUrl)} target="_blank" rel="noreferrer">{value.source}</a></p></>:<p className="s-muted">{error||'Loading weather for this period…'}</p>;
}
