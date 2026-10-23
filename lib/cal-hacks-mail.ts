import type {Mail} from "./life";

export const calHacksAccount = "vhui@hackberkeley.org";
export const calHacksMetadataVersion = 1;
export type GmailMetadata = {id?:string;labelIds?:string[];payload?:{headers?:{name:string;value:string}[]}};
export type GmailLabel = {id:string;name:string;type?:string};

export function threadMailFlags(messages:GmailMetadata[],labels:GmailLabel[]) {
  const active=messages.filter(message=>!message.labelIds?.some(id=>['TRASH','SPAM','DRAFT'].includes(id)));
  const ids=new Set(active.flatMap(message=>message.labelIds||[]));
  const gmailLabels=labels.filter(label=>label.type==='user'&&ids.has(label.id)).map(label=>label.name);
  const addressed=active.some(message=>message.payload?.headers?.some(header=>{
    if(!['to','cc','delivered-to','x-original-to'].includes(header.name.toLowerCase()))return false;
    const addresses:string[]=header.value.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/g)||[];
    return addresses.includes('sponsorship@hackberkeley.org');
  }));
  return {gmailLabels,gmailThreadParticipated:ids.has('SENT'),gmailSponsorship:addressed||gmailLabels.some(name=>name.trim().toLowerCase().split('/').at(-1)==='sponsorship'),gmailMetadataVersion:calHacksMetadataVersion};
}

/** Main attention uses its active classification; Cal Hacks uses verified thread evidence. */
export function inboxViewMail(emails:Mail[],account:string,view:string,classify?:(mail:Mail)=>{label:string}) {
  const isRead=(mail:Mail)=>mail.locallyRead??mail.unread===false;
  const hacks=account===calHacksAccount;
  const eligible=emails.filter(mail=>mail.account===account).filter(mail=>{
    if(account!=='victorhui94@gmail.com'||view!=='attention')return true;
    const label=classify?.(mail).label;
    return label==='school'||label==='jobs';
  });
  const filtered=eligible.filter(mail=>view==='hidden'?mail.hidden:!mail.hidden&&(
    view==='all'||(view==='groups'&&hacks?mail.gmailSponsorship===true:view==='read'?isRead(mail):!isRead(mail)&&(!hacks||view!=='attention'||mail.gmailThreadParticipated===true))
  )).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));
  if(!hacks||!['attention','groups'].includes(view))return filtered;
  const seen=new Set<string>();
  return filtered.filter(mail=>{const key=mail.threadId||mail.id;if(seen.has(key))return false;seen.add(key);return true;});
}
