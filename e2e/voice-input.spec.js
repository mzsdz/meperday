import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {mine} from './helpers.js';
const photo=fileURLToPath(new URL('./fixtures/oriented-exif.jpg',import.meta.url));
async function mockSpeech(page,prefixed=false){
 await page.addInitScript(({prefixed})=>{
  window.__speech=[];
  class Recognition {
   constructor(){this.starts=0;this.stops=0;this.aborts=0;window.__speech.push(this);}
   start(){this.starts++;this.onstart?.();}
   stop(){this.stops++;}
   abort(){this.aborts++;}
   say(text){this.onresult?.({resultIndex:0,results:[[{transcript:text}]]});}
   end(){this.onend?.();}
   fail(error){this.onerror?.({error});}
  }
  Object.defineProperty(window,'SpeechRecognition',{value:prefixed?undefined:Recognition,configurable:true});
  Object.defineProperty(window,'webkitSpeechRecognition',{value:prefixed?Recognition:undefined,configurable:true});
 },{prefixed});
}
async function openChat(page){await page.goto('/');await page.locator('#conciergePhoto').setInputFiles(photo);await expect(page.locator('#conciergeMessage')).toBeEnabled();}
for(const width of [320,393,430])test(`${width}px microphone previews Korean speech without automatically sending and keeps a reachable composer`,async({page},testInfo)=>{
 await mockSpeech(page);await page.setViewportSize({width,height:736});await openChat(page);
 expect(await page.evaluate(()=>window.__speech.length)).toBe(0);
 await page.locator('#conciergeMessage').fill('밥은');await page.locator('#voiceInputButton').click();await expect(page.locator('#voiceInputButton')).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>({lang:window.__speech[0].lang,interim:window.__speech[0].interimResults}))).toEqual({lang:'ko-KR',interim:true});
 await page.evaluate(()=>window.__speech[0].say('절반'));await expect(page.locator('#conciergeMessage')).toHaveValue('밥은 절반');
 await page.evaluate(()=>window.__speech[0].say('절반만 먹었어'));await expect(page.locator('#conciergeMessage')).toHaveValue('밥은 절반만 먹었어');await expect(page.locator('.from-user')).toHaveCount(0);
 if(width===393)await page.screenshot({path:testInfo.outputPath('voice-listening.png')});
 await page.locator('#voiceInputButton').click();expect(await page.evaluate(()=>window.__speech[0].stops)).toBe(1);
 await page.evaluate(()=>{window.__speech[0].say('절반만 먹었어요');window.__speech[0].end();});
 await expect(page.locator('#conciergeMessage')).toHaveValue('밥은 절반만 먹었어요');await expect(page.locator('#voiceInputButton')).toHaveAttribute('aria-pressed','false');
 await page.setViewportSize({width,height:400});await expect.poll(async()=>{const input=await page.locator('#conciergeMessage').boundingBox();return input.y+input.height<=400;}).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#conciergeForm button[type="submit"]').click();await expect(page.locator('.from-user')).toContainText('밥은 절반만 먹었어요');
});
test('prefixed speech errors preserve the typed draft and allow another attempt',async({page})=>{
 await mockSpeech(page,true);await openChat(page);await page.locator('#conciergeMessage').fill('기존 메모');await page.locator('#voiceInputButton').click();
 await page.evaluate(()=>window.__speech[0].fail('not-allowed'));await expect(page.locator('#voiceStatus')).toContainText('권한');await expect(page.locator('#conciergeMessage')).toHaveValue('기존 메모');await expect(page.locator('#voiceInputButton')).toHaveAttribute('aria-pressed','false');
 await page.locator('#voiceInputButton').click();await page.evaluate(()=>{window.__speech[1].say('반만 먹었어');window.__speech[1].end();});await expect(page.locator('#conciergeMessage')).toHaveValue('기존 메모 반만 먹었어');
});
test('typing or leaving the conversation stops recognition and ignores late results',async({page})=>{
 await mockSpeech(page);await openChat(page);await page.locator('#voiceInputButton').click();
 await page.evaluate(()=>{window.__lateResult=window.__speech[0].onresult;window.__speech[0].say('음성 초안');});
 await page.locator('#conciergeMessage').fill('직접 고친 내용');expect(await page.evaluate(()=>window.__speech[0].aborts)).toBe(1);
 await page.evaluate(()=>window.__lateResult({results:[[{transcript:'늦은 잘못된 결과'}]]}));await expect(page.locator('#conciergeMessage')).toHaveValue('직접 고친 내용');
 await page.locator('#voiceInputButton').click();await page.locator('#settingsButton').click();expect(await page.evaluate(()=>window.__speech[1].aborts)).toBe(1);await page.locator('#overlay [data-close]').first().click();
 await page.locator('#voiceInputButton').click();await page.evaluate(()=>{window.__lateResult=window.__speech[2].onresult;});await mine(page);expect(await page.evaluate(()=>window.__speech[2].aborts)).toBe(1);
 await page.locator('.timeline-row').click();await page.evaluate(()=>window.__lateResult({results:[[{transcript:'다른 화면에 들어가면 안 됨'}]]}));await expect(page.locator('#conciergeMessage')).toHaveValue('');await expect(page.locator('.from-user')).toHaveCount(0);
});
test('unsupported speech falls back to a useful keyboard microphone hint without losing text',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});});
 await openChat(page);await page.locator('#conciergeMessage').fill('남긴 양');await page.locator('#voiceInputButton').click();await expect(page.locator('#voiceStatus')).toContainText('키보드의 마이크');await expect(page.locator('#conciergeMessage')).toHaveValue('남긴 양');await expect(page.locator('.from-user')).toHaveCount(0);
});
