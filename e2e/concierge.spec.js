import { test, expect } from "@playwright/test";
import { mine, addManual } from "./helpers.js";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const photo=fileURLToPath(new URL("./fixtures/oriented-exif.jpg",import.meta.url));
for (const width of [320,393,430]) test(`${width}px one photo home keeps a complete record and conversation without meal labels`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:736});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#conciergePhoto')).toHaveCount(1);
  await expect(page.locator('#modeSwitch')).toBeHidden();await expect(page.locator('.cal-big')).toHaveCount(0);await expect(page.locator('#pointsButton')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  if(width===393) await page.screenshot({path:testInfo.outputPath('home.png')});
  await page.locator('#conciergePhoto').setInputFiles(photo);await expect(page.locator('.photo-message img')).toBeVisible();
  await page.reload();await expect(page.locator('.photo-message img')).toBeVisible();
  await page.locator('#conciergeMessage').fill('밥 두 공기였어');await page.locator('#conciergeForm button').click();
  await expect(page.locator('.conversation-messages')).toContainText('로그인해 주세요');
  await page.locator('[data-classify="food"]').click();await mine(page);
  await expect(page.locator('.timeline-row')).toContainText('08:09');await expect(page.locator('.timeline-row')).toContainText('열량 미확인');
  await expect(page.getByRole('combobox',{name:'구분'})).toHaveCount(0);
  await page.locator('.timeline-row').click();await expect(page.locator('.conversation-messages')).toContainText('밥 두 공기였어');
  expect(errors).toEqual([]);
});

