// Explicit real-project QA only. Uses temporary accounts and synthetic fixtures.
import { createClient } from "@supabase/supabase-js";
import { createJournalStore } from "../cloud.js";
import { loadPoints } from "../points.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const url = process.env.VITE_SUPABASE_URL,
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  adminKey = process.env.TEST_SUPABASE_ADMIN_KEY,
  origin = process.env.VERIFY_BROWSER_URL;
if (!url || !key || !adminKey) throw Error("Live QA configuration required");
const options = { auth: { persistSession: false, autoRefreshToken: false } },
  admin = createClient(url, adminKey, options),
  users = [],
  clients = [],
  emails = [];
const blank = () => ({
  records: [],
  exercises: [],
  weights: [],
  goals: { kcal: 2200 },
  evaluations: {},
  dayEvaluations: {},
});
const fixture = fileURLToPath(
  new URL("../e2e/fixtures/replacement.png", import.meta.url),
);
const photo =
  "data:image/png;base64," + readFileSync(fixture).toString("base64");
let browser;
try {
  for (let i = 0; i < 3; i++) {
    const email = `meday-points-qa-${crypto.randomUUID()}@example.invalid`,
      password = crypto.randomUUID() + "Aa1!";
    const made = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (made.error) throw made.error;
    users.push(made.data.user.id);
    emails.push(email);
    const client = createClient(url, key, options),
      login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    clients.push(client);
  }
  const day = (await loadPoints(clients[0])).day;
  const journal = blank(),
    store = createJournalStore(clients[0], users[0]);
  await store.load();
  journal.weights.push({
    id: crypto.randomUUID(),
    date: day,
    time: "",
    kg: null,
    photo,
  });
  await store.save(journal);
  assert.equal((await loadPoints(clients[0])).balance, 200);
  const restored = await createJournalStore(clients[0], users[0]).load();
  assert.equal(restored.weights[0].kg, null);
  assert.equal((await fetch(restored.weights[0].photo)).status, 200);
  const foreignPhoto = await clients[1].storage
    .from("meday-photos")
    .download(restored.weights[0].photoPath);
  assert.ok(foreignPhoto.error);
  journal.weights[0].kg = 67.25;
  await store.save(journal);
  assert.equal((await loadPoints(clients[0])).balance, 200);
  journal.weights = [];
  await store.save(journal);
  journal.weights.push({
    id: crypto.randomUUID(),
    date: day,
    time: "",
    kg: null,
    photo,
  });
  await store.save(journal);
  assert.equal((await loadPoints(clients[0])).balance, 200);
  for (const meal of ["breakfast", "lunch", "dinner"])
    journal.records.push({
      id: crypto.randomUUID(),
      date: day,
      time: "",
      meal,
      name: meal,
      kcal: null,
      nutrients: {},
    });
  journal.exercises.push({
    id: crypto.randomUUID(),
    date: day,
    time: "",
    type: "",
    minutes: 0,
    calories: null,
  });
  await store.save(journal);
  const full = await loadPoints(clients[0]);
  assert.equal(full.balance, 1000);
  assert.equal(full.todayEarned, 1000);
  assert.equal(full.history.length, 5);
  const anon = createClient(url, key, options);
  assert.ok((await anon.rpc("meday_points_summary")).error);
  assert.equal(
    (
      await clients[1]
        .from("meday_points_ledger")
        .select("*")
        .eq("user_id", users[0])
    ).data.length,
    0,
  );
  assert.ok(
    (
      await clients[0]
        .from("meday_points_ledger")
        .insert({
          user_id: users[0],
          record_id: "forged",
          record_date: day,
          slot: "weight",
        })
    ).error,
  );
  assert.ok(
    (
      await clients[0]
        .from("meday_points_ledger")
        .delete()
        .eq("user_id", users[0])
    ).error,
  );
  // Deliberately bypass the app's CAS check to challenge the database boundary.
  const bStore = createJournalStore(clients[1], users[1]);
  await bStore.load();
  await bStore.save(blank());
  const attempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      clients[1]
        .from("meday_journals")
        .update({
          payload: {
            ...blank(),
            records: [
              {
                id: crypto.randomUUID(),
                date: day,
                time: "",
                meal: "breakfast",
                name: "동시 저장",
              },
            ],
          },
        })
        .eq("user_id", users[1]),
    ),
  );
  assert.ok(attempts.every((r) => !r.error));
  assert.equal((await loadPoints(clients[1])).balance, 200);
  assert.equal(
    (await clients[1].from("meday_journals").delete().eq("user_id", users[1]))
      .error,
    null,
  );
  await createJournalStore(clients[1], users[1]).save({
    ...blank(),
    records: [
      {
        id: crypto.randomUUID(),
        date: day,
        time: "",
        meal: "breakfast",
        name: "재등록",
      },
    ],
  });
  assert.equal((await loadPoints(clients[1])).balance, 200);
  console.log(
    "PASS: real weight photo-only save → private signed image; edits/delete/new IDs keep 200P; five slots total 1,000P; 10 concurrent writes and full-journal re-registration never duplicate rewards; RLS/tamper checks passed.",
  );
  if (origin && !process.env.VERIFY_POINTS_BACKEND_ONLY) {
    const { webkit, expect } = await import("@playwright/test");
    browser = await webkit.launch();
    const context = await browser.newContext({
        viewport: { width: 393, height: 736 },
        isMobile: true,
        hasTouch: true,
      }),
      page = await context.newPage();
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: emails[2],
      options: { redirectTo: origin },
    });
    if (link.error) throw link.error;
    await page.goto(link.data.properties.action_link);
    await expect(page.locator("#storageStatus")).toContainText("서버 저장");
    await expect(page.locator("#pointsButton")).toHaveText("0P");
    await page.locator('[data-add="weight"]').first().click();
    await page.locator("#weightFile").setInputFiles(fixture);
    await expect(page.locator("#weightPhotoPreview img")).toBeVisible();
    await page.locator('#weightForm button[type="submit"]').click();
    await expect(page.locator("#overlay")).toHaveClass(/hidden/);
    await expect(page.locator("#pointsButton")).toHaveText("200P");
    await page.reload();
    await page.locator("[data-weight]").click();
    await expect(page.locator("#weightKg")).toHaveValue("");
    await expect(page.locator("#weightTime")).toHaveValue("");
    await page.locator("#weightKg").fill("67.25");
    await page.locator('#weightForm button[type="submit"]').click();
    await expect(page.locator("#overlay")).toHaveClass(/hidden/);
    await page.reload();
    await expect(page.locator("[data-weight]")).toContainText("67.25 kg");
    await expect(page.locator("#pointsButton")).toHaveText("200P");
    await page.locator("[data-weight]").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#deleteWeight").click();
    await expect(page.locator("[data-weight]")).toHaveCount(0);
    await page.locator('[data-add="weight"]').first().click();
    await page.locator("#weightFile").setInputFiles(fixture);
    await expect(page.locator("#weightPhotoPreview img")).toBeVisible();
    await page.locator('#weightForm button[type="submit"]').click();
    await expect(page.locator("#overlay")).toHaveClass(/hidden/);
    await expect(page.locator("#pointsButton")).toHaveText("200P");
    await page.route("**/rest/v1/rpc/meday_points_summary", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"message":"QA points read outage"}',
      }),
    );
    await page.locator('[data-add="exercise"]').first().click();
    await page.locator("#exType").fill("걷기");
    await page.locator('#exerciseForm button[type="submit"]').click();
    await expect(page.locator("#overlay")).toHaveClass(/hidden/);
    await expect(page.locator("[data-exercise]")).toHaveCount(1);
    await expect(page.locator("#pointsButton")).toHaveText("포인트 확인");
    await page.locator("#pointsButton").click();
    await expect(page.locator("#pointsContent")).toContainText("기록은 그대로");
    await page.unroute("**/rest/v1/rpc/meday_points_summary");
    await page.locator("#pointsRetry").click();
    await expect(page.locator("#pointsBalance")).toHaveText("400P");
    await expect(page.locator("#pointsToday")).toContainText("400 / 1,000P");
    await expect(page.locator(".points-free")).toContainText("차감하지 않아요");
    await page.reload();
    await expect(page.locator("#pointsButton")).toHaveText("400P");
    console.log(
      "PASS: mobile WebKit real login → weight photo-only → 200P → kg edit → delete/re-register still 200P → points-read outage preserves exercise save → retry/reload shows 400P.",
    );
    const {
      data: { session },
    } = await clients[2].auth.getSession();
    const analysis = await fetch(origin + "/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        kind: "exercise",
        image:
          "data:image/png;base64," +
          readFileSync(
            new URL("../e2e/fixtures/fitness-ai.png", import.meta.url),
          ).toString("base64"),
      }),
    });
    const analyzed = await analysis.json();
    assert.equal(analysis.status, 200, JSON.stringify(analyzed));
    assert.equal(analyzed.minutes, 35);
    assert.equal(analyzed.calories, 180);
    assert.equal((await loadPoints(clients[2])).balance, 400);
    console.log(
      "PASS: genuine live AI extraction remains free; 400P balance unchanged.",
    );
  }
} finally {
  await browser?.close();
  for (let i = 0; i < users.length; i++) {
    const photos = await admin.storage.from("meday-photos").list(users[i]);
    if (photos.error) throw photos.error;
    if (photos.data.length) {
      const removed = await admin.storage
        .from("meday-photos")
        .remove(photos.data.map((p) => `${users[i]}/${p.name}`));
      if (removed.error) throw removed.error;
    }
    await clients[i]?.auth.signOut({ scope: "global" });
    const removed = await admin.auth.admin.deleteUser(users[i]);
    if (removed.error) throw removed.error;
  }
  console.log(
    "Temporary accounts, points, reward IDs, journals and photos cleaned up.",
  );
}
