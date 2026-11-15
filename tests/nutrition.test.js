import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NUTRIENTS, aggregateItems, consumed, itemsForRecord, nutrientStatus, ordinal, periodBounds, visibleNutrients } from '../nutrition.js';
import { createAnalysisHandler } from '../api/analyze.js';
test('portion edits always use the original baseline, including unknown and zero values',()=>{
  const item={name:'밥',kcal:600,grams:300,nutrients:{protein:12,fat:0},portion:'half',biteGrams:15};
  assert.equal(consumed(item).kcal,300);item.portion='third';assert.equal(consumed(item).kcal,200);
  item.portion='quarter';assert.equal(consumed(item).kcal,150);item.portion='bite2';assert.equal(consumed(item).kcal,60);
  assert.equal(consumed(item).nutrients.fat,0);assert.equal(consumed(item).nutrients.vitD,null);
  item.grams=null;assert.equal(consumed(item).kcal,null);
  assert.equal(itemsForRecord({name:'기존',kcal:200,nutrients:{protein:5}})[0].portion,'all');
});
test('multi-food totals never pretend missing nutrition is complete',()=>{
  const rows=[{kcal:200,portion:'half',nutrients:{protein:10}},{kcal:100,nutrients:{protein:null},portion:'all'}];
  const result=aggregateItems(rows);assert.equal(result.kcal,200);assert.equal(result.nutrients.protein,null);
  assert.equal(aggregateItems([{kcal:null}]).kcal,null);
});
test('calendar boundaries and ordinals support backfills and unlimited daily records',()=>{
  assert.deepEqual(periodBounds('2026-11-01','week'),['2026-10-26','2026-11-01']);
  assert.deepEqual(periodBounds('2024-02-15','month'),['2024-02-01','2024-02-29']);
  assert.deepEqual([1,2,3,4,11,12,13,21].map(ordinal),['1st','2nd','3rd','4th','11th','12th','13th','21st']);
});
test('module preferences allow no modules; custom references and incomplete intake stay explicit',()=>{
  assert.deepEqual(visibleNutrients({dashboard:{nutrients:[]}}),[]);
  const sodium=NUTRIENTS.find(n=>n.id==='sodium');
  assert.deepEqual(nutrientStatus([{nutrients:{sodium:500}},{nutrients:{}}],sodium,1000),{amount:500,reference:1000,percent:50,partial:true});
});
test('official food catalogue preserves source, serving basis, and missing nutrient values',()=>{
  const foods=JSON.parse(readFileSync(new URL('../public/foods.json',import.meta.url)));
  assert.ok(foods.length>1000);
  const rice=foods.find(f=>f.id==='D301-022000000-0001');assert.equal(rice.name,'쌀밥');assert.equal(rice.per100g.kcal,166);
  for(const food of foods){assert.ok(food.grams>0);assert.ok(food.sourceUrl.startsWith('https://various.foodsafetykorea.go.kr/'));if(food.per100g.nutrients.protein===null)assert.equal(food.nutrients.protein,null);else assert.ok(Math.abs(food.nutrients.protein-food.per100g.nutrients.protein*food.grams/100)<.001);}
});
test('food proposals and scale OCR use authenticated schema validated endpoints',async()=>{
  const env={AI_GATEWAY_API_KEY:'test-only',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-only'};
  const clientFactory=()=>({auth:{getUser:async()=>({data:{user:{id:'qa'}}})},rpc:async()=>({data:1})});
  for(const [kind,output] of [['meal',{items:[{name:'밥',kcal:200,grams:100,nutrients:Object.fromEntries(NUTRIENTS.map(n=>[n.id,null]))}],notes:'추정'}],['weight',{kg:84.9,notes:'사진 숫자'}],['weight',{kg:null,notes:'식별 불가'}]]) {
    const res={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
    await createAnalysisHandler({env,clientFactory,generate:async()=>({output})})({method:'POST',headers:{authorization:'Bearer qa'},body:{kind,image:'data:image/png;base64,aGVsbG8='}},res);
    assert.equal(res.code,200);assert.deepEqual(res.value,{...output,source:'AI 추정'});
  }
});
