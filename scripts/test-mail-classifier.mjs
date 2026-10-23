import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
const tmp=new URL('../.sites-runtime/mail-classifier-tests/',import.meta.url);mkdirSync(tmp,{recursive:true});
const imports={'@/app/chatgpt-auth':'./auth.mjs','cloudflare:workers':'./env.mjs'};for(const name of ['life','store','mail-learning','mail-lab-state','mail-ensemble']){imports['@/lib/'+name]='./'+name+'.mjs';imports['./'+name]='./'+name+'.mjs';}
for(const [name,file]of Object.entries({'mail-ensemble':'lib/mail-ensemble.ts','mail-lab-state':'lib/mail-lab-state.ts',life:'lib/life.ts',store:'lib/store.ts','mail-learning':'lib/mail-learning.ts',route:'app/api/mail-classifier/route.ts',assets:'app/api/mail-model/[...file]/route.ts'}))writeFileSync(new URL(name+'.mjs',tmp),ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from "([^"]+)"/g,(all,spec)=>imports[spec]?`from "${imports[spec]}"`:all));
writeFileSync(new URL('auth.mjs',tmp),'export const getChatGPTUser=async()=>globalThis.signedIn?{userId:"owner"}:null;');
writeFileSync(new URL('env.mjs',tmp),`import{DatabaseSync}from'node:sqlite';export const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE life_records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL)');function statement(sql,args=[]){return{bind:(...values)=>statement(sql,values),first:async()=>sqlite.prepare(sql).get(...args)||null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:sqlite.prepare(sql).run(...args)})};}export const env={DB:{prepare:sql=>statement(sql),batch:async ops=>{sqlite.exec('BEGIN');try{for(const op of ops)await op.run();sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}}}};`);
const learning=await import(new URL('mail-learning.mjs',tmp)),{sqlite}=await import(new URL('env.mjs',tmp)),route=await import(new URL('route.mjs',tmp)),{state}=await import(new URL('store.mjs',tmp));
const examples=learning.mailGroups.flatMap((group,c)=>Array.from({length:4},(_,i)=>({key:`victorhui94@gmail.com:${c}${i}`,label:group.id,sender:`Person <person-${c}-${i}@example.test>`,subject:learning.starterExamples.filter(row=>row.label===group.id)[i].subject,summary:'Reviewed example '+i})));
const split=learning.splitReviewed(examples);assert.ok(split.test.length>=4);assert.ok(!split.test.some(row=>split.train.some(other=>other.sender===row.sender)));assert.ok(!split.test.some(row=>split.train.some(other=>other.subject===row.subject)));
const model=learning.trainPersonalModel(examples);assert.equal(model.examples,16);assert.equal(model.metrics.samples,split.test.length);assert.equal(model.metrics.matrix.flat().reduce((a,b)=>a+b,0),model.metrics.samples);assert.equal(model.labelFingerprint,learning.labelFingerprint(examples));
assert.ok(model.weights.flat().every(Number.isFinite));
for(const [subject,expected]of [['Your technical interview for the internship role','jobs'],['Homework assignment due in bCourses','school'],['Shop our store sale discount code','shopping'],['Security alert password verification code','other']])assert.equal(learning.predictMail({sender:'',subject,summary:''}).label,expected);
assert.throws(()=>learning.trainPersonalModel(examples.slice(0,4)),/at least 8/);
const duplicates=examples.map(row=>({...row,sender:'same@example.test',subject:'re: Shared subject'}));assert.equal(learning.splitReviewed(duplicates).test.length,0,'Never report leaked holdout results');
globalThis.signedIn=true;const post=(body,origin='https://vector.test')=>route.POST(new Request('https://vector.test/api/mail-classifier',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)}));
const account='victorhui94@gmail.com',other='huiv@berkeley.edu';
for(const [i,example]of examples.entries()){const id=i.toString(16),mail={id,account,sender:example.sender,subject:example.subject,summary:example.summary,receivedAt:new Date().toISOString(),priority:'normal',url:'https://mail.google.com/'};sqlite.prepare('INSERT INTO life_records VALUES (?,?,?,?)').run(`mail:${account}:${id}`,'mail',JSON.stringify(mail),new Date().toISOString());assert.equal((await post({action:'label',account,id,label:example.label})).status,200);}
let saved=await(await route.GET()).json();assert.equal(saved.labels.length,16);
assert.equal((await post({action:'label',account:other,id:'0',label:'jobs'})).status,404,'No cross-account labeling by provider ID collision');
assert.equal((await post({action:'label',account,id:'0',label:'unknown'})).status,400);
assert.equal((await post({action:'label',account,id:'0',label:'jobs'},'https://attacker.test')).status,403);
const gold=saved.labels.map(row=>({...row.features,key:row.key,label:row.label})),trained=learning.trainPersonalModel(gold);
assert.equal((await post({action:'model',model:trained})).status,200);saved=await(await route.GET()).json();assert.ok(saved.activeId);assert.equal(saved.model.labelFingerprint,trained.labelFingerprint);
assert.equal((await post({action:'model',model:{...trained,labelFingerprint:'stale'}})).status,409);
assert.equal((await post({action:'model',model:{...trained,idf:[1]}})).status,400);
assert.equal((await post({action:'activate',id:null})).status,200);assert.equal((await(await route.GET()).json()).model,null);
const mail=(await state()).emails.find(row=>row.id==='0');const prediction={action:'prediction',account,id:'0',label:'jobs',score:.8,scores:[.05,.8,.1,.05],fingerprint:learning.mailFeatureFingerprint(mail),model:learning.semanticModel.tag};
assert.equal((await post({...prediction,fingerprint:'wrong'})).status,409);assert.equal((await post(prediction)).status,200);
assert.equal((await post({action:'unlabel',account,id:'0'})).status,200);assert.equal((await(await route.GET()).json()).labels.length,15);
assert.ok(!JSON.stringify(await state()).includes('vocabulary'),'Training data and models do not leak into dashboard state');
globalThis.signedIn=false;assert.equal((await route.GET()).status,401);assert.equal((await post(prediction)).status,403);
// Each inbox gets its own taxonomy, predictions, training dataset, and active model.
const berk='huiv@berkeley.edu',hacks='vhui@hackberkeley.org';globalThis.signedIn=true;
assert.deepEqual(learning.groupsForAccount(berk).map(group=>group.label),['School','Job','Work','Random']);
assert.deepEqual(learning.groupsForAccount(hacks).map(group=>group.label),['General','Spons','Me']);
assert.deepEqual(learning.groupsForAccount(account).map(group=>group.label),['Promotion / shopping','Jobs','School','Other / random']);
for(const [owner,subject,expected] of [[berk,'Lecture assignment bCourses professor','school'],[berk,'Software internship technical interview recruiter','jobs'],[berk,'Shop our store discount code sale','other'],[berk,'Your manager requested the weekly project status report','work'],[berk,'Complete the employee pulse survey','work'],[hacks,'Company sponsorship partnership proposal sponsor package','spons'],[hacks,'Cal Hacks team all hands event logistics update','general'],[hacks,'Victor can you personally send your bio and headshot','me']]){
 const prediction=learning.predictMail({account:owner,sender:'',subject,summary:''});assert.equal(prediction.label,expected);assert.equal(prediction.scores.length,learning.groupIds(owner).length);
 assert.equal(learning.predictMail({account:owner,sender:'',subject,summary:''},trained).label,expected,'Wrong-inbox models are never applied');
}
const makeExamples=owner=>learning.groupsForAccount(owner).flatMap((group,c)=>Array.from({length:4},(_,i)=>({key:owner+':'+(c*4+i).toString(16),label:group.id,sender:`Example <${c}-${i}@fixture.test>`,subject:learning.examplesForAccount(owner).filter(row=>row.label===group.id)[i].subject,summary:'Independent example'})));
for(const owner of [berk,hacks]){
 const rows=makeExamples(owner);
 for(const example of rows){const id=example.key.slice(owner.length+1);const mail={id,account:owner,sender:example.sender,subject:example.subject,summary:example.summary,receivedAt:new Date().toISOString(),priority:'normal',url:'https://mail.google.com/'};sqlite.prepare('INSERT INTO life_records VALUES (?,?,?,?)').run('mail:'+owner+':'+id,'mail',JSON.stringify(mail),new Date().toISOString());assert.equal((await post({action:'label',account:owner,id,label:example.label})).status,200);}
 const model=learning.trainPersonalModel(rows,owner);assert.equal(model.categories.length,learning.groupIds(owner).length);assert.equal(model.weights.length,learning.groupIds(owner).length);assert.equal(model.metrics.matrix.length,learning.groupIds(owner).length);
 assert.equal((await post({action:'model',account:owner,model})).status,200);
 const current=await(await route.GET()).json();assert.equal(current.modelsByAccount[owner].account,owner);assert.equal(current.modelsByAccount[owner].examples,rows.length);
 assert.equal((await post({action:'activate',account,id:current.activeIdsByAccount[owner]})).status,404,'Models cannot cross inboxes');
 assert.equal((await post({action:'model',account:owner,model:trained})).status,400);
 assert.throws(()=>learning.trainPersonalModel(rows,account),/belong to this inbox/);
}
assert.equal((await post({action:'label',account:berk,id:'0',label:'shopping'})).status,400);
assert.equal((await post({action:'label',account:hacks,id:'0',label:'school'})).status,400);
assert.equal((await post({action:'label',account,id:'0',label:'spons'})).status,400);
const berkMail=(await state()).emails.find(row=>row.account===berk&&row.id==='0');
const oldPrediction={...prediction,account:berk,fingerprint:learning.mailFeatureFingerprint(berkMail)};
assert.equal((await post(oldPrediction)).status,400,'Old four-class predictions cannot be used for Berk');
assert.equal((await post({...oldPrediction,label:'school',score:.8,scores:[.8,.1,.05,.05],model:learning.semanticTag(berk)})).status,200);
// Preserve compatible Main legacy models but ignore legacy mixed-inbox models and obsolete Cal Hacks labels.
const mainOnly=(await(await route.GET()).json()).labels.filter(row=>row.account===account).map(row=>({...row.features,key:row.key,label:row.label}));
const mainLegacy=learning.trainPersonalModel(mainOnly);delete mainLegacy.account;delete mainLegacy.categories;mainLegacy.version=1;
const legacyId=crypto.randomUUID();sqlite.prepare('INSERT INTO life_records VALUES (?,?,?,?)').run('mail-model:'+legacyId,'mail_model',JSON.stringify({id:legacyId,createdAt:new Date().toISOString(),model:mainLegacy}),new Date().toISOString());
assert.ok((await(await route.GET()).json()).models.some(model=>model.id===legacyId));
const mixedId=crypto.randomUUID();sqlite.prepare('INSERT INTO life_records VALUES (?,?,?,?)').run('mail-model:'+mixedId,'mail_model',JSON.stringify({id:mixedId,createdAt:new Date().toISOString(),model:{...mainLegacy,labelFingerprint:'old-mixed-data'}}),new Date().toISOString());
assert.ok(!(await(await route.GET()).json()).models.some(model=>model.id===mixedId));
sqlite.prepare('INSERT INTO life_records VALUES (?,?,?,?)').run('mail-label:'+hacks+':old','mail_label',JSON.stringify({account:hacks,id:'old',key:hacks+':old',label:'school',features:{sender:'',subject:'Legacy',summary:''}}),new Date().toISOString());
assert.ok(!(await(await route.GET()).json()).labels.some(label=>label.id==='old'));
const ids=(await(await route.GET()).json()).activeIdsByAccount;assert.equal((await post({action:'activate',account:berk,id:null})).status,200);assert.equal((await(await route.GET()).json()).activeIdsByAccount[hacks],ids[hacks]);
// Expanding Berk's taxonomy preserves reviewed data and rejects old model dimensions.
assert.equal(learning.validGroup(account,'work'),false);assert.equal(learning.validGroup(hacks,'work'),false);
assert.equal((await post({action:'label',account,id:'0',label:'work'})).status,400);
assert.equal((await post({action:'label',account:berk,id:'0',label:'work'})).status,200);
const obsoleteBerkId=crypto.randomUUID(),obsoleteBerk={...learning.trainPersonalModel(makeExamples(berk),berk),categories:['school','jobs','other']};
sqlite.prepare('INSERT INTO life_records VALUES (?,?,?,?)').run('mail-model:'+obsoleteBerkId,'mail_model',JSON.stringify({id:obsoleteBerkId,account:berk,createdAt:new Date().toISOString(),model:obsoleteBerk}),new Date().toISOString());
assert.ok(!(await(await route.GET()).json()).models.some(row=>row.id===obsoleteBerkId),'Old Berk taxonomies must be retrained before activation');
assert.equal(learning.predictMail({account:berk,sender:'',subject:'Your manager requested the weekly project status report',summary:''},obsoleteBerk).label,'work','Old same-inbox models safely fall back to the updated starter');
assert.ok((await(await route.GET()).json()).labels.some(row=>row.account===berk&&row.id==='0'&&row.label==='work'),'Reviewed Work labels persist');
assert.equal((await post({...oldPrediction,label:'school',scores:[.8,.1,.1],model:'deberta-xsmall-v1:berk-v2'})).status,400);
// Pinned public weights use a narrow, authenticated streaming proxy; no arbitrary fetch target.
globalThis.signedIn=false;const assets=await import(new URL('assets.mjs',tmp));let upstream=[];
globalThis.fetch=async(url,init)=>{upstream.push({url,init});return new Response('{"model":"fixture"}',{headers:{'Content-Type':'application/json'}});};
assert.equal((await assets.GET(new Request('https://vector.test/api/mail-model/config.json'))).status,401);
globalThis.signedIn=true;
assert.equal((await assets.GET(new Request('https://vector.test/api/mail-model/unknown'))).status,404);
const asset=await assets.GET(new Request('https://vector.test/api/mail-model/config.json'));
assert.equal(asset.status,200);assert.equal(await asset.text(),'{"model":"fixture"}');
assert.ok(upstream[0].url.includes(learning.semanticModel.revision+'/config.json'));
assert.ok(!upstream[0].init.headers,'No Google tokens or email data are forwarded');
assert.equal(upstream.length,1);
console.log('PASS: per-inbox category sets/starter inference/model training/holdouts, cross-account rejection, separate activation, compatible legacy migration; learned starter predictions, personal training, grouped holdout/no leakage, label persistence/account isolation, dataset fingerprint, rollback, stale inference rejection, auth/CSRF, pinned streaming weights and no arbitrary proxy URLs.');

