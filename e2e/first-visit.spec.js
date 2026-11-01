import {mine} from "./helpers.js";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://example.supabase.co/auth/v1/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ external: { google: false } }),
    }),
  );
});
test("expired login callback preserves device records and offers a new link", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "meday-mvp-v02",
      JSON.stringify({
        records: [
          {
            id: "guest-test",
            date: [
              new Date().getFullYear(),
              String(new Date().getMonth() + 1).padStart(2, "0"),
              String(new Date().getDate()).padStart(2, "0"),
            ].join("-"),
            time: "",
            meal: "breakfast",
            name: "기기 기록",
            kcal: null,
            nutrients: {},
          },
        ],
        exercises: [],
        evaluations: {},
        dayEvaluations: {},
        goals: { kcal: 2200, carb: 270, protein: 90, fat: 65 },
      }),
    ),
  );
  await page.reload();
  await page.goto(
    "/#error=access_denied&error_code=otp_expired&error_description=Link+expired",
  );
  await expect(page.locator("#authStatus")).toContainText("새 로그인 링크");
  await page.getByRole("button", { name: "지금은 이 기기에 기록하기" }).click();
  await mine(page);
  await expect(page.locator('[data-record-kind="food"]')).toContainText(
    "기기 기록",
  );
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvFkAAAAASUVORK5CYII=",
  "base64",
);
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1054, height: 972 },
]) {
  test.describe(`${viewport.width}px first visit with Supabase configured`, () => {
    test.use({ viewport });
    test("home renders without login; photo-only guest save survives reload; login dismisses", async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/");
      await expect(page.locator("#storageStatus")).toContainText(
        "이 기기에 저장",
      );
      await expect(page.locator("#overlay")).toHaveClass(/hidden/);
      await expect(page.locator("#conciergePhoto")).toHaveCount(1);
      await page.locator("#conciergePhoto").setInputFiles({name:"meal.png",mimeType:"image/png",buffer:png});
      await expect(page.locator(".photo-message img")).toBeVisible();
      await page.reload();
      await mine(page);
      await expect(page.locator('[data-record-kind="capture"]')).toBeVisible();
      await page.locator("#storageStatus #signIn").click();
      await expect(page.locator("#loginForm")).toBeVisible();
      const submit = await page
        .locator('#loginForm button[type="submit"]')
        .boundingBox();
      expect(submit.y).toBeGreaterThanOrEqual(0);
      expect(submit.y + submit.height).toBeLessThan(viewport.height);
      await page.getByRole("button", { name: "닫기", exact: true }).click();
      await expect(page.locator("#overlay")).toHaveClass(/hidden/);
      await page.locator('[data-view="week"]').click();
      await expect(page.locator(".week-chart")).toBeVisible();
      expect(errors).toEqual([]);
    });
    test("login errors recover and email link success gives a usable next step", async ({
      page,
    }) => {
      await page.route("https://example.supabase.co/auth/v1/otp**", (route) =>
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ msg: "Too many requests" }),
        }),
      );
      await page.goto("/");
      await page.locator("#storageStatus #signIn").click();
      await page.locator("#email").fill("qa@example.invalid");
      await page.locator('#loginForm button[type="submit"]').click();
      await expect(page.locator("#authStatus")).toContainText(
        "보내지 못했어요",
      );
      await expect(
        page.locator('#loginForm button[type="submit"]'),
      ).toBeEnabled();
      await page.unroute("https://example.supabase.co/auth/v1/otp**");
      await page.route("https://example.supabase.co/auth/v1/otp**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        }),
      );
      await page.locator('#loginForm button[type="submit"]').click();
      await expect(page.locator("#authStatus")).toContainText(
        "이메일을 확인해 주세요",
      );
      await page
        .getByRole("button", { name: "지금은 이 기기에 기록하기" })
        .click();
      await expect(page.locator("#overlay")).toHaveClass(/hidden/);
    });
  });
}

