// Only one transformer worker at a time, shared by grouping and attention checks.
let owner:symbol|null=null;
export function claimMailInference(){
 if(owner)return null;
 const token=Symbol();owner=token;
 return ()=>{if(owner===token){owner=null;window.setTimeout(()=>window.dispatchEvent(new Event('mail-inference-idle')),0);}};
}
