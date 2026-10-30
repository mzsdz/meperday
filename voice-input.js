export function mergeVoiceDraft(base,start,end,transcript,maxLength=600) {
  start=Math.max(0,Math.min(base.length,start));end=Math.max(start,Math.min(base.length,end));
  const text=transcript.trim();if(!text)return {value:base,truncated:false};
  const prefix=base.slice(0,start),suffix=base.slice(end);
  const left=prefix&&!/\s$/.test(prefix)?' ':'',right=suffix&&!/^\s/.test(suffix)?' ':'';
  const available=Math.max(0,maxLength-prefix.length-suffix.length-left.length-right.length);
  let spoken=text.slice(0,available);if(/[\uD800-\uDBFF]$/.test(spoken))spoken=spoken.slice(0,-1);
  return {value:spoken?prefix+left+spoken+right+suffix:base,truncated:spoken.length<text.length};
}
const messages={
  'not-allowed':'마이크·음성 인식 권한을 확인해 주세요. 키보드의 마이크로도 입력할 수 있어요.',
  'service-not-allowed':'음성 인식을 사용할 수 없어요. Safari의 권한과 Siri·받아쓰기 설정을 확인하거나 키보드 마이크를 이용해 주세요.',
  'audio-capture':'마이크를 사용할 수 없어요. 다른 앱에서 사용 중인지 확인해 주세요.',
  'no-speech':'말소리가 들리지 않았어요. 마이크를 눌러 다시 말해 주세요.',
  'network':'음성 인식에 연결하지 못했어요. 다시 시도하거나 키보드로 입력해 주세요.',
  'language-not-supported':'이 브라우저에서 한국어 음성 인식을 사용할 수 없어요. 키보드 마이크를 이용해 주세요.',
};
export function bindVoiceInput({input,button,status}) {
  if(!input||!button||!status)return {destroy(){},cancel(){}};
  let session=null,destroyed=false,writing=false;
  const notify=text=>{if(destroyed)return;status.textContent=text;status.hidden=!text;};
  const paint=()=>{const active=!!session;button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'음성 입력 멈추기':'음성으로 입력');button.title=active?'음성 입력 멈추기':'음성으로 입력';button.classList.toggle('listening',active);button.disabled=input.disabled||session?.phase==='stopping';};
  const finish=(s,text='',abort=false)=>{
    if(session!==s)return;session=null;clearTimeout(s.startTimer);clearTimeout(s.limitTimer);clearTimeout(s.stopTimer);
    s.recognition.onstart=s.recognition.onresult=s.recognition.onerror=s.recognition.onend=null;
    if(abort)try{s.recognition.abort();}catch{}
    paint();notify(text);
  };
  const stop=()=>{
    const s=session;if(!s||s.phase==='stopping')return;s.phase='stopping';paint();notify('음성 입력을 마무리하고 있어요…');
    s.stopTimer=setTimeout(()=>finish(s,s.notice||'입력된 내용을 확인하고 보내 주세요.',true),2500);
    try{s.recognition.stop();}catch{finish(s,s.notice||'음성 입력을 멈췄어요.',true);}
  };
  const click=()=>{
    if(session){stop();return;}if(destroyed||input.disabled)return;
    const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
    if(typeof Recognition!=='function'){notify('이 브라우저는 음성 입력을 지원하지 않아요. Safari에서 열거나 키보드의 마이크를 이용해 주세요.');return;}
    let recognition;
    try{recognition=new Recognition();}catch{notify('음성 입력을 시작하지 못했어요. 키보드 마이크를 이용해 주세요.');return;}
    const s={recognition,base:input.value,start:input.selectionStart??input.value.length,end:input.selectionEnd??input.value.length,heard:false,phase:'starting'};session=s;
    recognition.lang='ko-KR';recognition.interimResults=true;recognition.continuous=false;recognition.maxAlternatives=1;
    recognition.onstart=()=>{if(session!==s||destroyed)return;clearTimeout(s.startTimer);s.phase='listening';paint();notify('듣고 있어요. 다 말했으면 마이크를 다시 눌러 주세요.');s.limitTimer=setTimeout(stop,60000);};
    recognition.onresult=event=>{
      if(session!==s||destroyed||!input.isConnected||input.disabled)return;
      const text=Array.from(event.results,result=>result[0]?.transcript||'').join(' ');
      if(!text.trim())return;
      const merged=mergeVoiceDraft(s.base,s.start,s.end,text,input.maxLength>0?input.maxLength:600);
      if(text.trim())s.heard=true;
      writing=true;input.value=merged.value;input.setSelectionRange(input.value.length,input.value.length);input.dispatchEvent(new Event('input',{bubbles:true}));writing=false;
      if(merged.truncated){s.notice='600자까지 입력했어요. 내용을 확인하고 보내 주세요.';stop();}
    };
    recognition.onerror=event=>{if(session!==s)return;finish(s,event.error==='aborted'?'음성 입력을 멈췄어요.':messages[event.error]||'음성 입력을 완료하지 못했어요. 키보드로 계속 입력할 수 있어요.',true);};
    recognition.onend=()=>{if(session!==s)return;finish(s,s.notice||(s.heard?'입력됐어요. 내용을 확인하고 보내 주세요.':'말소리가 들리지 않았어요. 다시 시도해 주세요.'));};
    paint();notify('마이크를 연결하고 있어요…');input.blur();
    s.startTimer=setTimeout(()=>finish(s,'음성 입력 연결이 지연돼요. 권한을 확인하거나 키보드 마이크를 이용해 주세요.',true),12000);
    try{recognition.start();}catch(error){finish(s,messages[error.name==='NotAllowedError'?'not-allowed':error.name]||'음성 입력을 시작하지 못했어요. 다시 시도해 주세요.',true);}
  };
  const edited=()=>{if(!writing&&session)finish(session,'음성 입력을 멈췄어요. 직접 수정한 내용을 유지해요.',true);};
  const cancel=()=>{if(session)finish(session,'',true);};
  const hidden=()=>{if(document.hidden)cancel();};
  button.addEventListener('click',click);input.addEventListener('input',edited);document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',cancel);paint();
  return {cancel,destroy(){cancel();destroyed=true;button.removeEventListener('click',click);input.removeEventListener('input',edited);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',cancel);}};
}