const startPhoto='data:image/png;base64,'+png.toString('base64');
async function seedPendingAccount(page) {
  await page.addInitScript(({photo})=>{
    const now=Math.floor(Date.now()/1000);
    localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'test.'+btoa(JSON.stringify({exp:now+3600,sub:'chat-shell-user'}))+'.signature',refresh_token:'test-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user:{id:'chat-shell-user',aud:'authenticated',role:'authenticated',email:'shell@example.invalid'}}));
    localStorage.setItem('meday-mvp-v02',JSON.stringify({records:[],exercises:[],weights:[],captures:[{id:'guest-only',batchId:'guest-batch',photo,date:'2026-10-30',messages:[]},{id:'guest-only-2',batchId:'guest-batch',photo,date:'2026-10-30',messages:[]}],profile:{},evaluations:{},dayEvaluations:{},goals:{kcal:2200}}));
  },{photo:startPhoto});
}
for(const width of [320,393,430])test(`${width}px chat opens while account records are pending and preserves the draft`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:736});await seedPendingAccount(page);
  let release;const gate=new Promise(resolve=>release=resolve);let requests=0,writes=0;
  await page.route('https://example.supabase.co/rest/v1/meday_journals**',async route=>{
    requests++;if(route.request().method()!=='GET')writes++;
    await gate;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:1,payload:{records:[],exercises:[],weights:[],captures:[{id:'account-photo',photo:startPhoto,date:'2026-10-30',capturedDate:null,messages:[]}],profile:{},evaluations:{},dayEvaluations:{},goals:{kcal:2200}}})});
  });
  try {
    await page.goto('/');await expect.poll(()=>requests).toBe(1);
    await expect(page.locator('#conciergeMessage')).toBeVisible();await expect(page.locator('#conciergeMessage')).toBeEnabled();
    await expect(page.getByText('계정 기록을 연결하고 있어요…')).toHaveCount(0);
    await expect(page.locator('.photo-message')).toHaveCount(0);
    await expect(page.locator('#conciergePhoto')).toBeDisabled();await expect(page.locator('#conciergeForm button[type="submit"]')).toBeDisabled();
    await page.locator('#conciergeMessage').fill('오늘 점심은 절반만 먹었어');
    await page.locator('#conciergeForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(writes).toBe(0);await expect(page.locator('#conciergeMessage')).toHaveValue('오늘 점심은 절반만 먹었어');
    if(width===393)await page.screenshot({path:testInfo.outputPath('chat-while-connecting.png')});
    release();await expect(page.locator('#storageStatus')).toHaveText('내 계정 · 서버 저장');
    await expect(page.locator('.concierge-thread')).toHaveAttribute('data-capture-id','account-photo');
    await expect(page.locator('#conciergeMessage')).toHaveValue('오늘 점심은 절반만 먹었어');await expect(page.locator('#conciergePhoto')).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.setViewportSize({width,height:400});await expect.poll(async()=>{const box=await page.locator('#conciergeForm').boundingBox();return box.y+box.height<=400;}).toBe(true);
    expect(writes).toBe(0);
  } finally {release();}
});
test('a failed account connection leaves the chat draft available without saving to the device',async({page})=>{
  await seedPendingAccount(page);let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('https://example.supabase.co/rest/v1/meday_journals**',async route=>{await gate;await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Permission denied'})});});
  try {
    await page.goto('/');await page.locator('#conciergeMessage').fill('기다리는 동안 쓴 설명');release();
    await expect(page.locator('#retryAccount')).toBeVisible();await expect(page.locator('#conciergeMessage')).toHaveValue('기다리는 동안 쓴 설명');await expect(page.locator('#conciergePhoto')).toBeDisabled();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('meday-mvp-v02')).captures.map(c=>c.id))).toEqual(['guest-only','guest-only-2']);
  }finally{release();}
});
