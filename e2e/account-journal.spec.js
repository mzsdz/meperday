import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {NUTRIENTS} from '../nutrition.js';
const png=fileURLToPath(new URL('./fixtures/replacement.png',import.meta.url));
async function account(page,{delay=false}={}) {
  let payload=null,revision=0,release=()=>{},gate=delay?new Promise(r=>release=r):Promise.resolve();
  await page.addInitScript(()=>{const now=Math.floor(Date.now()/1000);localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'test.'+btoa(JSON.stringify({exp:now+3600,sub:'journal-user'}))+'.signature',refresh_token:'test-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user:{id:'journal-user',aud:'authenticated',role:'authenticated',email:'journal@example.invalid'}}));});
  await page.route('https://example.supabase.co/rest/v1/meday_journals**',async route=>{
    if(route.request().method()==='GET'){await gate;return route.fulfill({json:payload?{payload,revision}:null});}
    const body=route.request().postDataJSON();payload=body.payload;revision=body.revision;return route.fulfill({json:{revision}});
  });
  await page.route('https://example.supabase.co/storage/v1/object/**',route=>route.fulfill({json:{Key:'qa/photo.jpg'}}));
  await page.route('https://example.supabase.co/storage/v1/object/sign/**',route=>route.fulfill({json:{signedURL:'/object/sign/meday-photos/qa/photo.jpg?token=qa'}}));
  return {getPayload:()=>payload,release};
}
test('account shell appears while loading and mutations wait for the account',async({page})=>{
  const state=await account(page,{delay:true});try{await page.goto('/');await expect(page.locator('.calorie-board')).toBeVisible();await expect(page.locator('#journalPhotos')).toBeDisabled();await page.locator('#myPageBtn').click();await expect(page.locator('.management-page')).toBeVisible();state.release();await expect(page.locator('#storageStatus')).toHaveText('내 계정 · 서버 저장');await page.locator('#homeBtn').click();await expect(page.locator('#journalPhotos')).toBeEnabled();}finally{state.release();}
});
test('AI proposals require selection; cloud save and new session preserve portions and modules',async({page})=>{
  const state=await account(page);
  await page.route('**/api/analyze',route=>route.fulfill({json:route.request().method()==='GET'?{configured:true}: {items:[{name:'AI 제안 밥',kcal:600,grams:300,nutrients:Object.fromEntries(NUTRIENTS.map(n=>[n.id,n.id==='protein'?12:null]))}],notes:'사진의 전체 양 기준 추정'}}));
  await page.goto('/');await expect(page.locator('#storageStatus')).toHaveText('내 계정 · 서버 저장');await page.locator('#journalPhotos').setInputFiles(png);await expect(page.locator('[data-suggestion]')).toBeVisible();
  expect(state.getPayload().records[0].kcal).toBeNull();await page.locator('[data-suggestion]').click();await page.locator('[data-portion=third]').click();await page.locator('#foodForm button[type=submit]').click();
  await expect.poll(()=>state.getPayload().records[0]).toMatchObject({kcal:200,items:[{portion:'third',kcal:600}]});expect(state.getPayload().records[0].photo).toBeUndefined();expect(state.getPayload().records[0].photoPath).toBeTruthy();
  await page.reload();await expect(page.locator('.food-entry')).toContainText('200 kcal');await page.locator('.food-entry').click();await expect(page.locator('#foodTotal')).toHaveText('200 kcal');
  await page.locator('[data-portion=half]').click();await page.locator('#foodForm button[type=submit]').click();await expect.poll(()=>state.getPayload().records[0].kcal).toBe(300);
  await page.locator('#myPageBtn').click();await expect(page.locator('[data-module=protein]')).toContainText('6');await page.locator('[data-remove-module=fat]').click();await expect.poll(()=>state.getPayload().dashboard.nutrients.includes('fat')).toBe(false);await page.reload();await page.locator('#myPageBtn').click();await expect(page.locator('[data-module=fat]')).toHaveCount(0);
});
test('scale OCR fills numeric result and unreadable photo remains blank',async({page})=>{
  await account(page);let kg=84.9;
  await page.route('**/api/analyze',route=>route.fulfill({json:route.request().method()==='GET'?{configured:true}:{kg,notes:'숫자 확인'}}));
  await page.goto('/');await expect(page.locator('#storageStatus')).toHaveText('내 계정 · 서버 저장');await page.locator('#weightPageBtn').click();await page.locator('[data-add=weight]').click();await page.locator('#weightFile').setInputFiles(png);await expect(page.locator('#weightKg')).toHaveValue('84.9');
  kg=null;await page.locator('#weightFile').setInputFiles(png);await expect(page.locator('#weightStatus')).toContainText('읽지 못했어요');await expect(page.locator('#weightKg')).toHaveValue('');await page.locator('#weightForm button[type=submit]').click();await expect(page.locator('.weight-entry')).toContainText('숫자 미확인');
});
test('AI unavailable still saves photos, food search and manual portions',async({page})=>{
  await page.route('**/api/analyze',route=>route.fulfill({json:{configured:false}}));await page.goto('/');await page.locator('#journalPhotos').setInputFiles(png);await expect(page.locator('#foodForm')).toBeVisible();await expect(page.locator('#foodAnalyze')).toBeDisabled();await page.locator('#foodForm button[type=submit]').click();await page.reload();await expect(page.locator('.food-entry')).toBeVisible();await expect(page.locator('.food-entry')).toContainText('열량 미확인');
});
