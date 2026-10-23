import {z} from "zod";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {database,response,sameOrigin,state} from "@/lib/store";
import {mailboxAccountSchema} from "@/lib/life";
import {mailFeatureFingerprint} from "@/lib/mail-learning";
import {attentionAccount,attentionDecision,attentionModelTag,type AttentionRecord} from "@/lib/mail-attention";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!await getChatGPTUser())return response({error:"Sign in to check email attention."},401);
 const account=new URL(request.url).searchParams.get("account")||"";
 if(!attentionAccount(account))return response({error:"Choose a connected inbox."},400);
 try{const rows=await database().prepare("SELECT payload FROM life_records WHERE kind='mail_attention' AND json_extract(payload,'$.account')=?").bind(account).all<{payload:string}>();
 return response({records:rows.results.map(row=>JSON.parse(row.payload) as AttentionRecord).filter(record=>record.model===attentionModelTag)});
 }catch{return response({error:"Couldn’t load saved attention checks."},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request)||!await getChatGPTUser())return response({error:"Sign in to save attention checks."},403);
 try{
 const raw=await request.text();if(raw.length>2000)return response({error:"Request too large."},413);
 const input=z.object({account:mailboxAccountSchema,id:z.string().min(1).max(200),fingerprint:z.string().max(30),model:z.literal(attentionModelTag),scores:z.array(z.number().finite().min(0).max(1)).length(3)}).strict().parse(JSON.parse(raw));
 if(!attentionAccount(input.account))return response({error:"Choose a connected inbox."},400);
 const mail=(await state()).emails.find(mail=>mail.account===input.account&&mail.id===input.id);
 if(!mail)return response({error:"Refresh this inbox before checking attention."},404);
 if(input.fingerprint!==mailFeatureFingerprint(mail))return response({error:"This email changed. Check attention again."},409);
 const record={...input,decision:attentionDecision(input.scores,mail),updatedAt:new Date().toISOString()};
 await database().prepare("INSERT INTO life_records(id,kind,payload,updated_at) VALUES (?,'mail_attention',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(`mail-attention:${input.account}:${input.id}`,JSON.stringify(record),record.updatedAt).run();
 // Keep the newest 2,000 checks per inbox; old checks can always be recomputed.
 await database().prepare("DELETE FROM life_records WHERE kind='mail_attention' AND json_extract(payload,'$.account')=? AND id NOT IN (SELECT id FROM life_records WHERE kind='mail_attention' AND json_extract(payload,'$.account')=? ORDER BY updated_at DESC LIMIT 2000)").bind(input.account,input.account).run();
 return response({record});
 }catch{return response({error:"Couldn’t save the attention check."},400);}
}
