import {openModelCache,modelCacheState,trackedModelCache} from "/mail-model-cache.js";
// Optional, pinned Transformers.js runtime and pinned public model weights.
// Inference receives text through postMessage only. Text is never used in a network request.
let classifier;
self.onmessage=async({data})=>{
 try{
  if(data.action==='load'){
   const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
   const cache=await openModelCache(),cacheHits=new Set();let cacheWriteFailed=false;
   env.useBrowserCache=false;
   env.useCustomCache=!!cache;
   if(cache)env.customCache=trackedModelCache(cache,path=>cacheHits.add(path),()=>{cacheWriteFailed=true;self.postMessage({type:'cache',state:'unavailable'});});
   env.allowLocalModels=false;
   env.remoteHost=self.location.origin;
   const model=data.model||{id:"Xenova/nli-deberta-v3-xsmall",revision:"2a4f614a701367a02d51389039afc998faeda637",key:"deberta"};
   const assetPath=model.key==="deberta"?"/api/mail-model/":`/api/mail-model/ensemble/${model.key}/`;
   env.remotePathTemplate=assetPath;
   env.backends.onnx.wasm.numThreads=1;
   env.backends.onnx.wasm.proxy=false;
   classifier=await pipeline('zero-shot-classification',model.id,{revision:model.revision,dtype:'int8',device:'wasm',progress_callback:progress=>{if(progress.status==='progress')self.postMessage({type:'progress',source:cacheHits.has(assetPath+progress.file)?'cache':'download',file:progress.file,progress:progress.progress});}});
   const saved=await modelCacheState(cache);
   self.postMessage({type:'cache',state:saved==='missing'&&cacheWriteFailed?'unavailable':saved});
   self.postMessage({type:'ready'});
  }else if(data.action==='classify'){
   if(!classifier)throw Error('Load the model first.');
   if(!Array.isArray(data.categories)||data.categories.length<3||data.categories.length>4)throw Error('Choose this inbox’s categories.');
   const labels=data.categories.map(category=>category.description);
   const result=await classifier(data.text,labels,{hypothesis_template:data.task==='attention'?'The recipient {}.':'This email is about {}.',multi_label:data.task==='attention'});
   const scores=labels.map(label=>result.scores[result.labels.indexOf(label)]||0),winner=scores.indexOf(Math.max(...scores));
   self.postMessage({type:'result',id:data.id,label:data.categories[winner].id,score:scores[winner],scores});
  }
 }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'The model could not run on this device.'});}
};
