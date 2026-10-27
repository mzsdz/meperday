// Explicit live verification only: TEST_SUPABASE_ADMIN_KEY is required.
// Creates two temporary QA users, removes their uploaded objects and deletes both users.
import { createClient } from "@supabase/supabase-js";
import { createJournalStore } from "../cloud.js";
import assert from "node:assert/strict";

const url = process.env.VITE_SUPABASE_URL;
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const adminKey = process.env.TEST_SUPABASE_ADMIN_KEY;
if (!url || !publicKey || !adminKey)
  throw Error("Live verification configuration required.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, adminKey, options);
const users = [];
const emails = [];
try {
  const clients = [];
  for (let i = 0; i < 2; i++) {
    const email = `meday-qa-${crypto.randomUUID()}@example.invalid`,
      password = crypto.randomUUID() + "Aa1!";
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    emails.push(email);
    const client = createClient(url, publicKey, options);
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    clients.push(client);
  }
  const a = createJournalStore(clients[0], users[0]);
  assert.equal(await a.load(), null);
  const value = {
    records: [
      {
        id: crypto.randomUUID(),
        date: "2026-10-27",
        time: "",
        meal: "breakfast",
        name: "사진 기록",
        kcal: null,
        nutrients: {},
        photo: "data:image/jpeg;base64,/9j/2Q==",
      },
    ],
    exercises: [],
    evaluations: {},
    dayEvaluations: {},
    goals: { kcal: 2200 },
  };
  await a.save(value);
  const fresh = createJournalStore(clients[0], users[0]);
  const loaded = await fresh.load();
  assert.equal(loaded.records[0].time, "");
  assert.equal(loaded.records[0].kcal, null);
  const photo = await fetch(loaded.records[0].photo);
  assert.equal(photo.status, 200);
  const foreign = await clients[1]
    .from("meday_journals")
    .select("*")
    .eq("user_id", users[0]);
  assert.equal(foreign.error, null);
  assert.equal(foreign.data.length, 0);
  const foreignPhoto = await clients[1].storage
    .from("meday-photos")
    .download(loaded.records[0].photoPath);
  assert.ok(foreignPhoto.error);
  const foreignWrite = await clients[1]
    .from("meday_journals")
    .insert({ user_id: users[0], payload: value, revision: 1 });
  assert.ok(foreignWrite.error);
  loaded.records[0].name = "수정 검증";
  await fresh.save(loaded);
  assert.equal((await a.load()).records[0].name, "수정 검증");
  console.log(
    "PASS: real private upload → DB save → new store reload → signed image → edit; cross-user read/write/photo access denied.",
  );
  if (process.env.VERIFY_BROWSER_URL) {
    const { chromium, expect } = await import("@playwright/test");
    const browser = await chromium.launch({ channel: "msedge" });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // Start as a real first-time visitor before opening a genuine Supabase
      // login link. No auth session is injected into browser storage.
      await page.goto(process.env.VERIFY_BROWSER_URL);
      await expect(page.locator("#storageStatus")).toContainText(
        "이 기기에 저장",
      );
      await expect(page.locator("#overlay")).toHaveClass(/hidden/);
      await page.locator('[data-open-meal="lunch"]').click();
      await page.locator('[data-add-meal="lunch"]').click();
      await page
        .locator("#foodFile")
        .setInputFiles({
          name: "guest.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvFkAAAAASUVORK5CYII=",
            "base64",
          ),
        });
      await expect(page.locator("#photoPreview img")).toBeVisible();
      await page.locator('#foodForm button[type="submit"]').click();
      await expect(page.locator("#overlay")).toHaveClass(/hidden/);
      await page.reload();
      await expect(page.locator('[data-open-meal="lunch"]')).toContainText(
        "열량 미확인",
      );
      const link = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: emails[0],
        options: { redirectTo: process.env.VERIFY_BROWSER_URL },
      });
      if (link.error) throw link.error;
      await page.goto(link.data.properties.action_link);
      await expect(page.locator("#storageStatus")).toContainText("서버 저장");
      await page.locator("#settingsButton").click();
      await page.locator("#importDevice").click();
      await expect(page.locator("#overlay")).toHaveClass(/hidden/, {
        timeout: 20000,
      });
      await page.reload();
      await expect(page.locator('[data-open-meal="lunch"]')).toContainText(
        "열량 미확인",
      );
      await page.locator('[data-open-meal="breakfast"]').click();
      await page.locator('[data-add-meal="breakfast"]').click();
      await page.locator("#foodFile").setInputFiles({
        name: "qa.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvFkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
      await expect(page.locator("#photoPreview img")).toBeVisible();
      await page.locator('#foodForm button[type="submit"]').click();
      await expect(page.locator("#overlay")).toHaveClass(/hidden/, {
        timeout: 20000,
      });
      await page.reload();
      await expect(page.locator('[data-open-meal="breakfast"]')).toContainText(
        "음식 사진 (분석 전)",
      );
      await expect(page.locator('[data-open-meal="breakfast"]')).toContainText(
        "열량 미확인",
      );
      const result = await clients[0]
        .from("meday_journals")
        .select("payload")
        .single();
      assert.equal(result.data.payload.records.length, 3);
      assert.equal(result.data.payload.records[2].time, "");
      assert.ok(result.data.payload.records[2].photoPath);
      assert.equal(result.data.payload.records[2].photo, undefined);
      assert.deepEqual(errors, []);
      console.log(
        "PASS: first visit → guest photo save/reload → genuine email login-link callback → explicit guest import → account photo save → database → browser reload. No browser auth session injection.",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  for (const id of users) {
    const listed = await admin.storage.from("meday-photos").list(id);
    if (listed.error) throw listed.error;
    if (listed.data.length) {
      const removed = await admin.storage
        .from("meday-photos")
        .remove(listed.data.map((r) => `${id}/${r.name}`));
      if (removed.error) throw removed.error;
    }
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) throw removed.error;
  }
  console.log("Temporary verification users and photos cleaned up.");
}
