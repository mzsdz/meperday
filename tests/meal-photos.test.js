import test from 'node:test';
import assert from 'node:assert/strict';
import {applyConcierge,linkedRecord,contextCaptures,mealPhotoMembers,removeConversation,separateMealPhotos} from '../concierge-domain.js';
import {validateConcierge} from '../server/concierge-schema.js';
import {createAnalysisHandler} from '../api/analyze.js';
import {validateJournal} from '../domain.js';
const photo='data:image/jpeg;base64,aGVsbG8=';
const food={name:'식사',kcal:300,nutrients:Object.fromEntries(['carb','protein','fat','fiber','calcium','iron','vitD','vitC','potassium','sodium','satFat'].map(k=>[k,null])),notes:'처음 500kcal에서 남긴 약 200kcal 제외'};
const pair={beforeId:'before',afterId:'after'};
const result={kind:'food',reply:'남긴 양을 빼고 드신 만큼만 반영할게요.',shouldUpdate:true,assumptions:['식사 전 500kcal, 남김 200kcal, 섭취 300kcal'],food,exercise:null,weightKg:null,mealPhotos:pair,portions:{before:{...food,kcal:500},leftovers:{...food,kcal:200}}};
const make=()=>({records:[],exercises:[],weights:[],goals:{carb:300},evaluations:{},dayEvaluations:{},captures:['before','after','third'].map((id,i)=>({id,batchId:'batch',date:'2026-10-30',capturedDate:'2026-10-30',time:`12:0${i}`,photo,messages:[]}))});
const standalone={...result,mealPhotos:null};
test('before and after replace two previously counted meals with one consumed amount, preserving the unrelated third photo',()=>{
  const j=make();for(const c of j.captures)applyConcierge(j,c,standalone);
  applyConcierge(j,j.captures[1],result);
  assert.deepEqual(j.records.map(r=>r.id).sort(),['before','third']);assert.equal(j.records.find(r=>r.id==='before').kcal,300);
  assert.equal(linkedRecord(j,j.captures[1]).id,'before');assert.equal(j.captures.length,3);
  assert.equal(j.captures[1].linkedRecordId,'before');assert.equal(j.records[1].time,'12:00');
});
test('reverse input order still uses the before photo for the one meal and never subtracts a question twice',()=>{
  const j=make();j.captures.reverse();const c=j.captures.find(c=>c.id==='after');applyConcierge(j,c,result);
  assert.equal(j.records[0].id,'before');assert.equal(j.records[0].time,'12:00');
  applyConcierge(j,c,{...result,shouldUpdate:false,food:{...food,kcal:100}});assert.equal(j.records[0].kcal,300);
  applyConcierge(j,c,{...result,mealPhotos:null,food:{...food,kcal:350}});assert.equal(j.records.length,1);assert.equal(j.records[0].kcal,350);assert.deepEqual(c.mealPair,pair);
});
test('different meals stay independent; a pair only reuses its own evidence; deleting it preserves the third photo',()=>{
  const j=make();for(const c of j.captures)applyConcierge(j,c,standalone);assert.equal(j.records.length,3);
  applyConcierge(j,j.captures[0],result);
  assert.deepEqual(contextCaptures(j,j.captures[0]).map(c=>c.id),['after']);assert.equal(contextCaptures(j,j.captures[2]).length,0);
  assert.equal(mealPhotoMembers(j,j.captures[1]).length,2);removeConversation(j,j.captures[1]);
  assert.deepEqual(j.captures.map(c=>c.id),['third']);assert.deepEqual(j.records.map(r=>r.id),['third']);
});
test('relationships cannot cross batches, dates, unknown IDs or exercise evidence',()=>{
  for(const change of [j=>j.captures[1].batchId='other',j=>j.captures[1].capturedDate='2026-10-29',j=>j.captures[1].id='unknown',j=>j.captures[1].recordKind='exercise']) {
    const j=make();change(j);const snapshot=JSON.stringify(j);assert.throws(()=>applyConcierge(j,j.captures[0],result));assert.equal(JSON.stringify(j),snapshot);
  }
});
test('backups preserve paired references and reject dangling relationships',()=>{
  const j=make();applyConcierge(j,j.captures[0],result);
  const restored=validateJournal(JSON.parse(JSON.stringify(j)));assert.equal(linkedRecord(restored,restored.captures[1]).kcal,300);
  j.captures.splice(0,1);assert.throws(()=>validateJournal(j),/사진 연결/);
});
test('server validates photo IDs and calendar dates before returning a combined record',()=>{
  const req={captureId:'after',capturedDate:'2026-10-30',contextPhotos:[{id:'before',date:'2026-10-30'}]};
  assert.equal(validateConcierge(result,req).food.kcal,300);
  assert.throws(()=>validateConcierge({...result,mealPhotos:{beforeId:'foreign',afterId:'after'}},req));
  assert.throws(()=>validateConcierge(result,{...req,capturedDate:'2026-10-29'}));
});
test('the authenticated model sees both photos, and invalid context image inputs never call it',async()=>{
  const env={AI_GATEWAY_API_KEY:'test-only',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-only'};
  let calls=0;const handler=createAnalysisHandler({concierge:true,env,clientFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}})},rpc:async()=>({data:1})}),generate:async options=>{calls++;assert.equal(options.messages.at(-1).content.filter(p=>p.type==='file').length,2);return {output:result};}});
  const req={method:'POST',headers:{authorization:'Bearer test'},body:{captureId:'after',capturedDate:'2026-10-30',image:photo,contextPhotos:[{id:'before',date:'2026-10-30',image:photo}]}};
  const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(value){this.value=value;return this;}});
  const ok=res();await handler(req,ok);assert.equal(ok.code,200);assert.equal(ok.value.mealPhotos.beforeId,'before');
  const bad=res();await handler({...req,body:{...req.body,contextPhotos:[{id:'before',date:null,image:'https://foreign.test/photo'}]}},bad);assert.equal(bad.code,400);assert.equal(calls,1);
});

