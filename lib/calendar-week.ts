import {timezone} from "./life";
export function addCalendarDays(day:string,count:number){const value=new Date(day+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+count);return value.toISOString().slice(0,10);}
/** Interpret form values in the calendar's zone, even on a device in another zone. */
export function calendarTimeToISO(civil:string){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(civil))throw Error("Choose a valid date and time.");
 const target=Date.parse(civil+':00Z');if(!Number.isFinite(target))throw Error("Choose a valid date and time.");let stamp=target;
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const displayed=(value:number)=>{const p=Object.fromEntries(fmt.formatToParts(value).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
 for(let i=0;i<3;i++)stamp+=target-Date.parse(displayed(stamp)+':00Z');
 if(displayed(stamp)!==civil)throw Error("That time does not exist because of daylight saving. Choose another time.");
 return new Date(stamp).toISOString();
}
