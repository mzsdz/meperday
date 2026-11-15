import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const fixture=name=>fileURLToPath(new URL('./fixtures/'+name,import.meta.url));
const png=fixture('replacement.png'),jpeg=fixture('oriented-exif.jpg');
const read=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('meday-mvp-v02')));
const submit=page=>page.locator('#foodForm button[type=submit]').click();
test('existing single food records and unclassified photo archives remain editable',async({page})=>{
  await page.goto('/');await page.evaluate(()=>{const date=new Date().toLocaleDateString('en-CA');localStorage.setItem('meday-mvp-v02',JSON.stringify({records:[{id:'legacy-food',date,time:'12:00',meal:'lunch',name:'기존 음식',kcal:400,nutrients:{protein:20}}],captures:[{id:'legacy-photo',date,time:'',photo:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvFkAAAAASUVORK5CYII=',messages:[]}],weights:[],exercises:[],goals:{kcal:2200},evaluations:{},dayEvaluations:{}}));});await page.reload();
  await expect(page.locator('[data-edit-capture]')).toBeVisible();await page.locator('[data-edit=legacy-food]').click();await page.locator('[data-portion=half]').click();await submit(page);expect((await read(page)).records[0].kcal).toBe(200);
  await page.locator('[data-edit-capture]').click();await page.locator('[data-legacy-kind=food]').click();await expect(page.locator('#photoPreview img')).toBeVisible();await submit(page);expect((await read(page)).records).toHaveLength(2);
});
test('exercise screenshots remain separate from food intake',async({page})=>{
  await page.goto('/');await page.locator('[data-add=exercise]').click();await page.locator('#exFile').setInputFiles(png);await expect(page.locator('#exPhotoPreview img')).toBeVisible();await page.locator('#exType').fill('걷기');await page.locator('#exCalories').fill('210');await page.locator('#exerciseForm button[type=submit]').click();expect((await read(page)).exercises[0].calories).toBe(210);await expect(page.locator('.calorie-board')).not.toContainText('210');
  await page.reload();await page.getByText('운동 기록',{exact:true}).click();await expect(page.locator('[data-exercise]')).toContainText('걷기');
});
test('photo upload → search → portion → save → reload → edit → delete',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');
  await expect(page.locator('.calorie-board')).toBeVisible();await expect(page.locator('#conciergeForm')).toHaveCount(0);
  await page.locator('#journalPhotos').setInputFiles(png);await expect(page.locator('#foodForm')).toBeVisible();
  await expect(page.locator('#foodTime')).toHaveValue('');await page.locator('#foodSearch').fill('쌀밥');
  await page.locator('[data-food-result]').filter({hasText:'쌀밥'}).first().click();
  await page.locator('[data-portion=half]').click();await expect(page.locator('#foodTotal')).toHaveText('83 kcal');
  await submit(page);await expect(page.locator('.food-entry')).toContainText('83 kcal');
  await page.reload();await page.locator('.food-entry').click();await expect(page.locator('[data-portion=half]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-portion=quarter]').click();await expect(page.locator('#foodTotal')).toHaveText('42 kcal');await submit(page);
  expect((await read(page)).records[0].kcal).toBe(41.5);await page.screenshot({path:info.outputPath('records.png'),fullPage:true});
  await page.locator('.food-entry').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#deleteFood').click();await page.reload();
  await expect(page.locator('.food-entry')).toHaveCount(0);expect(errors).toEqual([]);
});
test('three photos use original capture dates; no meal slots; fourth photo rejected',async({page})=>{
  await page.goto('/');await page.locator('#journalPhotos').setInputFiles([jpeg,png,png,png]);await expect(page.locator('#toast')).toContainText('최대 3장');
  await page.locator('#journalPhotos').setInputFiles([jpeg,png,png]);await expect(page.locator('#foodForm')).toBeVisible({timeout:20000});
  await expect(page.locator('#foodTime')).toHaveValue('08:09');const original=await page.locator('#foodDate').inputValue();expect(original).toBe('2026-10-27');
  await page.locator('#foodForm [data-close]').click();expect((await read(page)).records).toHaveLength(3);
  await page.locator('#goToday').click();await expect(page.locator('.food-entry')).toHaveCount(2);await expect(page.locator('.food-entries')).toContainText('1st');await expect(page.locator('.food-entries')).toContainText('2nd');
  await page.locator('#journalDate').fill(original);await expect(page.locator('.food-entry')).toHaveCount(1);await page.locator('.food-entry').click();
  expect(await page.locator('#photoPreview img').evaluate(el=>el.naturalHeight>el.naturalWidth)).toBe(true);
});
test('bites use adjustable mass and do not compound when editing',async({page})=>{
  await page.goto('/');await page.locator('[data-add=food]').click();await page.locator('#addCustomFood').click();
  await page.locator('#itemName0').fill('큰 샌드위치');await page.locator('#itemKcal0').fill('600');await page.locator('#itemGrams0').fill('300');
  await page.locator('[data-portion=bite2]').click();await expect(page.locator('#foodTotal')).toHaveText('60 kcal');await page.locator('#biteGrams0').fill('20');await expect(page.locator('#foodTotal')).toHaveText('80 kcal');
  await submit(page);await page.locator('.food-entry').click();await expect(page.locator('#foodTotal')).toHaveText('80 kcal');await page.locator('[data-portion=all]').click();await expect(page.locator('#foodTotal')).toHaveText('600 kcal');
});
test('nutrients: defaults, empty search list, add/remove, custom reference, persistence',async({page},info)=>{
  await page.goto('/');await page.locator('#myPageBtn').click();await expect(page.locator('[data-module=protein]')).toContainText('정보 없음');
  await expect(page.locator('[data-module=sodium]')).toHaveClass(/limit-module/);await page.locator('#addNutrient').click();await expect(page.locator('[data-nutrient-add]')).toHaveCount(27);
  await page.locator('#nutrientSearch').fill('칼슘');await page.locator('[data-nutrient-add=calcium]').click();await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.locator('[data-reference=calcium]').click();await page.locator('#referenceValue').fill('850');await page.locator('#referenceForm button[type=submit]').click();
  await page.locator('[data-remove-module=fat]').click();await page.reload();await page.locator('#myPageBtn').click();
  await expect(page.locator('[data-module=fat]')).toHaveCount(0);await expect(page.locator('[data-module=calcium]')).toContainText('850mg');
  await page.screenshot({path:info.outputPath('management.png'),fullPage:true});
});
test('weight requires photo, uses capture date, persists, edits and deletes with trend',async({page},info)=>{
  await page.goto('/');await page.locator('#weightPageBtn').click();await page.locator('[data-add=weight]').click();await page.locator('#weightKg').fill('82.4');await page.locator('#weightForm button[type=submit]').click();await expect(page.locator('#weightStatus')).toContainText('사진 한 장');
  await page.locator('#weightFile').setInputFiles(jpeg);await expect(page.locator('#weightPhotoPreview img')).toBeVisible();await expect(page.locator('#weightTime')).toHaveValue('08:09');await expect(page.locator('#weightKg')).toHaveValue('');await page.locator('#weightKg').fill('82.4');await page.locator('#weightForm button[type=submit]').click();
  await expect(page.locator('.weight-chart')).toBeVisible();await page.locator('[data-weight-period=month]').click();await expect(page.locator('.weight-entry')).toContainText('82.4 kg');await page.screenshot({path:info.outputPath('weight.png'),fullPage:true});
  const weight=(await read(page)).weights[0];await page.reload();await page.locator('#weightPageBtn').click();await page.locator('#journalDate').fill(weight.date);await page.locator('.weight-entry').click();await page.locator('#weightKg').fill('82.1');await page.locator('#weightForm button[type=submit]').click();expect((await read(page)).weights[0].kg).toBe(82.1);
  await page.locator('.weight-entry').click();page.once('dialog',d=>d.accept());await page.locator('#deleteWeight').click();expect((await read(page)).weights).toHaveLength(0);
});
for(const width of [320,393,430,1024])test(`${width}px layout and keyboard-sized modal stay usable`,async({page},info)=>{
  await page.setViewportSize({width,height:736});await page.goto('/');
  for(const nav of ['#homeBtn','#myPageBtn','#weightPageBtn']){await page.locator(nav).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.locator('[data-add=weight]').click();await page.setViewportSize({width,height:400});const button=page.locator('#weightForm button[type=submit]');await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(401);await page.screenshot({path:info.outputPath('keyboard.png')});
});