const jpeg=readFileSync(photo),png=readFileSync(new URL('./fixtures/replacement.png',import.meta.url));
function datedPhoto(date,time='08:09:10') {
  const buffer=Buffer.from(jpeg), offset=buffer.indexOf('2026:10:27 08:09:10');
  if(offset<0)throw Error('EXIF fixture missing');
  buffer.write(`${date.replaceAll('-',':')} ${time}`,offset,'ascii');
  return {name:`${date}.jpg`,mimeType:'image/jpeg',buffer};
}
const readJournal=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('meday-mvp-v02')));
test('three photos keep independent dates, times and conversations through reload and month navigation',async({page})=>{
  await page.goto('/');await expect(page.locator('#conciergePhoto')).toHaveAttribute('multiple','');
  await page.locator('#conciergePhoto').setInputFiles([datedPhoto('2026-10-27'),datedPhoto('2026-10-25','18:30:00'),{name:'no-exif.png',mimeType:'image/png',buffer:png}]);
  await expect(page.locator('.batch-status')).toContainText('3장 중 3장 보관 완료');
  const j=await readJournal(page);expect(j.captures).toHaveLength(3);expect(new Set(j.captures.map(c=>c.id)).size).toBe(3);
  expect(j.captures[0]).toMatchObject({date:'2026-10-27',time:'08:09',capturedDate:'2026-10-27'});
  expect(j.captures[1]).toMatchObject({date:'2026-10-25',time:'18:30',capturedDate:'2026-10-25'});
  expect(j.captures[2]).toMatchObject({time:'',capturedDate:null});
  await expect(page.locator('.photo-batch button')).toHaveCount(3);
  await page.locator('.photo-batch button').nth(1).click();await expect(page.locator('.capture-stamp')).toContainText('2026-10-25 18:30');
  await page.reload();await expect(page.locator('.photo-batch button')).toHaveCount(3);
  await page.locator('.photo-batch button').nth(2).click();await expect(page.locator('.capture-stamp')).toContainText('촬영일 미확인');
  await page.locator('.photo-batch button').first().click();await page.locator('[data-classify="food"]').click();await mine(page);
  await expect(page.locator('.date-title')).toContainText('10월 27일');await expect(page.locator('.timeline-row')).toContainText('08:09');
  await page.locator('[data-view="month"]').click();await page.locator('[data-past="2026-10-25"]').click();await expect(page.locator('.timeline-row')).toContainText('18:30');
});
test('more than three files are rejected without silently dropping any selection',async({page})=>{
  await page.goto('/');await page.locator('#conciergePhoto').setInputFiles([1,2,3,4].map(n=>({name:`${n}.png`,mimeType:'image/png',buffer:png})));
  await expect(page.locator('#toast')).toContainText('최대 3장');await expect(page.locator('.photo-message')).toHaveCount(0);expect((await readJournal(page))?.captures||[]).toHaveLength(0);
});
test('a broken middle image leaves both good records saved and identifies the failed file',async({page})=>{
  await page.goto('/');await page.locator('#conciergePhoto').setInputFiles([datedPhoto('2026-10-27'),{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid image')},{name:'good.png',mimeType:'image/png',buffer:png}]);
  await expect(page.locator('.batch-status')).toContainText('3장 중 2장 보관 완료');await expect(page.locator('.batch-status')).toContainText('broken.png');expect((await readJournal(page)).captures).toHaveLength(2);
  await page.reload();expect((await readJournal(page)).captures).toHaveLength(2);await expect(page.locator('.photo-batch button')).toHaveCount(2);
});
test('a save failure in the middle does not roll back an earlier saved photo or duplicate it on the next save',async({page})=>{
  await page.goto('/');await page.evaluate(()=>{const original=Storage.prototype.setItem;let failed=false;Storage.prototype.setItem=function(key,value){if(key==='meday-mvp-v02'&&!failed&&JSON.parse(value).captures.length===2){failed=true;throw new DOMException('test storage failure','QuotaExceededError');}return original.call(this,key,value);};});
  await page.locator('#conciergePhoto').setInputFiles([datedPhoto('2026-10-27'),datedPhoto('2026-10-25'),{name:'third.png',mimeType:'image/png',buffer:png}]);
  await expect(page.locator('.batch-status')).toContainText('3장 중 2장 보관 완료');const j=await readJournal(page);expect(j.captures).toHaveLength(2);expect(j.captures[0].date).toBe('2026-10-27');expect(j.captures[1].capturedDate).toBeNull();
});
test('when every new save fails the previous photo remains usable for conversation',async({page})=>{
  await page.goto('/');await page.locator('#conciergePhoto').setInputFiles(datedPhoto('2026-10-27'));await expect(page.locator('.batch-status')).toContainText('1장 중 1장 보관 완료');
  const old=(await readJournal(page)).captures[0].id;
  await page.evaluate(()=>{window.restoreStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('test','QuotaExceededError');};});
  await page.locator('#conciergePhoto').setInputFiles({name:'new.png',mimeType:'image/png',buffer:png});await expect(page.locator('.batch-status')).toContainText('1장 중 0장 보관 완료');
  expect((await readJournal(page)).captures.map(c=>c.id)).toEqual([old]);await page.evaluate(()=>{Storage.prototype.setItem=window.restoreStorage;});
  await page.locator('#conciergeMessage').fill('사진 속 음식 이름을 알려줘');await page.locator('#conciergeForm button').click();await expect(page.locator('.conversation-messages')).toContainText('로그인해 주세요');
});
test('my page keeps an optional personal energy reference, chronological food/activity, and no exercise double counting',async({page},testInfo)=>{
  await page.goto('/');await mine(page);await page.locator('#profileButton').click();
  await page.locator('#profileAge').fill('30');await page.locator('#profileSex').selectOption('male');await page.locator('#profileHeight').fill('180');await page.locator('#profileWeight').fill('80');await page.locator('#profileActivity').selectOption('low');await page.locator('#profileForm button[type="submit"]').click();
  await expect(page.locator('.energy-comparison')).toContainText('2,136');
  await addManual(page,'food');await page.locator('#foodName').fill('직접 남긴 점심');await page.locator('#foodKcal').fill('500');await page.locator('#foodForm button[type="submit"]').click();
  await addManual(page,'exercise');await page.locator('#exType').fill('걷기');await page.locator('#exTime').fill('08:00');await page.locator('#exCalories').fill('180');await page.locator('#exerciseForm button[type="submit"]').click();
  await expect(page.locator('.timeline-row').first()).toContainText('08:00');await expect(page.locator('.timeline-row').last()).toContainText('시간 미입력');
  await expect(page.locator('.daily-energy .cal-big')).toContainText('500');await expect(page.locator('.energy-comparison')).toContainText('2,136');await expect(page.locator('.activity-summary')).toContainText('180');
  await page.screenshot({path:testInfo.outputPath('my-page.png'),fullPage:true});
  await page.reload();await mine(page);await expect(page.locator('.energy-comparison')).toContainText('2,136');
  await page.locator('#profileButton').click();await page.locator('#energyMode').selectOption('none');await page.locator('#profileForm button[type="submit"]').click();await expect(page.locator('.energy-comparison')).toHaveCount(0);
});
