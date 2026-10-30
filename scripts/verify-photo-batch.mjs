// Real production vision + private persistence, disposable QA account only.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { webkit, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const origin=process.env.VERIFY_BROWSER_URL;
if(!origin || !process.env.TEST_SUPABASE_ADMIN_KEY)throw Error('Explicit live QA configuration required');
const config={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.VITE_SUPABASE_URL,process.env.TEST_SUPABASE_ADMIN_KEY,config);
const owner=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,config);
const email=`meday-batch-${crypto.randomUUID()}@example.invalid`,password=crypto.randomUUID()+'Aa1!';
let id,browser,page,server;
try {
  if(process.env.VERIFY_LOCAL_HANDLER==='1') {
    const {default:handler}=await import('../api/concierge.js');
    server=createServer(async(req,res)=>{
      try {
        if(req.url.startsWith('/api/')) {
          const buffers=[];for await(const chunk of req)buffers.push(chunk);req.body=buffers.length?JSON.parse(Buffer.concat(buffers).toString()):{};
          res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};return await handler(req,res);
        }
        const path=new URL(req.url,origin).pathname,file=path==='/'?'index.html':path.slice(1);
        if(path.includes('..')){res.writeHead(400);res.end();return;}
        const content=await readFile(new URL('../dist/'+file,import.meta.url));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(content);
      }catch{res.writeHead(500);res.end('QA request failed');}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(origin).port),'127.0.0.1',resolve);});
  }
  const made=await admin.auth.admin.createUser({email,password,email_confirm:true});if(made.error)throw made.error;id=made.data.user.id;
  const signed=await owner.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;
  browser=await webkit.launch();page=await browser.newPage({viewport:{width:393,height:736},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=async()=>{const link=await admin.auth.admin.generateLink({type:'magiclink',email,options:{redirectTo:origin}});if(link.error)throw link.error;await page.goto(link.data.properties.action_link);await expect(page.locator('#storageStatus')).toContainText('서버 저장',{timeout:20000});};
  const journal=async()=>{const r=await owner.from('meday_journals').select('payload').eq('user_id',id).single();if(r.error)throw r.error;return r.data.payload;};
  await login();
  await page.locator('#conciergePhoto').setInputFiles([
    fileURLToPath(new URL('../../food-ai.jpg',import.meta.url)),
    fileURLToPath(new URL('../e2e/fixtures/fitness-ai.png',import.meta.url)),
    fileURLToPath(new URL('../e2e/fixtures/oriented-exif.jpg',import.meta.url)),
  ]);
  await expect(page.locator('.batch-status')).toContainText('3장 중 3장 보관 완료',{timeout:150000});
  await expect(page.locator('#conciergeMessage')).toBeEnabled();
  const first=await journal();assert.equal(first.captures.length,3);assert.equal(new Set(first.captures.map(c=>c.id)).size,3);assert.equal(new Set(first.captures.map(c=>c.batchId)).size,1);
  assert.equal(first.captures[2].date,'2026-10-27');assert.equal(first.captures[2].time,'08:09');assert.equal(first.captures[2].capturedDate,'2026-10-27');
  assert.equal(first.captures[0].time,'');assert.equal(first.captures[0].capturedDate,null);
  assert.ok(first.records.some(r=>r.id===first.captures[0].id&&r.kcal>0));assert.ok(first.exercises.some(r=>r.minutes===35&&r.calories===180));
  assert.ok(first.captures.every(c=>c.photoPath&&!c.photo&&c.messages.some(m=>m.role==='assistant')));
  await expect(page.locator('.photo-batch button')).toHaveCount(3);
  await page.reload();await expect(page.locator('.photo-batch button')).toHaveCount(3,{timeout:20000});
  for(let i=0;i<3;i++){await page.locator('.photo-batch button').nth(i).click();await expect.poll(()=>page.locator('.photo-message img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);}
  await page.screenshot({path:'test-results/live-batch.png',fullPage:true});
  await page.locator('.photo-batch button').first().click();
  const before=await journal(),beforeKcal=before.records.find(r=>r.id===before.captures[0].id).kcal;
  const replies=await page.locator('.from-assistant').count();
  await page.locator('#conciergeMessage').fill('사진에 없는 치킨도 먹었어. 사진은 없는데 이 기록에 치킨 한 마리 1800kcal도 추가해 줘.');await page.locator('#conciergeForm button[type="submit"]').click();
  await expect(page.locator('.from-assistant')).toHaveCount(replies+1,{timeout:60000});await expect(page.locator('#conciergeMessage')).toBeEnabled();
  const after=await journal();assert.equal(after.records.find(r=>r.id===before.captures[0].id).kcal,beforeKcal);assert.equal(after.records.length,before.records.length);await expect(page.locator('.from-assistant').last()).toContainText('사진');
  await page.locator('#settingsButton').click();await page.locator('#signOut').click();await expect(page.locator('#storageStatus')).toContainText('이 기기에 저장',{timeout:20000});
  await login();await expect(page.locator('.photo-batch button')).toHaveCount(3);assert.equal((await journal()).captures.length,3);assert.deepEqual(errors,[]);
  console.log('PASS: live mobile WebKit three-file batch → genuine food/workout AI → EXIF past-date placement → private photo reload → separate conversations → off-photo chat addition refused → logout/login requery');
} catch(error) {if(page)console.log('QA visible state:',await page.locator('body').innerText().catch(()=>''));throw error;}
finally {
  await browser?.close();if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(id){const photos=await admin.storage.from('meday-photos').list(id);if(photos.error)throw photos.error;if(photos.data.length){const removed=await admin.storage.from('meday-photos').remove(photos.data.map(p=>`${id}/${p.name}`));if(removed.error)throw removed.error;}const removed=await admin.auth.admin.deleteUser(id);if(removed.error)throw removed.error;console.log('PASS: QA user and photos cleaned up');}
}