test('paired consumption is served minus leftovers, never their sum, and original chronology cannot reverse',()=>{
  const req={captureId:'before',capturedDate:'2026-10-30',capturedTime:'12:00',contextPhotos:[{id:'after',date:'2026-10-30',time:'12:30'}]};
  const accepted=validateConcierge({...result,portions:{before:{...food,kcal:500,nutrients:{...food.nutrients,carb:80}},leftovers:{...food,kcal:200,nutrients:{...food.nutrients,carb:30}}}},req);
  assert.equal(accepted.food.kcal,300);assert.equal(accepted.food.nutrients.carb,50);assert.equal(accepted.food.nutrients.iron,null);
  assert.equal(validateConcierge({...result,food:{...food,kcal:700}},req).food.kcal,300);
  assert.throws(()=>validateConcierge(result,{...req,capturedTime:'13:00'}),/chronology/);
  assert.throws(()=>validateConcierge({...result,portions:{before:{...food,kcal:100},leftovers:{...food,kcal:200}}},req),/exceed/);
});

test('all food left is zero intake, while contradictory individual nutrients stay unknown',()=>{
  const req={captureId:'before',capturedDate:null,contextPhotos:[{id:'after',date:null}]};
  const zero=validateConcierge({...result,food:{...food,kcal:0},portions:{before:{...food,kcal:500,nutrients:{...food.nutrients,carb:50}},leftovers:{...food,kcal:500,nutrients:{...food.nutrients,carb:50}}}},req);
  assert.equal(zero.food.kcal,0);assert.equal(zero.food.nutrients.carb,0);assert.equal(zero.food.nutrients.iron,null);
  const uncertain=validateConcierge({...result,portions:{before:{...food,kcal:500,nutrients:{...food.nutrients,carb:10}},leftovers:{...food,kcal:200,nutrients:{...food.nutrients,carb:20}}}},req);
  assert.equal(uncertain.food.nutrients.carb,null);
});

test('users can undo an inferred pair; both photos become independent unknown records without reusing consumed calories',()=>{
  const j=make();applyConcierge(j,j.captures[0],result);const members=separateMealPhotos(j,j.captures[1]);
  assert.equal(members.length,2);assert.equal(j.records.length,2);assert.ok(j.records.every(r=>r.kcal===null));
  assert.ok(members.every(c=>!c.mealPair&&!c.linkedRecordId&&c.pairingDisabled));assert.deepEqual(contextCaptures(j,j.captures[0]),[]);
  applyConcierge(j,j.captures[0],standalone);assert.equal(j.records.length,2);assert.equal(linkedRecord(j,j.captures[0]).kcal,300);assert.equal(linkedRecord(j,j.captures[1]).kcal,null);
});

