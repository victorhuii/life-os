import {currentEnsemble} from "./mail-ensemble";
import type {Mail,MailboxAccount} from "./life";
import {mailFeatureFingerprint,validGroup,type MailGroup,type MailPrediction} from "./mail-learning";

type Label={key:string;id:string;account:MailboxAccount;label:MailGroup;updatedAt:string};
type Prediction=MailPrediction & {fingerprint:string;model:string};
export const mailKey=(mail:Pick<Mail,"account"|"id">)=>`${mail.account}:${mail.id}`;

/** The same current inbox supplies review cards, the header and semantic coverage.
 * Saved labels remain a separate dataset so inbox refresh never erases training. */
export function inboxLabSnapshot<T extends Label>(emails:Mail[],saved:T[],predictions:Record<string,Prediction>,account:MailboxAccount){
 const current=[...new Map(emails.filter(mail=>mail.account===account&&!mail.hidden).map(mail=>[mailKey(mail),mail])).values()];
 const labelsByKey=new Map<string,T>();
 for(const label of saved){if(label.account!==account||!validGroup(account,label.label))continue;const key=mailKey(label),previous=labelsByKey.get(key);if(!previous||label.updatedAt>previous.updatedAt)labelsByKey.set(key,label);}
 const labels=[...labelsByKey.values()],currentKeys=new Set(current.map(mailKey)),reviewed=labels.filter(label=>currentKeys.has(mailKey(label)));
 const pending=current.filter(mail=>{if(labelsByKey.has(mailKey(mail)))return false;const cached=predictions[mailKey(mail)];return !(currentEnsemble(cached,account,mailFeatureFingerprint(mail))&&cached.votes?.length===3);});
 return {current,labels,reviewed,pending};
}
