export function linkedRecord(journal, capture) {
  const collection = {food:"records",exercise:"exercises",weight:"weights"}[capture.recordKind];
  return collection ? journal[collection]?.find(r => r.id === (capture.linkedRecordId || capture.id)) || null : null;
}
export function mealPhotoMembers(journal,capture) {
  if(!capture?.mealPair)return [];
  return [capture.mealPair.beforeId,capture.mealPair.afterId].map(id=>journal.captures.find(c=>c.id===id)).filter(Boolean);
}
export function contextCaptures(journal,capture) {
  const paired=mealPhotoMembers(journal,capture);
  if(paired.length===2)return paired.filter(c=>c.id!==capture.id);
  return capture.batchId?journal.captures.filter(c=>c.batchId===capture.batchId&&c.id!==capture.id&&!c.mealPair).slice(0,2):[];
}
export function removeConversation(journal,capture) {
  const ids=new Set([capture.id,...mealPhotoMembers(journal,capture).map(c=>c.id)]);
  for(const key of ['captures','records','exercises','weights'])journal[key]=journal[key].filter(r=>!ids.has(r.id));
}
export function recordContext(record, kind) {
  const nutrients=Object.fromEntries(["carb","protein","fat","fiber","calcium","iron","vitD","vitC","potassium","sodium","satFat"].map(k=>[k,record.nutrients?.[k]??null]));
  return {kind,reply:"직접 남긴 기존 기록이에요.",assumptions:[],shouldUpdate:false,
    food:kind==='food'?{name:(record.name||'').slice(0,90)||null,kcal:record.kcal??null,nutrients,notes:"직접 입력한 기존 기록"}:null,
    exercise:kind==='exercise'?{type:(record.type||'').slice(0,75)||null,minutes:record.minutes??null,calories:record.calories??null,notes:"직접 입력한 기존 기록"}:null,
    weightKg:kind==='weight'?(record.kg??null):null};
}
export function applyConcierge(journal, capture, result) {
  if (!result.shouldUpdate || result.kind === "unknown") {
    capture.analysis = capture.analysis ? {...capture.analysis,reply:result.reply,assumptions:result.assumptions} : result;
    return false;
  }
  const pair=result.mealPhotos || capture.mealPair;
  let target=capture, members=[capture];
  if(pair) {
    const before=journal.captures.find(c=>c.id===pair.beforeId),after=journal.captures.find(c=>c.id===pair.afterId);
    if(result.kind!=="food"||!before||!after||before.id===after.id||![before.id,after.id].includes(capture.id)||!before.batchId||before.batchId!==after.batchId||[before,after].some(c=>c.recordKind&&c.recordKind!=="food")||(before.capturedDate&&after.capturedDate&&before.capturedDate!==after.capturedDate)||[before,after].some(c=>c.mealPair&&(c.mealPair.beforeId!==before.id||c.mealPair.afterId!==after.id)))throw Error("같은 식사의 식전·식후 사진인지 확인해 주세요.");
    target=before;members=[before,after];
  }
  const previous = linkedRecord(journal,target) || {};
  const ids=new Set(members.map(c=>c.id));
  for (const key of ["records","exercises","weights"]) journal[key] = (journal[key] || []).filter(r => !ids.has(r.id));
  const common = { ...previous, id:target.id, date:target.date, time:target.time || "", photo:target.photo,
    ...(target.photoPath ? {photoPath:target.photoPath}:{}), source:pair?"AI 추정 · 식사 전후 비교":"AI 추정 · 대화로 보정", sample:false };
  if (result.kind === "food") journal.records.push({...common,meal:"entry",name:result.food.name || "사진으로 남긴 음식",kcal:result.food.kcal == null ? null : Math.round(result.food.kcal),nutrients:result.food.nutrients,analysis:result.food});
  if (result.kind === "exercise") journal.exercises.push({...common,type:result.exercise.type || "운동 캡처",minutes:result.exercise.minutes,calories:result.exercise.calories,analysis:result.exercise});
  if (result.kind === "weight") journal.weights.push({...common,kg:result.weightKg ?? previous.kg ?? null});
  for(const member of members) {
    member.recordKind=result.kind;
    member.analysis={...result,...(pair?{mealPhotos:pair}:{})};
    if(pair)member.mealPair={...pair};
    if(member.id!==target.id)member.linkedRecordId=target.id;
    else delete member.linkedRecordId;
  }
  return true;
}
export function manualCapture(journal, capture, kind) {
  const blankNutrients = Object.fromEntries(["carb","protein","fat","fiber","calcium","iron","vitD","vitC","potassium","sodium","satFat"].map(k=>[k,null]));
  const result = {kind,reply:"",assumptions:[],shouldUpdate:true,food:kind==="food"?{name:null,kcal:null,nutrients:blankNutrients,notes:"사진만 기록"}:null,exercise:kind==="exercise"?{type:null,minutes:null,calories:null,notes:""}:null,weightKg:null};
  applyConcierge(journal,capture,result);
  const record=linkedRecord(journal,capture); if(record) record.source="사진만 기록 · 정보 미확인";
  capture.analysis = null;
}
