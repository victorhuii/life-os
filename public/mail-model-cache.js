// Use the existing Transformers cache so earlier downloads remain reusable.
export const modelCacheName='transformers-cache';
export const modelWeightsPath='/api/mail-model/onnx/model_int8.onnx';
export async function openModelCache(){
 try{return typeof caches==='undefined'?null:await caches.open(modelCacheName);}catch{return null;}
}
export async function modelCacheState(cache){
 if(!cache)return 'unavailable';
 try{const response=await cache.match(new URL(modelWeightsPath,self.location.origin).href);if(!response)return 'missing';await response.body?.cancel();return 'saved';}catch{return 'unavailable';}
}
/** Report cache reads separately from runtime progress (which also fires for cache hits). */
export function trackedModelCache(cache,onRead,onWriteFailure){
 return {
  async match(request){try{const response=await cache.match(request);if(response)onRead(new URL(typeof request==='string'?request:request.url,self.location.origin).pathname);return response;}catch{return undefined;}},
  async put(request,response){try{await cache.put(request,response);}catch{onWriteFailure();}}
 };
}
