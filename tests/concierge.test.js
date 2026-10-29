import test from "node:test";
import assert from "node:assert/strict";
import { createAnalysisHandler } from "../api/analyze.js";
import { applyConcierge } from "../concierge-domain.js";
import { energyReference, timeline } from "../energy.js";
const food={name:"식사",kcal:500,nutrients:Object.fromEntries(["carb","protein","fat","fiber","calcium","iron","vitD","vitC","potassium","sodium","satFat"].map(k=>[k,null])),notes:"밥 한 공기로 추정"};
const answer={kind:"food",reply:"밥 한 공기로 보았어요. 먹은 양을 설명하면 함께 고칠 수 있어요.",assumptions:["밥 한 공기"],shouldUpdate:true,food,exercise:null,weightKg:null};
const base=()=>({records:[],exercises:[],weights:[],captures:[]});
test("conversation correction updates the same record and a question never changes nutrition",()=>{
  const journal=base(),capture={id:"c1",date:"2026-10-30",time:"",photo:"data:image/png;base64,aGVsbG8="};
  applyConcierge(journal,capture,answer);
  applyConcierge(journal,capture,{...answer,food:{...food,kcal:800},reply:"밥 두 공기를 반영할게요.",assumptions:["밥 두 공기"]});
  assert.equal(journal.records.length,1);assert.equal(journal.records[0].kcal,800);assert.equal(journal.records[0].meal,"entry");assert.equal(journal.records[0].time,"");
  applyConcierge(journal,capture,{...answer,shouldUpdate:false,food:{...food,kcal:50}});
  assert.equal(journal.records[0].kcal,800);assert.equal(capture.analysis.food.kcal,800);
});
test("unknown photos stay complete photo records without invented food or exercise",()=>{
  const j=base(),c={id:"c",date:"2026-10-30",time:""};
  assert.equal(applyConcierge(j,c,{...answer,kind:"unknown",food:null,shouldUpdate:false}),false);
  assert.equal(j.records.length,0);assert.equal(j.exercises.length,0);
});
test("timeline uses real times across kinds and explicitly keeps unknown times last",()=>{
  const j={records:[{id:"late",date:"d",time:"15:00"},{id:"none",date:"d",time:""}],exercises:[{id:"early",date:"d",time:"08:00"}],weights:[],captures:[{id:"raw",date:"d",time:"09:00"}]};
  assert.deepEqual(timeline(j,"d").map(x=>x.record.id),["early","raw","late","none"]);
});
test("energy comparison needs adult information, separates resting from daily, and supports explicit manual reference",()=>{
  assert.equal(energyReference({age:30,sex:"male"}),null);
  assert.equal(energyReference({age:15,sex:"male",heightCm:180,weightKg:80}),null);
  assert.deepEqual(energyReference({age:30,sex:"male",heightCm:180,weightKg:80,activity:"low"}),{resting:1780,daily:2136,label:"하루 유지 소비량 추정"});
  assert.equal(energyReference({age:30,sex:"male",heightCm:180,weightKg:80}).daily,null);
  assert.equal(energyReference({mode:"none",age:30,sex:"male",heightCm:180,weightKg:80}),null);
  assert.equal(energyReference({mode:"manual",manualKcal:2300}).daily,2300);
});
const response=()=>({code:0,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
const env={AI_GATEWAY_API_KEY:"test-only",VITE_SUPABASE_URL:"https://example.supabase.co",VITE_SUPABASE_PUBLISHABLE_KEY:"test-only"};
const req=(body={})=>({method:"POST",headers:{authorization:"Bearer token"},body:{image:"data:image/png;base64,aGVsbG8=",...body}});
test("concierge is authenticated, validates correction context, and preserves unknown nutrients",async()=>{
  let calls=0;
  const handler=createAnalysisHandler({concierge:true,env,clientFactory:()=>({auth:{getUser:async()=>({data:{user:{id:"u"}}})},rpc:async()=>({data:19})}),generate:async options=>{calls++;assert.ok(options.instructions);assert.equal(options.messages.at(-1).content[1].type,"file");return {output:answer};}});
  const denied=response();await handler({...req(),headers:{}},denied);assert.equal(denied.code,401);
  const bad=response();await handler(req({message:"x".repeat(601)}),bad);assert.equal(bad.code,400);assert.equal(calls,0);
  const ok=response();await handler(req({message:"밥 두 공기였어",history:[{role:"user",text:"더 먹었어"}]}),ok);assert.equal(ok.code,200);assert.equal(ok.body.food.nutrients.calcium,null);assert.equal(calls,1);
});
test("concierge rejects inconsistent model classification instead of saving a fake result",async()=>{
  const handler=createAnalysisHandler({concierge:true,env,clientFactory:()=>({auth:{getUser:async()=>({data:{user:{id:"u"}}})},rpc:async()=>({data:19})}),generate:async()=>({output:{...answer,kind:"exercise"}})});
  const r=response();await handler(req(),r);assert.equal(r.code,502);assert.equal(r.body.food,undefined);
});
