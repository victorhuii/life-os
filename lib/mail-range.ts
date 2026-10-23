import type {Mail} from "./life";
export type MailRange="week"|"older";
export const mailWeekMs=7*24*60*60*1000;
export function mailInRange(mail:Pick<Mail,"receivedAt">,range:MailRange,now=Date.now()){
 const stamp=Date.parse(mail.receivedAt);return Number.isFinite(stamp)&&(range==="week"?stamp>=now-mailWeekMs:stamp<now-mailWeekMs);
}
