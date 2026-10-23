import type { Mail } from "./life";
import { mailFeatureFingerprint, mailModelText, semanticModel } from "./mail-learning";

export const attentionModelTag = `${semanticModel.tag}:attention-v1`;
export const attentionCategories = [
  {id:"attention", description:"needs to reply, make a decision, attend a requested meeting, or complete a specific task or deadline"},
  {id:"information", description:"is receiving an informational update, newsletter, advertisement, confirmation, or completed-task notice with no action requested"},
  {id:"uncertain", description:"cannot tell from the available message whether any action is needed"},
];
export type AttentionDecision = "attention" | "information" | "uncertain";
export type AttentionRecord = {account:string;id:string;fingerprint:string;model:string;decision:AttentionDecision;scores:number[];updatedAt:string};
export const attentionKey = (mail:Pick<Mail,"account"|"id">)=>`${mail.account}:${mail.id}`;
export const attentionAccount = (account:string)=>["victorhui94@gmail.com","huiv@berkeley.edu","vhui@hackberkeley.org"].includes(account);
export function attentionDecision(scores:number[],mail?:Pick<Mail,"subject"|"summary">):AttentionDecision {
  if(scores.length!==3||scores.some(score=>!Number.isFinite(score)||score<0||score>1))throw Error("Invalid attention scores.");
  if(mail&&(`${mail.subject} ${mail.summary}`.match(/\b[a-z]+\b/gi)||[]).length<8)return "uncertain";
  const order=scores.map((score,index)=>({score,index})).sort((a,b)=>b.score-a.score);
  // Ambiguous results remain visible instead of silently dropping potentially important mail.
  return order[0].score<.65||order[0].score-order[1].score<.15 ? "uncertain" : attentionCategories[order[0].index].id as AttentionDecision;
}
export function savedAttention(mail:Mail,records:Record<string,AttentionRecord>) {
  const record=records[attentionKey(mail)];
  return record?.account===mail.account&&record.id===mail.id&&record.model===attentionModelTag&&record.fingerprint===mailFeatureFingerprint(mail)?record:undefined;
}
export const attentionText=(mail:Mail)=>mailModelText(mail);
