import {groupIds,groupsForAccount,semanticModel,semanticTag,type MailGroup,type MailPrediction} from "./mail-learning";
import type {MailboxAccount} from "./life";
export const ensembleModels=[
 {key:'deberta',name:'DeBERTa',...semanticModel},
 {key:'distilbert-v1',name:'DistilBERT',id:'Xenova/distilbert-base-uncased-mnli',revision:'fddd480db7392a87114a6813c6acb5ede13ff4ee',url:'https://huggingface.co/Xenova/distilbert-base-uncased-mnli'},
 {key:'mobilebert-v1',name:'MobileBERT',id:'Xenova/mobilebert-uncased-mnli',revision:'8b0ea66ab7b190bba77418ba03b67d69cfc9a1ee',url:'https://huggingface.co/Xenova/mobilebert-uncased-mnli'},
] as const;
export type ModelVote={model:string;label:MailGroup;scores:number[]};
export const ensembleTag=(account:MailboxAccount)=>`${semanticTag(account)}:ensemble-v1`;
export function voteFromScores(account:MailboxAccount,model:string,scores:number[]):ModelVote{
 const categories=groupIds(account);
 if(!ensembleModels.some(candidate=>candidate.key===model)||scores.length!==categories.length||scores.some(score=>!Number.isFinite(score)||score<0||score>1)||Math.abs(scores.reduce((a,b)=>a+b,0)-1)>.02)throw Error('Invalid model vote');
 return {model,label:categories[scores.indexOf(Math.max(...scores))],scores};
}
export function majorityPrediction(account:MailboxAccount,votes:ModelVote[]):MailPrediction{
 if(!votes.length||votes.length>3||new Set(votes.map(vote=>vote.model)).size!==votes.length)throw Error('Each distinct model gets one vote');
 const checked=votes.map(vote=>voteFromScores(account,vote.model,vote.scores)),categories=groupIds(account);
 const counts=categories.map(category=>checked.filter(vote=>vote.label===category).length),agreement=Math.max(...counts);
 // Ties get a deterministic provisional suggestion; only 2/3 or 3/3 is a majority.
 const means=categories.map((_,i)=>checked.reduce((sum,vote)=>sum+vote.scores[i],0)/checked.length);
 const winner=categories.map((_,i)=>i).sort((a,b)=>counts[b]-counts[a]||means[b]-means[a]||a-b)[0];
 return {label:categories[winner],score:agreement/3,scores:means,method:'ensemble',votes:checked,agreement,needsReview:checked.length<3||agreement<2};
}
export function currentEnsemble(record:(MailPrediction&{model:string;fingerprint:string})|undefined,account:MailboxAccount,fingerprint:string){
 if(!record||record.model!==ensembleTag(account)||record.fingerprint!==fingerprint)return false;
 try{const computed=majorityPrediction(account,record.votes||[]);return record.scores.length===groupIds(account).length&&computed.label===record.label&&record.votes!.every(vote=>vote.label===voteFromScores(account,vote.model,vote.scores).label);}catch{return false;}
}

/** Concise positive hypotheses avoid long negations confusing NLI models. */
export function ensembleCategories(account:MailboxAccount){
 const descriptions:Partial<Record<MailGroup,string>>=account==='huiv@berkeley.edu'?{
  school:'school classes, academic assignments or university student services',
  jobs:'applying for a new job, recruiting candidates or scheduling a job interview',
  work:'workplace duties, employee surveys, coworkers or tasks at the recipient’s current job',
  other:'personal correspondence, shopping, security notifications or general news',
 }:{};
 return groupsForAccount(account).map(group=>({id:group.id,description:descriptions[group.id]||group.description}));
}
