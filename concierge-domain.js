export function linkedRecord(journal, capture) {
  const collection = {food:"records",exercise:"exercises",weight:"weights"}[capture.recordKind];
  return collection ? journal[collection]?.find(r => r.id === capture.id) || null : null;
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
  capture.analysis = result;
  const previous = linkedRecord(journal,capture) || {};
  for (const key of ["records","exercises","weights"]) journal[key] = (journal[key] || []).filter(r => r.id !== capture.id);
  const common = { ...previous, id:capture.id, date:capture.date, time:capture.time || "", photo:capture.photo,
    ...(capture.photoPath ? {photoPath:capture.photoPath}:{}), source:"AI 추정 · 대화로 보정", sample:false };
  if (result.kind === "food") journal.records.push({...common,meal:"entry",name:result.food.name || "사진으로 남긴 음식",kcal:result.food.kcal == null ? null : Math.round(result.food.kcal),nutrients:result.food.nutrients,analysis:result.food});
  if (result.kind === "exercise") journal.exercises.push({...common,type:result.exercise.type || "운동 캡처",minutes:result.exercise.minutes,calories:result.exercise.calories,analysis:result.exercise});
  if (result.kind === "weight") journal.weights.push({...common,kg:result.weightKg ?? previous.kg ?? null});
  capture.recordKind = result.kind;
  return true;
}
export function manualCapture(journal, capture, kind) {
  const blankNutrients = Object.fromEntries(["carb","protein","fat","fiber","calcium","iron","vitD","vitC","potassium","sodium","satFat"].map(k=>[k,null]));
  const result = {kind,reply:"",assumptions:[],shouldUpdate:true,food:kind==="food"?{name:null,kcal:null,nutrients:blankNutrients,notes:"사진만 기록"}:null,exercise:kind==="exercise"?{type:null,minutes:null,calories:null,notes:""}:null,weightKg:null};
  applyConcierge(journal,capture,result);
  const record=linkedRecord(journal,capture); if(record) record.source="사진만 기록 · 정보 미확인";
  capture.analysis = null;
}
