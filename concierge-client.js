import { cloud } from "./cloud.js";
export async function photoForAI(photo) {
  if (photo.startsWith("data:image/")) return photo;
  const uri = new URL(photo);
  if (!cloud || uri.origin !== new URL(cloud.supabaseUrl).origin) throw Error("사진을 다시 선택해 주세요.");
  const response = await fetch(uri);
  if (!response.ok) throw Error("사진을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.");
  const blob = await response.blob();
  return await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(blob); });
}
export async function askConcierge(capture, message, onReply=()=>{},contextCaptures=[]) {
  const { data, error } = cloud ? await cloud.auth.getSession() : {data:{session:null}};
  if (error || !data.session) throw Error("사진은 그대로 보관했어요. AI와 대화하려면 계정에 로그인해 주세요.");
  const history = capture.messages.filter(m => m.role === "user" || m.role === "assistant").slice(-10).map(({role,text}) => ({role,text:text.slice(0,1200)}));
  const response = await fetch("/api/concierge", {method:"POST",headers:{"Content-Type":"application/json",Accept:"application/x-ndjson",Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({captureId:capture.id,capturedDate:capture.capturedDate||null,image:await photoForAI(capture.photo),contextPhotos:await Promise.all(contextCaptures.map(async c=>({id:c.id,date:c.capturedDate||null,image:await photoForAI(c.photo),food:c.analysis?.food||null}))),message,history,current:capture.analysis || null}),signal:AbortSignal.timeout(40000)});
  return readConciergeResponse(response,onReply);
}
export async function readConciergeResponse(response,onReply=()=>{}) {
  if(!response.ok || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const value=await response.json().catch(()=>({}));
    if(!response.ok || typeof value.reply!=="string") throw Error(value.error || "지금 답변을 가져오지 못했어요. 사진 기록은 그대로 남아 있어요.");
    return value;
  }
  if(!response.body)throw Error("답변 연결을 확인해 주세요.");
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let buffer="";
  try {
    while(true) {
      const {value,done}=await reader.read();
      buffer+=decoder.decode(value,{stream:!done});
      if(buffer.length>256000)throw Error("답변 크기를 확인해 주세요.");
      let boundary;
      while((boundary=buffer.indexOf("\n"))!==-1) {
        const line=buffer.slice(0,boundary);buffer=buffer.slice(boundary+1);
        if(!line.trim())continue;
        let event;
        try{event=JSON.parse(line);}catch{throw Error("답변 연결이 끊겼어요. 다시 보내 주세요.");}
        if(event.type==="error")throw Error(event.error||"답변을 마치지 못했어요. 다시 보내 주세요.");
        if(event.type==="reply"&&typeof event.text==="string")onReply(event.text);
        if(event.type==="result"&&typeof event.value?.reply==="string")return event.value;
      }
      if(done)throw Error("답변이 도중에 끊겼어요. 기록 수치는 바꾸지 않았어요. 다시 보내 주세요.");
    }
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
