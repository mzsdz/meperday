import { test, expect } from "@playwright/test";
test("Google disabled setup keeps email and device recording available", async ({
  page,
}) => {
  await page.route("https://example.supabase.co/auth/v1/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ external: { google: false } }),
    }),
  );
  await page.goto("/");
  await page.locator("#storageStatus #signIn").click();
  await expect(page.locator("#googleSignIn")).toBeDisabled();
  await expect(page.locator("#oauthStatus")).toContainText("설정이 아직");
  await expect(page.locator("#email")).toBeVisible();
  await page.getByRole("button", { name: "지금은 이 기기에 기록하기" }).click();
  await expect(page.locator("#overlay")).toHaveClass(/hidden/);
});
test("Google button starts OAuth through Supabase and preserves same-origin redirect", async ({
  page,
}) => {
  await page.route("https://example.supabase.co/auth/v1/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ external: { google: true } }),
    }),
  );
  let authorization;
  await page.route(
    "https://example.supabase.co/auth/v1/authorize**",
    (route) => {
      authorization = new URL(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>OAuth provider test boundary</h1>",
      });
    },
  );
  await page.goto("/");
  await page.locator("#storageStatus #signIn").click();
  await expect(page.locator("#googleSignIn")).toBeEnabled();
  await page.locator("#googleSignIn").click();
  await expect(page.getByRole("heading", { name: "OAuth provider test boundary", exact: true })).toHaveText(
    "OAuth provider test boundary",
  );
  expect(authorization.searchParams.get("provider")).toBe("google");
  expect(authorization.searchParams.get("redirect_to")).toBe(
    "http://127.0.0.1:4174",
  );
});
test("guest photo save remains usable when AI requires login", async ({
  page,
}) => {
  await page.route("**/api/analyze", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: true, requiresLogin: true }),
    }),
  );
  await page.goto("/");
  await page.locator("#conciergePhoto").setInputFiles({name:"guest.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvFkAAAAASUVORK5CYII=","base64")});
  await expect(page.locator(".photo-message img")).toBeVisible();
  await page.locator("#conciergeMessage").fill("밥 두 공기였어");
  await page.locator('#conciergeForm button[type="submit"]').click();
  await expect(page.locator(".conversation-messages")).toContainText("로그인해 주세요");
});
