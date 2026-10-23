import {calendarAccount,dayKey,mailAccount,type State} from "./life";
import {courseDay} from "./canvas";
import {addCalendarDays,calendarTimeToISO} from "./calendar-week";

export type SummaryPeriod='since'|'hour'|'today'|'yesterday';
export function summaryTimeWindow(period:SummaryPeriod,since:string,now=Date.now()) {
  const today=dayKey(new Date(now)),midnight=calendarTimeToISO(today+'T00:00');
  const tomorrow=calendarTimeToISO(addCalendarDays(today,1)+'T00:00');
  const start=period==='yesterday'?calendarTimeToISO(addCalendarDays(today,-1)+'T00:00'):period==='today'?midnight:period==='hour'?new Date(now-3600000).toISOString():since;
  const end=period==='yesterday'?midnight:new Date(now).toISOString();
  return {start,end,calendarEnd:period==='today'?tomorrow:end};
}

export function summarizeTimeWindow(data:State,period:SummaryPeriod,since:string,now=Date.now()) {
  if(period==='since')return summarizeWorkspace(data,since,now);
  const window=summaryTimeWindow(period,since,now),start=Date.parse(window.start),end=Date.parse(window.end),calendarEnd=Date.parse(window.calendarEnd);
  const startDay=dayKey(new Date(start)),endDay=dayKey(new Date(calendarEnd-1));
  const emails=data.emails.filter(mail=>mailAccount(mail,data.sources.gmail)&&!mail.hidden&&Date.parse(mail.receivedAt)>=start&&Date.parse(mail.receivedAt)<end).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));
  const assignments=(data.coursework?.items||[]).filter(item=>item.kind==='assignment'&&(item.allDay?courseDay(item)>=startDay&&courseDay(item)<=endDay:Date.parse(item.due)>=start&&Date.parse(item.due)<calendarEnd)).sort((a,b)=>a.due.localeCompare(b.due));
  const events=data.events.filter(event=>event.source==='Google Calendar'&&(event.account||data.sources.calendar?.account)===calendarAccount&&Date.parse(event.end)>start&&Date.parse(event.start)<calendarEnd).sort((a,b)=>a.start.localeCompare(b.start));
  return {emails,assignments,events};
}

export function validCheckpoint(value:string|null,now=Date.now()) {
  const stamp=value?Date.parse(value):NaN;
  return Number.isFinite(stamp)&&stamp<=now?new Date(stamp).toISOString():null;
}
export function summarizeWorkspace(data:State,since:string,now=Date.now()) {
  const cutoff=Date.parse(since),today=dayKey(new Date(now)),end=now+7*86400000,endDay=dayKey(new Date(end));
  const emails=data.emails.filter(mail=>mailAccount(mail,data.sources.gmail)&&!mail.hidden&&Date.parse(mail.receivedAt)>cutoff&&Date.parse(mail.receivedAt)<=now).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));
  const assignments=(data.coursework?.items||[]).filter(item=>item.kind==='assignment'&&(item.allDay?courseDay(item)>=today&&courseDay(item)<=endDay:Date.parse(item.due)>=now&&Date.parse(item.due)<=end)).sort((a,b)=>a.due.localeCompare(b.due));
  const events=data.events.filter(event=>event.source==='Google Calendar'&&(event.account||data.sources.calendar?.account)===calendarAccount&&Date.parse(event.end)>now&&Date.parse(event.start)<=end).sort((a,b)=>a.start.localeCompare(b.start));
  return {emails,assignments,events};
}
