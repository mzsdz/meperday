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