// UI counts and classification coverage always project the selected current inbox.
const {inboxLabSnapshot}=await import(new URL('mail-lab-state.mjs',tmp));
const fixture=(owner,id,extra={})=>({account:owner,id,sender:'Fixture',subject:'Test '+id,summary:'Text',...extra});
const current=[...Array.from({length:6},(_,i)=>fixture(account,String(i))),fixture(account,'hidden',{hidden:true}),fixture(berk,'0'),fixture(berk,'1'),fixture(hacks,'0')];
const labels=[...Array.from({length:4},(_,i)=>({account,id:String(i),key:account+':'+i,label:'jobs',updatedAt:'2026-10-19'})),...['hidden','old','older'].map(id=>({account,id,key:account+':'+id,label:'school',updatedAt:'2026-10-19'})),{account:berk,id:'0',key:berk+':0',label:'school',updatedAt:'2026-10-19'}];
const ensemble=await import(new URL('mail-ensemble.mjs',tmp));
const cache={};
const snapshot=owner=>inboxLabSnapshot(current,labels,cache,owner);
assert.equal(snapshot(account).labels.length,7);assert.equal(snapshot(account).reviewed.length,4);assert.equal(snapshot(account).current.length,6);assert.equal(snapshot(account).pending.length,2);
assert.equal(snapshot(berk).reviewed.length,1);assert.equal(snapshot(berk).pending.length,1);assert.equal(snapshot(hacks).reviewed.length,0);assert.equal(snapshot(hacks).pending.length,1);
for(const mail of current.filter(m=>m.account===account&&!m.hidden))cache[mail.account+':'+mail.id]={...ensemble.majorityPrediction(account,ensemble.ensembleModels.map(model=>ensemble.voteFromScores(account,model.key,[0,.8,.1,.1]))),fingerprint:learning.mailFeatureFingerprint(mail),model:ensemble.ensembleTag(account)};
assert.equal(snapshot(account).pending.length,0,'Saved predictions restore completed coverage after reload');assert.equal(snapshot(berk).pending.length,1,'Main completion cannot complete Berk');
current.find(m=>m.id==='5').summary='Changed preview';assert.equal(snapshot(account).pending.length,1,'Changed frontend mail invalidates saved coverage');
cache[account+':5'].fingerprint=learning.mailFeatureFingerprint(current.find(m=>m.id==='5'));cache[account+':5'].scores=[1,0,0];assert.equal(snapshot(account).pending.length,1,'Invalid taxonomy dimensions are not counted');
labels.push({...labels[0],updatedAt:'2026-10-20'});assert.equal(snapshot(account).reviewed.length,4,'Duplicate saved rows cannot inflate reviewed counts');
console.log('Mail Lab selected-inbox counts and coverage passed.');

