import { NUTRIENTS, PORTIONS, aggregateItems, consumed, itemsForRecord } from './nutrition.js';
import { escapeHtml as e } from './journal-view.js';
import { analyzePhoto } from './analysis-client.js';
import { photoForAI } from './concierge-client.js';
import { compressImage } from './photos.js';
import { captureDate, captureTime } from './domain.js';
import exifr from 'exifr';
let catalogPromise;
export function loadCatalog() {
  return catalogPromise??=fetch('/foods.json').then(async r=>{if(!r.ok)throw Error('음식 목록을 불러오지 못했어요.');return r.json();}).catch(error=>{catalogPromise=null;throw error;});
}
export function openFoodEditor({record,date,head,showSheet,canAnalyze,records,onSave,onDelete}) {
  const draft={photo:record?.photo||'',photoPath:record?.photoPath,items:itemsForRecord(record),suggestions:structuredClone(record?.suggestedItems||[]),source:record?.source||'직접 입력',processing:false,sequence:0};
  showSheet(`${head(record?'음식과 먹은 양 확인':'음식 기록하기','사진 분석은 제안이에요. 실제 먹은 음식과 양을 골라 주세요.')}<form id="foodForm"><div class="form-grid"><div class="field"><label for="foodDate">날짜</label><input id="foodDate" type="date" required value="${e(record?.date||date)}"></div><div class="field"><label for="foodTime">촬영 시각 · 선택</label><input id="foodTime" type="time" value="${e(record?.time||'')}"></div></div><label class="uploadbox" for="foodFile"><strong>＋ 음식 사진 선택하기</strong><input id="foodFile" type="file" accept="image/*"></label><div id="photoPreview">${draft.photo?`<img class="upload-preview" src="${e(draft.photo)}" alt="음식 사진">`:''}</div><button type="button" class="button secondary full" id="foodAnalyze">사진 다시 분석하기</button><p class="disclaimer" role="status" id="analyzeStatus">${e(record?.analysisNotes||'음식 검색이나 직접 입력으로도 기록할 수 있어요.')}</p><section id="foodSuggestions" aria-label="AI 음식 제안"></section><div class="field food-search"><label for="foodSearch">음식 검색 · 자동완성</label><input id="foodSearch" type="search" autocomplete="off" placeholder="예: 김밥, 쌀밥, 닭가슴살" aria-controls="foodSearchResults"><div id="foodSearchResults" aria-label="음식 검색 결과"></div></div><p class="disclaimer">식약처 식품영양성분 데이터베이스와 내 기록에서 찾아요. 검색값은 표시된 기준 중량의 참고값이에요.</p><button type="button" class="chip" id="addCustomFood">＋ 직접 음식 입력</button><div id="foodItems"></div><div class="food-total" aria-live="polite"><span>실제 먹은 양 합계</span><strong id="foodTotal">—</strong></div><p class="disclaimer">한 입은 기본 15g으로 가정해요. 기준 중량과 한 입 크기를 바꾸면 다시 계산해요.</p><div class="field"><label for="foodNote">메모 · 선택</label><textarea id="foodNote">${e(record?.note||'')}</textarea></div><div class="inline-actions editor-footer"><button type="button" class="button secondary" data-close>닫기</button><button type="submit" class="button">확인하고 저장</button></div>${record?'<button type="button" class="text-button full danger" id="deleteFood">이 음식 기록 삭제</button>':''}</form>`);
  const form=document.querySelector('#foodForm'),$=s=>form.querySelector(s);
  let searching=0,analysisNotes=record?.analysisNotes||'';
  const refreshTotal=()=>{$('#foodTotal').textContent=aggregateItems(draft.items).kcal===null?'열량 미확인':`${Math.round(aggregateItems(draft.items).kcal).toLocaleString('ko-KR')} kcal`;for(const [i,item] of draft.items.entries()){const node=$(`[data-item-total="${i}"]`);if(node)node.textContent=consumed(item).kcal==null?'열량 미확인':`${Math.round(consumed(item).kcal)} kcal`;}};
  const renderItems=()=>{
    $('#foodItems').innerHTML=draft.items.map((item,i)=>`<article class="food-item" data-item="${i}"><div class="module-heading"><label for="itemName${i}">음식 ${i+1}</label><button type="button" class="module-remove" data-remove-item="${i}" aria-label="음식 ${i+1} 제거">×</button></div><input id="itemName${i}" data-item-field="name" value="${e(item.name)}" placeholder="음식 이름" maxlength="90" required><p class="disclaimer">${e(item.source||'직접 입력')}</p><div class="form-grid"><div class="field"><label for="itemKcal${i}">기준량 전체 kcal</label><input id="itemKcal${i}" data-item-field="kcal" type="number" min="0" max="9000" step="any" value="${item.kcal??''}" placeholder="미확인"></div><div class="field"><label for="itemGrams${i}">기준량 무게 (g)</label><input id="itemGrams${i}" data-item-field="grams" type="number" min="0.1" max="10000" step="any" value="${item.grams??''}" placeholder="미확인"></div></div><p class="portion-label">이 기준량 중 먹은 양</p><div class="portion-options">${PORTIONS.map(([id,label])=>`<button type="button" data-portion="${id}" aria-pressed="${(item.portion||'all')===id}">${label}</button>`).join('')}</div>${item.portion?.startsWith('bite')?`<div class="field"><label for="biteGrams${i}">한 입 무게 (g) · 추정 기준</label><input id="biteGrams${i}" data-item-field="biteGrams" type="number" min="0.1" max="1000" step="any" required value="${item.biteGrams??15}"></div><p class="disclaimer">${item.grams?'기준량을 초과하면 전부 먹은 양까지만 계산해요.':'기준량 무게를 넣어야 한 입의 열량을 계산할 수 있어요.'}</p>`:''}<strong class="item-consumed" data-item-total="${i}"></strong><details><summary>기준량 영양 정보 수정</summary><div class="form-grid">${NUTRIENTS.map(n=>`<div class="field"><label for="nut${i}${n.id}">${n.label} (${n.unit})</label><input id="nut${i}${n.id}" type="number" data-item-nutrient="${n.id}" min="0" max="100000" step="any" value="${item.nutrients?.[n.id]??''}" placeholder="미확인"></div>`).join('')}</div></details></article>`).join('');refreshTotal();
  };
  const renderSuggestions=()=>{
    $('#foodSuggestions').innerHTML=draft.suggestions.length?`<div class="suggestion-box"><h3>사진에서 찾은 음식 · 추정</h3><p>맞는 음식을 눌러 먹은 양을 선택하세요.</p>${draft.suggestions.map((item,i)=>`<button type="button" class="food-result" data-suggestion="${i}"><strong>${e(item.name||'이름 미확인')}</strong><small>${item.kcal==null?'열량 미확인':`약 ${Math.round(item.kcal)} kcal`} · ${item.grams?`사진 속 약 ${item.grams}g`:'사진 속 양'}　＋</small></button>`).join('')}</div>`:'';
  };
  const add=item=>{draft.items.push({...structuredClone(item),portion:'all',biteGrams:15,nutrients:item.nutrients||{}});renderItems();};
  const setProcessing=flag=>{draft.processing=flag;form.querySelector('button[type="submit"]').disabled=flag;$('#foodAnalyze').disabled=flag||!draft.photo||!canAnalyze();$('#foodFile').disabled=flag;};
  async function analyze() {
    if(!draft.photo||draft.processing)return;
    if(!canAnalyze()){$('#analyzeStatus').textContent='AI 분석은 로그인 후 사용할 수 있어요. 음식 검색은 바로 사용할 수 있어요.';return;}
    const seq=++draft.sequence;setProcessing(true);$('#analyzeStatus').textContent='음식을 살펴보고 있어요…';
    try {const result=await analyzePhoto('meal',await photoForAI(draft.photo));if(!form.isConnected||seq!==draft.sequence)return;draft.suggestions=result.items.map(item=>({...item,source:'AI 사진 추정'}));analysisNotes=result.notes||'';$('#analyzeStatus').textContent=analysisNotes||'맞는 음식을 골라 주세요. 확인하기 전에는 합계에 반영되지 않아요.';renderSuggestions();}
    catch(error){if(form.isConnected)$('#analyzeStatus').textContent=error.message;}
    finally{if(form.isConnected)setProcessing(false);}
  }
  $('#foodAnalyze').onclick=analyze;
  $('#foodFile').onchange=async()=>{
    const file=$('#foodFile').files[0];if(!file)return;setProcessing(true);
    try {const [photo,tags]=await Promise.all([compressImage(file),exifr.parse(file,{pick:['DateTimeOriginal'],reviveValues:false}).catch(()=>null)]);if(!form.isConnected)return;draft.photo=photo;delete draft.photoPath;draft.suggestions=[];$('#foodDate').value=captureDate(tags)||date;$('#foodTime').value=captureTime(tags);$('#photoPreview').innerHTML=`<img class="upload-preview" src="${e(photo)}" alt="음식 사진">`;$('#analyzeStatus').textContent=captureDate(tags)?'촬영 날짜와 시간을 읽었어요.':'촬영 날짜를 확인할 수 없어 선택한 날짜에 두었어요. 시간은 비워 뒀어요.';renderSuggestions();}
    catch(error){if(form.isConnected)$('#analyzeStatus').textContent=error.message;}
    finally{if(form.isConnected){setProcessing(false);$('#foodFile').value='';}}
    if(form.isConnected&&canAnalyze())await analyze();
  };
  async function search(){const seq=++searching,query=$('#foodSearch').value.trim().toLowerCase();let catalog=[];try{catalog=await loadCatalog();}catch(error){if(form.isConnected)$('#analyzeStatus').textContent=error.message+' 직접 입력할 수 있어요.';}
    if(!form.isConnected||seq!==searching)return;
    const previous=records.flatMap(r=>itemsForRecord(r)).filter(x=>x.name).map(x=>({...x,source:`내 기록 · ${x.source||'직접 입력'}`}));
    const seen=new Set();const matches=[...previous,...catalog].filter(x=>{const key=[x.name,x.kcal,x.grams].join('|');if(seen.has(key)||!x.name.toLowerCase().replace(/\s/g,'').includes(query.replace(/\s/g,'')))return false;seen.add(key);return true;}).slice(0,30);
    $('#foodSearchResults').innerHTML=matches.length?matches.map((item,i)=>`<button type="button" class="food-result" data-food-result="${i}"><strong>${e(item.name)}</strong><small>${item.kcal==null?'열량 미확인':`${Math.round(item.kcal)} kcal`} · ${item.grams?`${item.grams}g 기준`:'기록 기준량'} · ${e(item.source||'식약처')}</small></button>`).join(''):'<p class="disclaimer">검색 결과가 없어요. 음식 이름과 영양표를 직접 입력해 주세요.</p>';
    $('#foodSearchResults').querySelectorAll('[data-food-result]').forEach(button=>button.onclick=()=>{add(matches[Number(button.dataset.foodResult)]);$('#foodSearch').value='';$('#foodSearchResults').innerHTML='';});
  }
  $('#foodSearch').oninput=search;$('#foodSearch').onfocus=search;
  $('#addCustomFood').onclick=()=>add({name:$('#foodSearch').value.trim(),kcal:null,grams:null,source:'직접 입력'});
  form.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.suggestion!==undefined){const index=Number(button.dataset.suggestion);add(draft.suggestions[index]);draft.suggestions.splice(index,1);renderSuggestions();}
    if(button.dataset.removeItem!==undefined){draft.items.splice(Number(button.dataset.removeItem),1);renderItems();}
    if(button.dataset.portion){const i=Number(button.closest('[data-item]').dataset.item);draft.items[i].portion=button.dataset.portion;renderItems();}
  });
  form.addEventListener('input',event=>{const input=event.target,wrapper=input.closest('[data-item]');if(!wrapper)return;const item=draft.items[Number(wrapper.dataset.item)];if(input.dataset.itemField){const key=input.dataset.itemField;item[key]=key==='name'?input.value:input.value===''?null:Number(input.value);
    if(key==='grams'&&item.per100g){const scale=v=>typeof v==='number'&&item.grams>0?Math.round(v*item.grams)/100:null;item.kcal=scale(item.per100g.kcal);item.nutrients=Object.fromEntries(Object.entries(item.per100g.nutrients).map(([k,v])=>[k,scale(v)]));wrapper.querySelector('[data-item-field="kcal"]').value=item.kcal??'';wrapper.querySelectorAll('[data-item-nutrient]').forEach(el=>el.value=item.nutrients[el.dataset.itemNutrient]??'');}
    if(key==='kcal')delete item.per100g;
  }if(input.dataset.itemNutrient){item.nutrients??={};item.nutrients[input.dataset.itemNutrient]=input.value===''?null:Number(input.value);delete item.per100g;}refreshTotal();});
  form.onsubmit=async event=>{event.preventDefault();if(draft.processing)return;if(!draft.photo&&!draft.items.length){$('#analyzeStatus').textContent='사진이나 음식을 하나 추가해 주세요.';return;}setProcessing(true);
    try{const totals=aggregateItems(draft.items),names=draft.items.map(i=>i.name.trim()).filter(Boolean),portion=draft.items.map(i=>`${i.name} ${PORTIONS.find(p=>p[0]===(i.portion||'all'))?.[1]||'전부'}`).join(' · ');
      await onSave({...record,date:$('#foodDate').value,time:$('#foodTime').value,meal:'entry',photo:draft.photo,photoPath:draft.photoPath,items:draft.items,suggestedItems:draft.suggestions,analysisNotes,name:names.join(', ')||'음식 사진',...totals,portion,note:$('#foodNote').value.trim(),pending:!draft.items.length,source:draft.items.some(i=>i.source?.includes('AI'))?'AI 추정 · 먹은 양 확인':'음식·먹은 양 확인'});
    }finally{if(form.isConnected)setProcessing(false);}
  };
  if(record)$('#deleteFood').onclick=()=>onDelete(record);
  renderSuggestions();renderItems();setProcessing(false);
}
