import {currentEnsemble,ensembleTag,majorityPrediction,voteFromScores} from "@/lib/mail-ensemble";
import {z} from "zod";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {database,response,sameOrigin,state} from "@/lib/store";
import {mailboxes,mailboxAccountSchema,type MailboxAccount} from "@/lib/life";
import {featuresOf,labelFingerprint,mailFeatureFingerprint,mainMailAccount,groupIds,validGroup,semanticTag,categoriesForModel,type TrainingExample,type PersonalModel} from "@/lib/mail-learning";
export const dynamic="force-dynamic";
const category=z.enum(["shopping","jobs","school","work","other","general","spons","me"]);
const identity={account:mailboxAccountSchema,id:z.string().min(1).max(200)};
const finite=z.number().finite();
const metrics=z.object({samples:z.number().int().min(1).max(1000),accuracy:finite.min(0).max(1),macroF1:finite.min(0).max(1),matrix:z.array(z.array(z.number().int().min(0).max(1000)).min(3).max(4)).min(3).max(4),support:z.array(z.number().int().min(0).max(1000)).min(3).max(4),trainGroups:z.number().int().nonnegative(),testGroups:z.number().int().positive()});
const modelSchema=z.object({version:z.union([z.literal(1),z.literal(2)]),account:mailboxAccountSchema.optional(),categories:z.array(category).min(3).max(4).optional(),vocabulary:z.array(z.string().max(100)).min(1).max(1600),idf:z.array(finite.min(0).max(20)).min(1).max(1600),weights:z.array(z.array(finite.min(-100).max(100)).min(1).max(1600)).min(3).max(4),bias:z.array(finite.min(-100).max(100)).min(3).max(4),trainedAt:z.string().datetime(),examples:z.number().int().min(8).max(1000),labelFingerprint:z.string().max(30),metrics:metrics.nullable()}).refine(model=>new Set(model.vocabulary).size===model.vocabulary.length && model.idf.length===model.vocabulary.length && model.weights.every(row=>row.length===model.vocabulary.length),"Invalid feature dimensions");
const examplesOf=(labels:any[],account:MailboxAccount):TrainingExample[]=>labels.filter(label=>label.account===account).map(label=>({...label.features,key:label.key,label:label.label}));
export async function classifierState(){
 const rows=await database().prepare("SELECT id,kind,payload FROM life_records WHERE kind IN ('mail_label','mail_prediction','mail_model','mail_control') ORDER BY updated_at DESC LIMIT 2200").all<{id:string;kind:string;payload:string}>();
 // Retain obsolete records in storage, but never treat a label from a different taxonomy as reviewed.
 const labels=rows.results.filter(row=>row.kind==="mail_label").map(row=>JSON.parse(row.payload)).filter(value=>mailboxAccountSchema.safeParse(value.account).success&&validGroup(value.account,value.label));
 const predictions=Object.fromEntries(rows.results.filter(row=>row.kind==="mail_prediction").map(row=>JSON.parse(row.payload)).filter(value=>mailboxAccountSchema.safeParse(value.account).success&&validGroup(value.account,value.label)&&(value.model===semanticTag(value.account)||currentEnsemble(value,value.account,value.fingerprint))&&value.scores?.length===groupIds(value.account).length).map(value=>[value.key,value]));
 const mainExamples=examplesOf(labels,mainMailAccount);
 const models=rows.results.filter(row=>row.kind==="mail_model").map(row=>JSON.parse(row.payload)).flatMap(record=>{
  const account=record.account||record.model.account||mainMailAccount;
  if(!mailboxAccountSchema.safeParse(account).success)return [];
  // Older global models are compatible only when their entire reviewed dataset was Main.
  if(!record.account&&!record.model.account&&(record.model.examples!==mainExamples.length||record.model.labelFingerprint!==labelFingerprint(mainExamples)))return [];
  if(JSON.stringify(categoriesForModel(record.model))!==JSON.stringify(groupIds(account))||record.model.weights.length!==groupIds(account).length||record.model.bias.length!==groupIds(account).length)return [];
  return [{...record,account}];
 });
 const activeIdsByAccount=Object.fromEntries(mailboxes.map(box=>{
  const selected=rows.results.find(row=>row.id===`mail-classifier:active:${box.account}`)||(box.account===mainMailAccount?rows.results.find(row=>row.id==="mail-classifier:active"):undefined);
  const id=selected?JSON.parse(selected.payload).id:null;
  return [box.account,models.some(record=>record.id===id&&record.account===box.account)?id:null];
 }));
 const modelsByAccount=Object.fromEntries(mailboxes.map(box=>[box.account,(models.find(record=>record.id===activeIdsByAccount[box.account]&&record.account===box.account)?.model||null) as PersonalModel|null]));
 return {labels,predictions,models:models.map(({model,...record})=>({...record,examples:model.examples,metrics:model.metrics})),modelsByAccount,activeIdsByAccount,model:modelsByAccount[mainMailAccount],activeId:activeIdsByAccount[mainMailAccount]};
}
export async function GET(){if(!await getChatGPTUser())return response({error:"Sign in to V.E.C.T.O.R. to open Mail Lab."},401);try{return response(await classifierState());}catch{return response({error:"Couldn’t load Mail Lab. Your saved labels are preserved."},503);}}
export async function POST(request:Request){
 if(!sameOrigin(request)||!await getChatGPTUser())return response({error:"Sign in to V.E.C.T.O.R. to save labels or models."},403);
 try{
  const raw=await request.text();if(raw.length>500000)return response({error:"Request too large."},413);
  const body=z.discriminatedUnion("action",[
   z.object({action:z.literal("label"),...identity,label:category}),z.object({action:z.literal("unlabel"),...identity}),
   z.object({action:z.literal("vote"),...identity,model:z.string().max(40),scores:z.array(finite.min(0).max(1)).min(3).max(4),fingerprint:z.string().max(30)}),
   z.object({action:z.literal("prediction"),...identity,label:category,score:finite.min(0).max(1),scores:z.array(finite.min(0).max(1)).min(3).max(4),fingerprint:z.string().max(30),model:z.string().max(100)}),
   z.object({action:z.literal("model"),account:mailboxAccountSchema.default(mainMailAccount),model:modelSchema}),z.object({action:z.literal("activate"),account:mailboxAccountSchema.default(mainMailAccount),id:z.string().uuid().nullable()}),
  ]).parse(JSON.parse(raw));
  const db=database(),now=new Date().toISOString();
  if(body.action==="vote"){
   const snapshot=await state(),mail=snapshot.emails.find(mail=>mail.id===body.id&&mail.account===body.account);
   if(!mail)return response({error:"Refresh this inbox before classifying this message."},404);
   if(body.fingerprint!==mailFeatureFingerprint(mail))return response({error:"This email changed. Retry classification."},409);
   const vote=voteFromScores(body.account,body.model,body.scores),key=`${body.account}:${body.id}`,id=`mail-prediction:${key}`;
   // Sequential votes merge into one resumable record. Manual labels are a separate record and always win.
   for(let attempt=0;attempt<5;attempt++){
    const existing=await db.prepare("SELECT payload FROM life_records WHERE id=? AND kind='mail_prediction'").bind(id).first<{payload:string}>();
    const old=existing?JSON.parse(existing.payload):undefined;
    const votes=currentEnsemble(old,body.account,body.fingerprint)?old.votes.filter((item:{model:string})=>item.model!==vote.model):[];
    const value={...majorityPrediction(body.account,[...votes,vote]),account:body.account,id:body.id,key,fingerprint:body.fingerprint,model:ensembleTag(body.account),updatedAt:now};
    if(!existing){const count=await db.prepare("SELECT COUNT(*) AS count FROM life_records WHERE kind='mail_prediction'").first<{count:number}>();if((count?.count||0)>=1000)return response({error:"Prediction storage is full. Your saved labels are preserved."},409);}
    // Compare-and-swap preserves other votes if two browser tabs classify the same message.
    const write=existing?await db.prepare("UPDATE life_records SET payload=?,updated_at=? WHERE id=? AND kind='mail_prediction' AND payload=?").bind(JSON.stringify(value),now,id,existing.payload).run():await db.prepare("INSERT OR IGNORE INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail_prediction',?,?)").bind(id,JSON.stringify(value),now).run();
    if(write.meta.changes)return response({ok:true,prediction:value});
   }
   return response({error:"Another tab updated these votes. Resume to retry."},409);
  }

  if(body.action==="label"||body.action==="unlabel"||body.action==="prediction"){
   const key=`${body.account}:${body.id}`;
   if(body.action==="unlabel"){await db.prepare("DELETE FROM life_records WHERE id=? AND kind='mail_label'").bind(`mail-label:${key}`).run();return response({ok:true});}
   if(!validGroup(body.account,body.label))return response({error:"Choose a category for this inbox."},400);
   if(body.action==="prediction"&&(body.model!==semanticTag(body.account)||body.scores.length!==groupIds(body.account).length))return response({error:"The model prediction belongs to a different inbox taxonomy."},400);
   const snapshot=await state();let mail=snapshot.emails.find(mail=>mail.id===body.id&&mail.account===body.account);
   if(!mail && body.action==="label"){const old=await db.prepare("SELECT payload FROM life_records WHERE id=? AND kind='mail_label'").bind(`mail-label:${key}`).first<{payload:string}>();if(old)mail={...JSON.parse(old.payload).features};}
   if(!mail)return response({error:"Refresh this inbox before classifying this message."},404);
   if(body.action==="prediction" && body.fingerprint!==mailFeatureFingerprint(mail))return response({error:"This message changed. Run classification again."},409);
   const value=body.action==="label"?{key,id:body.id,account:body.account,label:body.label,features:featuresOf(mail),updatedAt:now}:{...body,key,updatedAt:now};
   const kind=body.action==="label"?"mail_label":"mail_prediction",id=`${body.action==="label"?"mail-label":"mail-prediction"}:${key}`;
   const count=await db.prepare("SELECT COUNT(*) AS count FROM life_records WHERE kind=?").bind(kind).first<{count:number}>();
   const existing=await db.prepare("SELECT id FROM life_records WHERE id=? AND kind=?").bind(id,kind).first();
   if((count?.count||0)>=1000&&!existing)return response({error:"The lab holds up to 1,000 reviewed labels or predictions. Remove older labels or export your dataset."},409);
   await db.prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(id,kind,JSON.stringify(value),now).run();
  }else if(body.action==="model"){
   const categories=groupIds(body.account),model=body.model;
   if((model.account||mainMailAccount)!==body.account||JSON.stringify(categoriesForModel(model))!==JSON.stringify(categories)||model.bias.length!==categories.length||model.weights.length!==categories.length||model.metrics&&(model.metrics.matrix.length!==categories.length||model.metrics.matrix.some(row=>row.length!==categories.length)||model.metrics.support.length!==categories.length))return response({error:"The trained model must use this inbox’s exact categories."},400);
   const current=await classifierState(),examples=examplesOf(current.labels,body.account);
   if(examples.length<8||new Set(examples.map(example=>example.label)).size<2)return response({error:"Review at least 8 emails in this inbox across 2 categories before training."},400);
   if(examples.length!==model.examples||labelFingerprint(examples)!==model.labelFingerprint)return response({error:"This inbox’s reviewed dataset changed during training. Train again with its latest labels."},409);
   const id=crypto.randomUUID(),record={id,account:body.account,createdAt:now,model:{...model,account:body.account,categories,trainedAt:now}};
   await db.batch([db.prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail_model',?,?)").bind(`mail-model:${id}`,JSON.stringify(record),now),db.prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail_control',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(`mail-classifier:active:${body.account}`,JSON.stringify({id}),now)]);
   await db.prepare("DELETE FROM life_records WHERE kind='mail_model' AND json_extract(payload,'$.account')=? AND id NOT IN (SELECT id FROM life_records WHERE kind='mail_model' AND json_extract(payload,'$.account')=? ORDER BY updated_at DESC LIMIT 5)").bind(body.account,body.account).run();
  }else{
   if(body.id&&!(await classifierState()).models.some(model=>model.id===body.id&&model.account===body.account))return response({error:"Choose a model trained for this inbox."},404);
   await db.prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail_control',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(`mail-classifier:active:${body.account}`,JSON.stringify({id:body.id}),now).run();
  }
  return response({ok:true});
 }catch{return response({error:"Couldn’t save this classifier update. Check the values and try again."},400);}
}