test('pairing retains both earlier photo conversations and cannot bypass subtraction by omitting the existing pair',()=>{
  const j=make();j.captures[0].messages=[{role:'user',text:'밥은 조금 남겼어'}];j.captures[1].messages=[{role:'user',text:'이건 남긴 사진이야'}];applyConcierge(j,j.captures[1],result);
  assert.deepEqual(j.captures[0].messages.map(m=>m.text),['밥은 조금 남겼어','이건 남긴 사진이야']);assert.deepEqual(j.captures[0].messages,j.captures[1].messages);
  const req={captureId:'before',capturedDate:null,contextPhotos:[{id:'after',date:null}],current:result};
  assert.equal(validateConcierge({...result,mealPhotos:null,food:{...food,kcal:700}},req).food.kcal,300);
  assert.deepEqual(validateConcierge({...result,mealPhotos:null},req).mealPhotos,pair);
});

test('a conflicting context interpretation falls back once to the current photo and reserves another AI call',async()=>{
  let calls=0,quota=0;const env={AI_GATEWAY_API_KEY:'test-only',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-only'};
  const handler=createAnalysisHandler({concierge:true,env,clientFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}})},rpc:async()=>{quota++;return {data:1};}}),generate:async options=>{
    calls++;const files=options.messages.at(-1).content.filter(p=>p.type==='file');
    if(calls===1){assert.equal(files.length,2);return {output:{...standalone,kind:'exercise'}};}
    assert.equal(files.length,1);return {output:{...standalone,mealPhotos:undefined,portions:undefined}};
  }});
  const response={setHeader(){},status(n){this.code=n;return this;},json(value){this.value=value;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer token'},body:{captureId:'before',image:photo,contextPhotos:[{id:'after',image:photo,date:null}]}},response);
  assert.equal(response.code,200);assert.equal(response.value.food.kcal,300);assert.equal(calls,2);assert.equal(quota,2);
});

test('a proposed pair retains both images during one bounded repair rather than counting leftovers alone',async()=>{
  let calls=0;const env={AI_GATEWAY_API_KEY:'test-only',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-only'};
  const handler=createAnalysisHandler({concierge:true,env,clientFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}})},rpc:async()=>({data:1})}),generate:async options=>{calls++;assert.equal(options.messages.at(-1).content.filter(p=>p.type==='file').length,2);return {output:calls===1?{...result,mealPhotos:{beforeId:'foreign',afterId:'after'}}:result};}});
  const response={setHeader(){},status(n){this.code=n;return this;},json(value){this.value=value;return this;}};
  await handler({method:'POST',headers:{authorization:'Bearer token'},body:{captureId:'before',image:photo,contextPhotos:[{id:'after',image:photo,date:null}]}},response);
  assert.equal(calls,2);assert.equal(response.code,200);assert.equal(response.value.food.kcal,300);assert.deepEqual(response.value.mealPhotos,pair);
});

test('an explicit explanation-only request preserves even an unknown consumed value when the model tries to update it',async()=>{
  const env={AI_GATEWAY_API_KEY:'test-only',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-only'};
  for(const kcal of [null,300]) {
    const current={...result,food:{...food,kcal}};
    const handler=createAnalysisHandler({concierge:true,env,clientFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}})},rpc:async()=>({data:1})}),generate:async()=>({output:{...result,food:{...food,kcal:420}}})});
    const response={setHeader(){},status(n){this.code=n;return this;},json(value){this.value=value;return this;}};
    await handler({method:'POST',headers:{authorization:'Bearer token'},body:{captureId:'before',image:photo,current,message:'남긴 양을 이미 뺀 거지? 이유만 설명해 줘. 양은 바꾸지 마.',contextPhotos:[{id:'after',image:photo,date:null}]}},response);
    assert.equal(response.code,200);assert.equal(response.value.shouldUpdate,false);assert.equal(response.value.food.kcal,kcal);
  }
});
