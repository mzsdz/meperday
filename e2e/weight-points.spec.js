import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
const photo = fileURLToPath(
  new URL("./fixtures/replacement.png", import.meta.url),
);
for (const width of [320, 393, 430]) {
  test(`${width}px weight photo-only save, optional kg edit, replacement, delete and guest points`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 736 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.locator('[data-add="weight"]').first().click();
    const box = page.locator('label[for="weightFile"]');
    const layout = await box.evaluate((el) => ({
      width: el.offsetWidth,
      parent: el.parentElement.clientWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    expect(layout.width).toBeGreaterThan(layout.parent * 0.9);
    expect(layout.overflow).toBeLessThanOrEqual(1);
    await page.locator('#weightForm button[type="submit"]').click();
    await expect(page.locator("#weightStatus")).toContainText("사진 한 장");
    await page.locator("#weightFile").setInputFiles(photo);
    await expect(page.locator("#weightPhotoPreview img")).toBeVisible();
    await page.locator('#weightForm button[type="submit"]').click();
    await expect(page.locator("#overlay")).toHaveClass(/hidden/);
    await page.reload();
    await page.locator("[data-weight]").click();
    await expect(page.locator("#weightKg")).toHaveValue("");
    await expect(page.locator("#weightTime")).toHaveValue("");
    await page.locator("#weightKg").fill("67.25");
    await page.locator("#weightNote").fill("선택 메모");
    await page.locator("#weightFile").setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.locator("#weightForm")).toContainText("사진");
    await page.locator('#weightForm button[type="submit"]').click();
    await expect(page.locator("#overlay")).toHaveClass(/hidden/);
    await page.reload();
    await expect(page.locator("[data-weight]")).toContainText("67.25 kg");
    await page.locator("#settingsButton").click();
    const downloaded = page.waitForEvent("download");
    await page.locator("#exportData").click();
    const stream = await (await downloaded).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const backup = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    expect(backup.data.weights[0].kg).toBe(67.25);
    expect(backup.data.weights[0].photo).toMatch(/^data:image/);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#importData").setInputFiles({
      name: "weight-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.locator("#overlay")).toHaveClass(/hidden/);
    await page.reload();
    await expect(page.locator("[data-weight]")).toContainText("67.25 kg");
    await page.locator("[data-weight]").click();
    await expect(page.locator("#weightNote")).toHaveValue("선택 메모");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#deleteWeight").click();
    await expect(page.locator("#weightForm")).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#deleteWeight").click();
    await expect(page.locator("[data-weight]")).toHaveCount(0);
    await page.reload();
    await expect(page.locator("[data-weight]")).toHaveCount(0);
    await page.locator("#pointsButton").click();
    await expect(page.locator("#pointsContent")).toContainText("1,000P");
    await expect(page.locator("#pointsContent")).toContainText(
      "포인트를 사용하지 않아요",
    );
    await expect(page.locator("#pointsBalance")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
