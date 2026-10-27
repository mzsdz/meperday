// Live smoke: no customer photos, no browser session injection, temporary QA cleanup.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const url = process.env.VITE_SUPABASE_URL,
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  adminKey = process.env.TEST_SUPABASE_ADMIN_KEY,
  origin = process.env.VERIFY_BROWSER_URL;
if (!url || !key || !adminKey || !origin)
  throw Error("Live configuration required");
const options = { auth: { persistSession: false, autoRefreshToken: false } },
  admin = createClient(url, adminKey, options),
  users = [];
try {
  const clients = [];
  const emails = [];
  for (let i = 0; i < 2; i++) {
    const email = `meday-ai-qa-${crypto.randomUUID()}@example.invalid`,
      password = crypto.randomUUID() + "Aa1!";
    const made = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (made.error) throw made.error;
    users.push(made.data.user.id);
    emails.push(email);
    const client = createClient(url, key, options);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    clients.push(client);
  }
  const anon = createClient(url, key, options);
  assert.ok((await anon.rpc("reserve_meday_ai")).error);
  const limits = await Promise.all(
    Array.from({ length: 25 }, () => clients[1].rpc("reserve_meday_ai")),
  );
  assert.equal(limits.filter((r) => !r.error).length, 20);
  assert.equal(
    limits.filter((r) => r.error?.message.includes("analysis_daily_limit"))
      .length,
    5,
  );
  console.log(
    "PASS: real atomic quota accepts exactly 20 of 25 concurrent requests; anonymous quota call denied.",
  );
  const readiness = await (await fetch(origin + "/api/analyze")).json();
  console.log("AI configured:", readiness.configured === true);
  if (!readiness.configured) {
    console.log(
      "ACTION REQUIRED: add server-only AI_GATEWAY_API_KEY or approve enabling project OIDC; no model result fabricated.",
    );
    process.exitCode = 2;
  } else {
    const unauth = await fetch(origin + "/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "exercise",
        image: "data:image/png;base64,aGVsbG8=",
      }),
    });
    assert.equal(unauth.status, 401);
    const {
      data: { session },
    } = await clients[0].auth.getSession();
    const call = async (kind, file) => {
      const response = await fetch(origin + "/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          kind,
          image:
            "data:image/png;base64," +
            readFileSync(new URL(file, import.meta.url)).toString("base64"),
        }),
      });
      return { status: response.status, value: await response.json() };
    };
    const exercise = await call("exercise", "../e2e/fixtures/fitness-ai.png");
    if (exercise.status !== 200) {
      console.log(
        JSON.stringify({ liveAIStatus: exercise.status, ...exercise.value }),
      );
      process.exitCode = 2;
    } else {
      assert.equal(exercise.value.minutes, 35);
      assert.equal(exercise.value.calories, 180);
      console.log(
        "PASS: genuine vision model extracted 35 min / 180 kcal from synthetic workout capture.",
      );
      const food = await call("food", "../e2e/fixtures/replacement.png");
      assert.equal(food.status, 200);
      assert.equal(food.value.kcal, null);
      assert.ok(Object.values(food.value.nutrients).every((v) => v === null));
      console.log(
        "PASS: non-food image returns unknown nutrition, not invented calorie values.",
      );
      const { webkit, expect } = await import("@playwright/test");
      const browser = await webkit.launch();
      try {
        const context = await browser.newContext({
          viewport: { width: 393, height: 736 },
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        const link = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: emails[0],
          options: { redirectTo: origin },
        });
        if (link.error) throw link.error;
        await page.goto(link.data.properties.action_link);
        await expect(page.locator("#storageStatus")).toContainText("서버 저장");
        await page.locator('[data-add="exercise"]').first().click();
        await page
          .locator("#exFile")
          .setInputFiles(
            fileURLToPath(
              new URL("../e2e/fixtures/fitness-ai.png", import.meta.url),
            ),
          );
        await expect(page.locator("#exAnalyze")).toBeEnabled();
        await page.locator("#exAnalyze").click();
        await expect(page.locator("#exMinutes")).toHaveValue("35", {
          timeout: 40000,
        });
        await expect(page.locator("#exCalories")).toHaveValue("180");
        await page.locator('#exerciseForm button[type="submit"]').click();
        await expect(page.locator("#overlay")).toHaveClass(/hidden/, {
          timeout: 15000,
        });
        await page.reload();
        await page.locator("[data-exercise]").click();
        await expect(page.locator("#exMinutes")).toHaveValue("35");
        console.log(
          "PASS: mobile WebKit AI capture → editable results → account save → reload.",
        );
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  for (const id of users) {
    const photos = await admin.storage.from("meday-photos").list(id);
    if (photos.error) throw photos.error;
    if (photos.data.length) {
      const removed = await admin.storage
        .from("meday-photos")
        .remove(photos.data.map((p) => `${id}/${p.name}`));
      if (removed.error) throw removed.error;
    }
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) throw removed.error;
  }
  console.log("QA accounts, records, usage counters, and photos cleaned up.");
}
