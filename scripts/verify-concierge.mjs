// Real model + private storage verification using disposable QA users only.
// VERIFY_LOCAL_HANDLER=1 serves the built app and the real handler on :4180.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { webkit, expect } from '@playwright/test';
const origin=process.env.VERIFY_BROWSER_URL || 'http://127.0.0.1:4180';
const config={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.VITE_SUPABASE_URL,process.env.TEST_SUPABASE_ADMIN_KEY,config);
const email=`meday-concierge-${crypto.randomUUID()}@example.invalid`;
const password=crypto.randomUUID()+'Aa1!';
const owner=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,config);
let id, browser, server, page;
try {
  if(process.env.VERIFY_LOCAL_HANDLER==='1') {
    const {default:handler}=await import('../api/concierge.js');
    server=createServer(async(req,res)=>{
      try {
        if(req.url.startsWith('/api/')) {
          const buffers=[];for await(const chunk of req)buffers.push(chunk);
          req.body=buffers.length?JSON.parse(Buffer.concat(buffers).toString()):{};
          res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
          return await handler(req,res);
        }
        const path=new URL(req.url,origin).pathname;
        if(path.includes('..')) {res.writeHead(400);res.end();return;}
        const file=path==='/'?'index.html':path.slice(1);
        const content=await readFile(new URL('../dist/'+file,import.meta.url));
        res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(content);
      } catch {res.writeHead(500);res.end('QA server request failed');}
    });
    await new Promise(resolve=>server.listen(4180,'127.0.0.1',resolve));
  }
  const made=await admin.auth.admin.createUser({email,password,email_confirm:true});
  if(made.error)throw made.error;id=made.data.user.id;
  const login=await owner.auth.signInWithPassword({email,password});if(login.error)throw login.error;
  browser=await webkit.launch();
  page=await browser.newPage({viewport:{width:393,height:736},isMobile:true,hasTouch:true});
  page.on('response',async r=>{if(r.status()>=400)console.log('QA response',new URL(r.url()).pathname,r.status(),await r.text().catch(()=>''));});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const link=await admin.auth.admin.generateLink({type:'magiclink',email,options:{redirectTo:origin}});
  if(link.error)throw link.error;
  await page.goto(link.data.properties.action_link);
  await expect(page.locator('#storageStatus')).toContainText('서버 저장',{timeout:20000});
  const journal=async()=>{const r=await owner.from('meday_journals').select('payload').eq('user_id',id).single();if(r.error)throw r.error;return r.data.payload;};
  const photo=fileURLToPath(new URL('../../food-ai.jpg',import.meta.url));
  await page.locator('#conciergePhoto').setInputFiles(photo);
  await expect(page.locator('.from-assistant')).toHaveCount(1,{timeout:60000});
  await expect(page.locator('#conciergeMessage')).toBeEnabled();
  const initial=await journal();assert.equal(initial.records.length,1);assert.ok(initial.records[0].kcal>0);assert.equal(initial.records[0].time,'');
  const recordId=initial.records[0].id, initialKcal=initial.records[0].kcal;
  await page.locator('#conciergeMessage').fill('사진 속 샐러드와 같은 구성을 두 그릇 먹었어. 이 음식의 먹은 양을 두 그릇으로 고쳐줘.');
  await page.locator('#conciergeForm button').click();
  await expect(page.locator('.from-assistant')).toHaveCount(2,{timeout:60000});await expect(page.locator('#conciergeMessage')).toBeEnabled();
  const revised=await journal();assert.equal(revised.records.length,1);assert.equal(revised.records[0].id,recordId);assert.ok(revised.records[0].kcal>initialKcal);
  const revisedKcal=revised.records[0].kcal;
  await page.locator('#conciergeMessage').fill('어떤 기준으로 이 열량을 계산한 거야? 양을 더 추가한 것은 아니야.');await page.locator('#conciergeForm button').click();
  await expect(page.locator('.from-assistant')).toHaveCount(3,{timeout:60000});await expect(page.locator('#conciergeMessage')).toBeEnabled();
  assert.equal((await journal()).records[0].kcal,revisedKcal);
  await page.reload();await expect(page.locator('.from-assistant')).toHaveCount(3,{timeout:20000});
  await expect.poll(()=>page.locator('.photo-message img').evaluate(img=>img.naturalWidth),{timeout:20000}).toBeGreaterThan(0);
  await expect(page.locator('.conversation-messages')).toContainText('두 그릇');
  await page.screenshot({path:'test-results/live-conversation.png',fullPage:true});
  await page.locator('#myPageBtn').click();await expect(page.locator('.cal-big')).toContainText(revisedKcal.toLocaleString());
  await page.locator('#homeBtn').click();
  await page.locator('#conciergePhoto').setInputFiles(fileURLToPath(new URL('../e2e/fixtures/fitness-ai.png',import.meta.url)));
  await expect(page.locator('.from-assistant')).toHaveCount(1,{timeout:60000});await expect(page.locator('#conciergeMessage')).toBeEnabled();
  const activity=await journal();assert.equal(activity.exercises.length,1);assert.equal(activity.exercises[0].minutes,35);assert.equal(activity.exercises[0].calories,180);assert.equal(activity.exercises[0].time,'');
  assert.equal(activity.captures.length,2);assert.ok(activity.captures.every(c=>c.photoPath&&!c.photo));
  const ledger=await owner.from('meday_points_ledger').select('id').eq('user_id',id);if(ledger.error)throw ledger.error;assert.equal(ledger.data.length,0);
  await page.locator('#editConversationRecord').click();await page.locator('#exType').fill('대화 이후 직접 수정한 걷기');await page.locator('#exerciseForm button[type="submit"]').click();
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);await page.reload();await page.locator('#myPageBtn').click();await expect(page.locator('[data-record-kind="exercise"]')).toContainText('대화 이후 직접 수정한 걷기');
  await page.locator('[data-record-kind="exercise"]').click();page.once('dialog',d=>d.accept());await page.locator('#deleteConversation').click();
  await expect(page.locator('.photo-message')).toHaveCount(0);await page.reload();await expect(page.locator('#storageStatus')).toContainText('서버 저장');assert.equal((await journal()).exercises.length,0);assert.equal((await journal()).captures.length,1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS: real mobile WebKit login → food photo → genuine AI correction → question preserves calories → database reload → workout OCR → manual edit → delete; no new points',initialKcal,revisedKcal,workoutMinutes:35,workoutCalories:180}));
} catch(error) {
  if(page) console.log('QA visible state:',await page.locator('body').innerText().catch(()=>''));
  throw error;
} finally {
  await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(id) {
    const photos=await admin.storage.from('meday-photos').list(id);if(photos.error)throw photos.error;
    if(photos.data.length){const removed=await admin.storage.from('meday-photos').remove(photos.data.map(p=>`${id}/${p.name}`));if(removed.error)throw removed.error;}
    const removed=await admin.auth.admin.deleteUser(id);if(removed.error)throw removed.error;
    console.log('PASS: disposable QA account and photos cleaned up');
  }
}