// A real majority is computed from distinct model outputs, with resumable partial votes.
const votes=[ensemble.voteFromScores(account,'deberta',[.1,.7,.1,.1]),ensemble.voteFromScores(account,'distilbert-v1',[.1,.1,.7,.1]),ensemble.voteFromScores(account,'mobilebert-v1',[.1,.7,.1,.1])];
assert.equal(ensemble.majorityPrediction(account,votes).label,'jobs');assert.equal(ensemble.majorityPrediction(account,votes).agreement,2);assert.equal(ensemble.majorityPrediction(account,votes).needsReview,false);
assert.equal(ensemble.majorityPrediction(account,[votes[0]]).needsReview,true);
assert.equal(ensemble.majorityPrediction(account,[votes[0],votes[1],ensemble.voteFromScores(account,'mobilebert-v1',[.7,.1,.1,.1])]).needsReview,true,'Three-way splits are flagged');
assert.throws(()=>ensemble.majorityPrediction(account,[votes[0],votes[0]]),/distinct/);
assert.throws(()=>ensemble.voteFromScores(hacks,'deberta',[.1,.7,.1,.1]),/Invalid/);
assert.throws(()=>ensemble.voteFromScores(account,'fake',[.1,.7,.1,.1]),/Invalid/);
assert.throws(()=>ensemble.voteFromScores(account,'deberta',[.9,.9,.9,.9]),/Invalid/);
const voteBody={action:'vote',account,id:'0',fingerprint:learning.mailFeatureFingerprint(mail),model:'deberta',scores:[.1,.7,.1,.1]};
assert.equal((await post({...voteBody,fingerprint:'stale'})).status,409);
assert.equal((await post({...voteBody,model:'fake'})).status,400);
assert.equal((await post({...voteBody},'https://evil.test')).status,403);
globalThis.signedIn=false;assert.equal((await post(voteBody)).status,403);globalThis.signedIn=true;
for(const vote of votes){const result=await post({...voteBody,model:vote.model,scores:vote.scores});assert.equal(result.status,200);}
let voteRecord=(await(await route.GET()).json()).predictions[account+':0'];assert.equal(voteRecord.votes.length,3);assert.equal(voteRecord.label,'jobs');assert.equal(voteRecord.agreement,2);
await post(voteBody);voteRecord=(await(await route.GET()).json()).predictions[account+':0'];assert.equal(voteRecord.votes.length,3,'Repeated votes replace, never inflate');
assert.equal((await post({action:'label',account,id:'0',label:'shopping'})).status,200);await post(voteBody);assert.ok((await(await route.GET()).json()).labels.some(label=>label.account===account&&label.id==='0'&&label.label==='shopping'),'Voting never changes manual training labels');
assert.equal((await assets.GET(new Request('https://vector.test/api/mail-model/ensemble/distilbert-v1/config.json'))).status,200);
assert.ok(upstream.at(-1).url.includes(ensemble.ensembleModels[1].revision));
assert.equal((await assets.GET(new Request('https://vector.test/api/mail-model/ensemble/evil/config.json'))).status,404);
assert.equal((await assets.GET(new Request('https://vector.test/api/mail-model/ensemble/mobilebert-v1/secrets'))).status,404);
console.log('PASS: distinct pretrained majority, ties, partial/resumed votes, account dimensions, normalized scores, stale input/auth/CSRF, manual-label protection, pinned ensemble assets.');

const concurrentId='1',concurrentMail=(await state()).emails.find(row=>row.id===concurrentId&&row.account===account);
const concurrent=await Promise.all(votes.map(vote=>post({...voteBody,id:concurrentId,fingerprint:learning.mailFeatureFingerprint(concurrentMail),model:vote.model,scores:vote.scores})));
assert.ok(concurrent.every(result=>result.status===200));assert.equal((await(await route.GET()).json()).predictions[account+':'+concurrentId].votes.length,3,'Concurrent browser votes merge without loss');
console.log('PASS: concurrent distinct votes survive optimistic merging.');
