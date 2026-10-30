import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnalysisHandler} from '../api/analyze.js';
import {readConciergeResponse} from '../concierge-client.js';
const answer={kind:'food',reply:'샐러드 한 그릇이네요. 보이는 양으로는 약 500kcal로 볼게요.',assumptions:[],shouldUpdate:true,food:{name:'샐러드',kcal:500,nutrients:Object.fromEntries(['carb','protein','fat','fiber','calcium','iron','vitD','vitC','potassium','sodium','satFat'].map(k=>[k,null])),notes:''},exercise:null,weightKg:null};
const env={AI_GATEWAY_API_KEY:'test-only',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-only'};
const request={method:'POST',headers:{authorization:'Bearer test',accept:'application/x-ndjson'},body:{image:'data:image/png;base64,aGVsbG8='}};
const response=()=>({code:0,headers:{},chunks:[],setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},flushHeaders(){this.flushed=true;},write(s){this.chunks.push(s);},end(s){if(s)this.chunks.push(s);this.ended=true;},json(v){this.body=v;return this;}});
const client=()=>({auth:{getUser:async()=>({data:{user:{id:'qa'}}})},rpc:async()=>({data:1})});
test('reply chunks arrive before the validated result, with one quota reservation and no extra model request',async()=>{
  const res=response();let quota=0,calls=0;
  const handler=createAnalysisHandler({concierge:true,env,clientFactory:()=>({...client(),rpc:async()=>{quota++;return {data:1};}}),stream:()=>{
    calls++;return {output:Promise.resolve(answer),providerMetadata:Promise.resolve({}),partialOutputStream:(async function*(){
      yield {reply:answer.reply.slice(0,14)};
      assert.equal(res.chunks.length,1);assert.equal(JSON.parse(res.chunks[0]).type,'reply');assert.equal(res.ended,undefined);
      yield {reply:answer.reply};
    })()};
  }});
  await handler(request,res);const events=res.chunks.map(s=>JSON.parse(s));
  assert.equal(events[0].type,'reply');assert.equal(events.at(-1).type,'result');assert.equal(events.at(-1).value.food.kcal,500);
  assert.equal(res.flushed,true);assert.equal(res.ended,true);assert.equal(calls,1);assert.equal(quota,1);
});
test('stream failures and invalid completed objects never emit a result',async()=>{
  for(const broken of [true,false]) {
    const res=response();const handler=createAnalysisHandler({concierge:true,env,clientFactory:client,stream:()=>({
      output:broken?Promise.reject(Error('provider disconnected')):Promise.resolve({...answer,food:null}),providerMetadata:Promise.resolve({}),
      partialOutputStream:(async function*(){yield {reply:'아직 완성되지 않은 답변이에요.'};if(broken)throw Error('provider disconnected');})(),
    })});
    await handler(request,res);const events=res.chunks.map(s=>JSON.parse(s));assert.equal(events.at(-1).type,'error');assert.ok(!events.some(e=>e.type==='result'));
  }
});
test('stream authorization failures happen before any output or model call',async()=>{
  const res=response();let called=false;await createAnalysisHandler({concierge:true,env,stream:()=>{called=true;}})({...request,headers:{accept:'application/x-ndjson'}},res);
  assert.equal(res.code,401);assert.equal(res.chunks.length,0);assert.equal(called,false);
});
const streamed=(events,step=7)=>{
  const bytes=new TextEncoder().encode(events.map(e=>JSON.stringify(e)+'\n').join(''));let offset=0;
  return new Response(new ReadableStream({pull(controller){if(offset>=bytes.length){controller.close();return;}controller.enqueue(bytes.slice(offset,offset+step));offset+=step;}}),{headers:{'Content-Type':'application/x-ndjson; charset=utf-8'}});
};
test('client decodes split UTF-8 and split frames, then returns only the complete result',async()=>{
  const chunks=[];const result=await readConciergeResponse(streamed([{type:'reply',text:'샐러드'},{type:'reply',text:answer.reply},{type:'result',value:answer}],1),t=>chunks.push(t));
  assert.deepEqual(chunks,['샐러드',answer.reply]);assert.equal(result.food.kcal,500);
});
test('client rejects a truncated or failed stream instead of accepting the visible partial reply',async()=>{
  await assert.rejects(readConciergeResponse(streamed([{type:'reply',text:'아직 생성 중'}])),/도중에 끊겼어요/);
  await assert.rejects(readConciergeResponse(streamed([{type:'reply',text:'아직 생성 중'},{type:'error',error:'다시 보내 주세요.'}])),/다시 보내 주세요/);
});
test('JSON photo-evidence notices remain compatible without artificial typing',async()=>{
  let updates=0;const result=await readConciergeResponse(Response.json({...answer,shouldUpdate:false}),()=>updates++);
  assert.equal(result.shouldUpdate,false);assert.equal(updates,0);
});
test('a small trailing phrase is flushed even if the model pauses before its next token',async()=>{
  const res=response(),first=answer.reply.slice(0,14),second=answer.reply.slice(0,17);
  const handler=createAnalysisHandler({concierge:true,env,clientFactory:client,stream:()=>({
    output:Promise.resolve(answer),providerMetadata:Promise.resolve({}),partialOutputStream:(async function*(){
      yield {reply:first};yield {reply:second};
      await new Promise(resolve=>setTimeout(resolve,120));
      assert.equal(JSON.parse(res.chunks.at(-1)).text,second);
      assert.equal(res.ended,undefined);
      yield {reply:answer.reply};
    })(),
  })});
  await handler(request,res);assert.equal(JSON.parse(res.chunks.at(-1)).type,'result');
});
