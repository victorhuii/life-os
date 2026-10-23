import type {Job,JobSource} from "./jobs";
export const directJobSource=(provider:JobSource['provider'])=>['greenhouse','lever','ashby'].includes(provider);
export const jobPollMinutes=(provider:JobSource['provider'])=>directJobSource(provider)?1:5;
export function formatJobTimestamp(value:string,precision?:'instant'|'day'){
 const date=new Date(value);if(!Number.isFinite(+date))return 'Unavailable';
 return new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',...(precision==='day'?{timeZone:'UTC'}:{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'})}).format(date);
}
export function observedJobDelay(job:Pick<Job,'baseline'|'postedAt'|'postedPrecision'|'dateStatus'|'firstSeenAt'>){
 if(job.baseline||!job.postedAt||job.postedPrecision!=='instant'||!['source','confirmed'].includes(job.dateStatus||''))return null;
 const seconds=Math.floor((Date.parse(job.firstSeenAt)-Date.parse(job.postedAt))/1000);if(!Number.isFinite(seconds)||seconds<0)return null;
 return seconds<60?`${seconds}s`:seconds<3600?`${Math.floor(seconds/60)}m ${seconds%60}s`:seconds<86400?`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`:`${Math.floor(seconds/86400)}d ${Math.floor(seconds%86400/3600)}h`;
}

export function jobMatchesFreshness(job:Pick<Job,'firstSeenAt'|'postedAt'|'postedPrecision'|'dateStatus'>,filter:string,now=Date.now()){
 if(filter==='posted_hour')return !!job.postedAt&&job.postedPrecision==='instant'&&['source','confirmed'].includes(job.dateStatus||'')&&Date.parse(job.postedAt)>=now-3600000&&Date.parse(job.postedAt)<=now;
 return filter!=='24h'||Date.parse(job.firstSeenAt)>=now-86400000;
}

export function jobDetectedSince(job:Pick<Job,'firstSeenAt'|'baseline'>,since:string,now=Date.now(),until?:string){
 const cutoff=Date.parse(since),detected=Date.parse(job.firstSeenAt);
 return !job.baseline&&Number.isFinite(cutoff)&&Number.isFinite(detected)&&detected>cutoff&&detected<=now&&(!until||detected<Date.parse(until));
}
