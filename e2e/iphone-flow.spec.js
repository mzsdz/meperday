import {mine,addManual,editRecord} from "./helpers.js";
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const jpeg = fileURLToPath(
  new URL("./fixtures/oriented-exif.jpg", import.meta.url),
);
const png = fileURLToPath(
  new URL("./fixtures/replacement.png", import.meta.url),
);
const journal = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("meday-mvp-v02")));
async function addFood(page) {
  await addManual(page,"food");
}
async function upload(page, file = jpeg) {
  await page.locator("#foodFile").setInputFiles(file);
  await expect(page.locator("#photoPreview img")).toBeVisible();
  await expect(page.locator('#foodForm button[type="submit"]')).toBeEnabled();
}
test.use({ viewport: { width: 393, height: 736 } });

test("food: EXIF, orientation, photo replacement, all optional fields, cancel/delete and reload", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await addFood(page);
  await upload(page);
  await expect(page.locator("#foodTime")).toHaveValue("08:09");
  expect(
    await page
      .locator("#photoPreview img")
      .evaluate((el) => el.naturalHeight > el.naturalWidth),
  ).toBe(true);
  await page.locator('#foodForm button[type="submit"]').click();
  await editRecord(page,"food");
  await upload(page, png);
  await expect(page.locator("#foodTime")).toHaveValue("");
  await page.locator("#foodName").fill("수정한 식사");
  await page.locator("#foodKcal").fill("250");
  await page.locator("#foodPortion").fill("반 접시");
  await page.locator("#foodTime").fill("12:34");

  const previous = new Date(
    (await page.locator("#foodDate").inputValue()) + "T12:00:00Z",
  );
  previous.setUTCDate(previous.getUTCDate() - 1);
  const recordDate = previous.toISOString().slice(0, 10);
  await page.locator("#foodDate").fill(recordDate);
  await page.locator("summary").filter({ hasText: "식당·구매처" }).click();
  await page.locator("#foodPlace").fill("선택한 가게");
  await page.locator("#foodPrice").fill("9000");
  await page.locator("#foodNote").fill("메모");
  await page.setViewportSize({ width: 393, height: 400 });
  const submit = page.locator('#foodForm button[type="submit"]');
  await submit.scrollIntoViewIfNeeded();
  const rect = await submit.boundingBox();
  expect(rect.y + rect.height).toBeLessThanOrEqual(401);
  await submit.click();
  await page.reload();
  await mine(page);
  const saved = (await journal(page)).records[0];
  expect(saved).toMatchObject({
    name: "수정한 식사",
    meal: "entry",
    date: recordDate,
    time: "12:34",
    kcal: 250,
    portion: "반 접시",
    price: 9000,
    place: "선택한 가게",
    note: "메모",
  });
  await page.locator('[data-day-shift="-1"]').click();
  await editRecord(page,"food");
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#deleteFood").click();
  expect((await journal(page)).records).toHaveLength(1);
  page.once("dialog", (d) => d.accept());
  await page.locator("#deleteFood").click();
  await page.reload();
  await mine(page);
  expect((await journal(page)).records).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("exercise: screenshot-only create, edit, zero values, delete and reload", async ({
  page,
}) => {
  await page.goto("/");
  await addManual(page,"exercise");
  await page.locator("#exFile").setInputFiles(png);
  await expect(page.locator("#exPhotoPreview img")).toBeVisible();
  await page.locator('#exerciseForm button[type="submit"]').click();
  await page.reload();
  await mine(page);
  await editRecord(page,"exercise");
  await page.locator("#exType").fill("걷기");
  await page.locator("#exMinutes").fill("30");
  await page.locator("#exCalories").fill("0");
  await page.locator('#exerciseForm button[type="submit"]').click();
  await page.reload();
  await mine(page);
  expect((await journal(page)).exercises[0]).toMatchObject({
    type: "걷기",
    minutes: 30,
    calories: 0,
    time: "",
  });
  await editRecord(page,"exercise");
  page.once("dialog", (d) => d.accept());
  await page.locator("#deleteExercise").click();
  await page.reload();
  await mine(page);
  expect((await journal(page)).exercises).toHaveLength(0);
});

test("invalid replacement preserves photo/time; missing MIME is decoded; failed local save is retryable", async ({
  page,
}) => {
  await page.goto("/");
  await addFood(page);
  await upload(page, {
    name: "photo-without-mime",
    mimeType: "",
    buffer: readFileSync(jpeg),
  });
  const before = await page.locator("#photoPreview img").getAttribute("src");
  await page.locator("#foodFile").setInputFiles({
    name: "bad.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("invalid image"),
  });
  await expect(page.locator("#foodForm")).toContainText("JPEG 또는 PNG");
  expect(await page.locator("#photoPreview img").getAttribute("src")).toBe(
    before,
  );
  await expect(page.locator("#foodTime")).toHaveValue("08:09");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreStorage = () => (Storage.prototype.setItem = original);
    Storage.prototype.setItem = function (k, v) {
      if (k === "meday-mvp-v02")
        throw new DOMException("저장 공간 부족", "QuotaExceededError");
      return original.call(this, k, v);
    };
  });
  await page.locator('#foodForm button[type="submit"]').click();
  await expect(page.locator("#foodForm")).toBeVisible();
  expect(await journal(page)).toBeNull();
  await page.evaluate(() => window.restoreStorage());
  await page.locator('#foodForm button[type="submit"]').click();
  await expect(page.locator("#overlay")).toHaveClass(/hidden/);
  await page.reload();
  await mine(page);
  expect((await journal(page)).records).toHaveLength(1);
});

test("image processing blocks premature save; dismissing form never updates the next form", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.Image,
      src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    window.Image = function (...args) {
      const image = new Native(...args);
      image.addEventListener(
        "load",
        () =>
          (window.finishedPhotoLoads = (window.finishedPhotoLoads || 0) + 1),
      );
      Object.defineProperty(image, "src", {
        get() {
          return src.get.call(image);
        },
        set(value) {
          setTimeout(() => src.set.call(image, value), 700);
        },
      });
      return image;
    };
  });
  await page.goto("/");
  await addFood(page);
  await page.locator("#foodFile").setInputFiles(jpeg);
  await expect(page.locator('#foodForm button[type="submit"]')).toBeDisabled();
  await page.locator("#foodForm").evaluate((form) => form.requestSubmit());
  expect(await journal(page)).toBeNull();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await addManual(page,"exercise");
  await page.locator("#exType").fill("기다리는 동안 직접 기록");
  await expect
    .poll(() => page.evaluate(() => window.finishedPhotoLoads || 0))
    .toBe(1);
  await expect(page.locator("#exPhotoPreview img")).toHaveCount(0);
  await page.locator('#exerciseForm button[type="submit"]').click();
  await page.reload();
  await mine(page);
  const saved = await journal(page);
  expect(saved.records).toHaveLength(0);
  expect(saved.exercises[0].photo).toBeNull();
});
