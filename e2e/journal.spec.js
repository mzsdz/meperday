import { test, expect } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvFkAAAAASUVORK5CYII=",
  "base64",
);
test("photo alone is complete, meal slot is preserved, reload and unknown statistics work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#storageStatus")).toContainText("로컬 모드");
  await page.locator('[data-open-meal="breakfast"]').click();
  await page.locator('[data-add-meal="breakfast"]').click();
  await expect(page.locator("#foodTime")).toHaveValue("");
  await page
    .locator("#foodFile")
    .setInputFiles({ name: "food.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("#photoPreview img")).toBeVisible();
  await page.locator('#foodForm button[type="submit"]').click();
  await expect(page.locator("#overlay")).toHaveClass(/hidden/);
  await page.reload();
  await expect(page.locator('[data-open-meal="breakfast"]')).toContainText(
    "열량 미확인",
  );
  await expect(page.locator(".cal-big").first()).toContainText("—");
  const value = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("meday-mvp-v02")),
  );
  expect(value.records).toHaveLength(1);
  expect(value.records[0].time).toBe("");
  expect(value.records[0].meal).toBe("breakfast");
  expect(value.records[0].kcal).toBeNull();
  await page.locator('[data-view="week"]').click();
  await expect(page.locator(".summary-cell").first()).toContainText("—");
  await page.locator('[data-view="month"]').click();
  await expect(page.locator(".month-grid .dot")).toHaveCount(1);
  await page.locator("#recommendBtn").click();
  await expect(page.locator(".recommend-card")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("meday-mvp-v02")).records.length,
    ),
  ).toBe(1);
  expect(errors).toEqual([]);
});
test("screenshot-only exercise can be saved and revisited", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-add="exercise"]').first().click();
  await page
    .locator("#exFile")
    .setInputFiles({
      name: "exercise.png",
      mimeType: "image/png",
      buffer: png,
    });
  await expect(page.locator("#exPhotoPreview img")).toBeVisible();
  await page.locator('#exerciseForm button[type="submit"]').click();
  await page.reload();
  await page.locator("[data-exercise]").click();
  await expect(page.locator("#exMinutes")).toHaveValue("");
  await expect(page.locator("#exCalories")).toHaveValue("");
});
