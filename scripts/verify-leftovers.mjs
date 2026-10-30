// Live regression with controlled meal diagrams; calorie values are not ground truth.
// Uses a disposable account; never touches an existing user's records.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {webkit,expect} from '@playwright/test';
import {readConciergeResponse} from '../concierge-client.js';
import {mine} from '../e2e/helpers.js';
const origin=process.env.VERIFY_BROWSER_URL||'https://meperday.vercel.app';
const config={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.VITE_SUPABASE_URL,process.env.TEST_SUPABASE_ADMIN_KEY,config);
const owner=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,config);
const email=`meday-leftovers-${crypto.randomUUID()}@example.invalid`,password=crypto.randomUUID()+'Aa1!';
const beforeFile=fileURLToPath(new URL('../e2e/fixtures/meal-before.png',import.meta.url)),afterFile=fileURLToPath(new URL('../e2e/fixtures/meal-after.png',import.meta.url));
let id,browser,page,server;
try {
 if(process.env.VERIFY_LOCAL_HANDLER==='1') {
  execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'pipe'});
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
      if(path.includes('..')||path.includes('%')){res.writeHead(400);res.end();return;}
      const file=path==='/'?'index.html':path.slice(1),content=await readFile(new URL('../dist/'+file,import.meta.url));
      res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(content);
    }catch{res.writeHead(500);res.end('QA server request failed');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(origin).port),'127.0.0.1',resolve);});
 }
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true});if(made.error)throw made.error;id=made.data.user.id;
 const login=await owner.auth.signInWithPassword({email,password});if(login.error)throw login.error;
 const initialResponse=await fetch(origin+'/api/concierge',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson',Authorization:`Bearer ${login.data.session.access_token}`},body:JSON.stringify({image:'data:image/png;base64,'+(await readFile(beforeFile)).toString('base64')})});
 const full=await readConciergeResponse(initialResponse);assert.equal(full.kind,'food');assert.ok(full.food.kcal>0);
 browser=await webkit.launch();page=await browser.newPage({viewport:{width:393,height:736},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const link=await admin.auth.admin.generateLink({type:'magiclink',email,options:{redirectTo:origin}});if(link.error)throw link.error;
 await page.goto(link.data.properties.action_link);await expect(page.locator('#storageStatus')).toContainText('서버 저장',{timeout:20000});
 const journal=async()=>{const r=await owner.from('meday_journals').select('payload,revision').eq('user_id',id).single();if(r.error)throw r.error;return r.data;};
 const uploadPair=async()=>{
  await page.locator('#conciergePhoto').setInputFiles([beforeFile,afterFile]);
  await expect(page.locator('.meal-photo-pair img')).toHaveCount(2,{timeout:90000});await expect(page.locator('#conciergeMessage')).toBeEnabled();
  const j=(await journal()).payload;assert.equal(j.captures.length,2);assert.equal(j.records.length,1);
  assert.equal(j.captures[0].mealPair.beforeId,j.captures[0].id);assert.equal(j.captures[0].mealPair.afterId,j.captures[1].id);
  if(j.records[0].kcal!==null){const portions=j.captures[0].analysis.portions;assert.ok(portions.before.kcal>0&&portions.leftovers.kcal>0);assert.equal(j.records[0].kcal,Math.round(portions.before.kcal-portions.leftovers.kcal));assert.ok(j.records[0].kcal<portions.before.kcal);}
  else assert.ok(j.captures[0].analysis.portions.before.kcal===null||j.captures[0].analysis.portions.leftovers.kcal===null);
  assert.notEqual(j.captures[0].photoPath,j.captures[1].photoPath);return j;
 };
 const first=await uploadPair(),kcal=first.records[0].kcal;
 await page.screenshot({path:'test-results/live-leftovers-pair.png'});
 await page.locator('#conciergeMessage').fill('남긴 양을 이미 빼고 계산한 거지? 이유만 설명해 줘. 양은 바꾸지 마.');await page.locator('#conciergeForm button[type="submit"]').click();
 await expect(page.locator('.from-assistant')).toHaveCount(2,{timeout:60000});await expect(page.locator('#conciergeMessage')).toBeEnabled();assert.equal((await journal()).payload.records[0].kcal,kcal);
 await page.reload();await expect(page.locator('.meal-photo-pair img')).toHaveCount(2,{timeout:20000});
 await page.locator('.photo-batch button').nth(1).click();await page.locator('#editConversationRecord').click();await page.locator('#foodKcal').fill('321');await page.locator('#foodForm button[type="submit"]').click();await expect(page.locator('#overlay')).toHaveClass(/hidden/);
 await page.reload();await expect(page.locator('.conversation-fact')).toContainText('321');
 const edited=(await journal()).payload;assert.equal(edited.records.length,1);assert.equal(edited.captures[1].photoPath,first.captures[1].photoPath);
 await mine(page);await expect(page.locator('.timeline-row')).toHaveCount(1);await expect(page.locator('.cal-big')).toContainText('321');await page.locator('.timeline-row').click();
 page.once('dialog',d=>d.accept());await page.locator('#deleteConversation').click();await expect(page.locator('.photo-message')).toHaveCount(0);await page.reload();await expect(page.locator('#conciergePhoto')).toHaveCount(1);assert.equal((await journal()).payload.records.length,0);assert.equal((await journal()).payload.captures.length,0);
 // Recreate the legacy double-count shape in this QA user's own row, then repair via the real UI/model.
 await uploadPair();const legacy=await journal();legacy.payload.records=[];
 for(const c of legacy.payload.captures){delete c.mealPair;delete c.linkedRecordId;c.analysis={...full,mealPhotos:null};legacy.payload.records.push({id:c.id,date:c.date,time:c.time,photoPath:c.photoPath,name:full.food.name,kcal:full.food.kcal,nutrients:full.food.nutrients,meal:'entry',source:'QA regression: legacy independent-photo records'});}
 const seeded=await owner.from('meday_journals').update({payload:legacy.payload,revision:legacy.revision+1}).eq('user_id',id).eq('revision',legacy.revision);if(seeded.error)throw seeded.error;
 await page.reload();await page.locator('#reviewLeftovers').click();await expect(page.locator('.meal-photo-pair img')).toHaveCount(2,{timeout:60000});await expect(page.locator('#conciergeMessage')).toBeEnabled();
 const repaired=(await journal()).payload;assert.equal(repaired.records.length,1);if(repaired.records[0].kcal!==null){const p=repaired.captures[0].analysis.portions;assert.equal(repaired.records[0].kcal,Math.round(p.before.kcal-p.leftovers.kcal));assert.ok(repaired.records[0].kcal<p.before.kcal);}assert.equal(repaired.captures.length,2);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS: real vision comparison → one consumed meal → question does not deduct again → private photo reload → manual edit preserves both photos → deletion → legacy duplicate repair',servedEstimate:full.food.kcal,consumedEstimate:kcal,repairedEstimate:repaired.records[0].kcal,fixtures:'controlled meal diagrams, not calorie ground truth'}));
} catch(error){if(page)console.log('QA visible state:',await page.locator('body').innerText().catch(()=>''));throw error;}
finally {
 await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(id){const listed=await admin.storage.from('meday-photos').list(id);if(listed.error)throw listed.error;if(listed.data.length){const removed=await admin.storage.from('meday-photos').remove(listed.data.map(p=>`${id}/${p.name}`));if(removed.error)throw removed.error;}const removed=await admin.auth.admin.deleteUser(id);if(removed.error)throw removed.error;console.log('PASS: disposable leftovers QA account and photos cleaned up');}
}
