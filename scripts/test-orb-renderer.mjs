import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
const temp = new URL('../.sites-runtime/orb-tests/', import.meta.url);
mkdirSync(temp, {recursive:true});
const output = ts.transpileModule(readFileSync(new URL('../lib/orb-renderer.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
writeFileSync(new URL('renderer.mjs',temp),output);
const {paintOrb,orbAppearance}=await import(new URL('renderer.mjs',temp));
let checked=0;
for(const size of [20,44,52,150,340])for(const phase of [0,2.1,12])for(const activity of [0,1])for(const attention of [0,1]){
 const context={canvas:{},lineWidth:1,clearRect(){},fillRect(){},createRadialGradient(){return {addColorStop(){}}},beginPath(){},stroke(){},fill(){},
  moveTo(x,y){check(x,y)},lineTo(x,y){check(x,y)},arc(x,y,r){assert.ok(r>=0);check(x-r,y-r);check(x+r,y+r)} };
 function check(x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));const inset=context.lineWidth/2;assert.ok(x>=inset-1&&y>=inset-1&&x<=size-inset+1&&y<=size-inset+1,`Clipped artwork at ${size}px (phase=${phase}, activity=${activity}, attention=${attention}): ${x}, ${y}`);checked++;}
 const appearance={phase,activity,attention};paintOrb(context,size,size,appearance);assert.deepEqual(orbAppearance(context.canvas),appearance);
}
assert.deepEqual(orbAppearance(null),{phase:0,activity:0,attention:0});
console.log(`PASS: ${checked} particle/ring/mark bounds across 20–340px, idle/working/hover states and phase-preserving transitions.`);
