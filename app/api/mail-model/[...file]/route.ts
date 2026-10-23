import {getChatGPTUser} from "@/app/chatgpt-auth";
import {ensembleModels} from "@/lib/mail-ensemble";
import {semanticModel} from "@/lib/mail-learning";
import {response} from "@/lib/store";
export const dynamic="force-dynamic";
const allowed=new Set(["config.json","tokenizer.json","tokenizer_config.json","special_tokens_map.json","added_tokens.json","spm.model","onnx/model_int8.onnx"]);
/** Stream pinned public model assets. No mailbox data or Google credentials are sent upstream. */
export async function GET(request:Request){
 if(!await getChatGPTUser())return response({error:"Sign in to download the Mail Lab model."},401);
 let file=new URL(request.url).pathname.slice("/api/mail-model/".length);
 let model:{id:string;revision:string}=semanticModel;
 if(file.startsWith("ensemble/")){const [,key,...parts]=file.split("/");const selected=ensembleModels.find(item=>item.key===key);if(!selected)return response({error:"Unknown model."},404);model=selected;file=parts.join("/");}
 if(!allowed.has(file))return response({error:"Unknown model asset."},404);
 try{
  const result=await fetch(`https://huggingface.co/${model.id}/resolve/${model.revision}/${file}`,{method:request.method==="HEAD"?"HEAD":"GET",signal:AbortSignal.timeout(120000),redirect:"follow"});
  if(!result.ok)return response({error:"The public model download is temporarily unavailable. Retry shortly."},result.status===404?404:502);
  const headers=new Headers({"Content-Type":result.headers.get("Content-Type")||"application/octet-stream","Cache-Control":"private, max-age=31536000, immutable","X-Content-Type-Options":"nosniff"});
  const length=result.headers.get("Content-Length");if(length){if(Number(length)>110_000_000){await result.body?.cancel();return response({error:"The model asset exceeded its download limit."},502);}}
  return new Response(result.body,{status:200,headers});
 }catch{return response({error:"Couldn’t download the public model. Starter grouping is still available."},502);}
}
export const HEAD=GET;
