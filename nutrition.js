// MFDS food-labelling daily reference values; these are not personalised prescriptions.
export const REFERENCE_URL = 'https://www.law.go.kr/LSW/flDownload.do?bylClsCd=110201&flSeq=147344939';
export const NUTRIENTS = [
  ['carb','탄수화물','g',324], ['protein','단백질','g',55], ['fat','지방','g',54],
  ['fiber','식이섬유','g',25], ['calcium','칼슘','mg',700], ['iron','철분','mg',12],
  ['vitD','비타민 D','㎍',10], ['vitC','비타민 C','mg',100], ['potassium','칼륨','mg',3500],
  ['sodium','나트륨','mg',2000,'limit'], ['satFat','포화지방','g',15,'limit'],
  ['sugars','당류','g',100,'limit'], ['cholesterol','콜레스테롤','mg',300,'limit'],
  ['vitA','비타민 A','㎍ RAE',700], ['vitE','비타민 E','mg α-TE',11], ['vitK','비타민 K','㎍',70],
  ['vitB1','비타민 B1','mg',1.2], ['vitB2','비타민 B2','mg',1.4], ['vitB6','비타민 B6','mg',1.5],
  ['vitB12','비타민 B12','㎍',2.4], ['folate','엽산','㎍ DFE',400], ['niacin','나이아신','mg NE',15],
  ['magnesium','마그네슘','mg',315], ['zinc','아연','mg',8.5], ['phosphorus','인','mg',700],
  ['selenium','셀레늄','㎍',55], ['iodine','요오드','㎍',150],
].map(([id,label,unit,reference,kind='target'])=>({id,label,unit,reference,kind}));
export const DEFAULT_MODULES = ['carb','protein','fat','fiber','sodium','satFat','sugars'];
export function visibleNutrients(data) {
  const ids = Array.isArray(data.dashboard?.nutrients) ? data.dashboard.nutrients : DEFAULT_MODULES;
  return [...new Set(ids)].map(id=>NUTRIENTS.find(n=>n.id===id)).filter(Boolean);
}
export function nutrientStatus(records, nutrient, custom) {
  const values=records.map(r=>r.nutrients?.[nutrient.id]);
  const known=values.filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
  const amount=known.length?known.reduce((a,b)=>a+b,0):null;
  const reference=Number.isFinite(custom)&&custom>0?custom:nutrient.reference;
  return {amount,reference,percent:amount===null?null:Math.round(amount/reference*100),partial:known.length<records.length};
}
export const PORTIONS = [['all','전부',1],['half','1/2',.5],['third','1/3',1/3],['quarter','1/4',.25],['bite1','한 입',1],['bite2','두 입',2],['bite3','세 입',3]];
export function portionFactor(item) {
  const portion=PORTIONS.find(p=>p[0]===item.portion)||PORTIONS[0];
  if(!portion[0].startsWith('bite')) return portion[2];
  if(!(Number(item.grams)>0) || !(Number(item.biteGrams)>0)) return null;
  return Math.min(1,portion[2]*Number(item.biteGrams)/Number(item.grams));
}
export function consumed(item) {
  const factor=portionFactor(item), scale=v=>factor===null||typeof v!=='number'||!Number.isFinite(v)?null:Math.round(v*factor*100)/100;
  return {kcal:scale(item.kcal),nutrients:Object.fromEntries(NUTRIENTS.map(n=>[n.id,scale(item.nutrients?.[n.id])]))};
}
export function aggregateItems(items) {
  const rows=items.map(consumed);
  const sum=values=>values.some(v=>v===null||v===undefined)?null:Math.round(values.reduce((a,b)=>a+b,0)*100)/100;
  return {kcal:items.length?sum(rows.map(r=>r.kcal)):null,nutrients:Object.fromEntries(NUTRIENTS.map(n=>[n.id,items.length?sum(rows.map(r=>r.nutrients[n.id])):null]))};
}
export function itemsForRecord(record) {
  return structuredClone(record?.items || (record?.kcal!=null||record?.name&&!record?.pending ? [{name:record.name,kcal:record.kcal??null,nutrients:record.nutrients||{},grams:null,portion:'all',biteGrams:15,source:record.source||'기존 기록'}] : []));
}
export function ordinal(n) {const t=n%100;return `${n}${t>=11&&t<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th')}`;}
export function periodBounds(date,period='day') {
  const d=new Date(`${date}T12:00:00`),fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if(period==='week'){d.setDate(d.getDate()-(d.getDay()+6)%7);const start=fmt(d);d.setDate(d.getDate()+6);return [start,fmt(d)];}
  if(period==='month'){d.setDate(1);const start=fmt(d);d.setMonth(d.getMonth()+1,0);return [start,fmt(d)];}
  return [date,date];
}
export function inPeriod(rows,date,period) {const [from,to]=periodBounds(date,period);return rows.filter(r=>r.date>=from&&r.date<=to);}
export function sortedRecords(rows) {return [...rows].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99')||a.id.localeCompare(b.id));}
