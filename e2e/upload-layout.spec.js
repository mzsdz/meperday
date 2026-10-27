import { test, expect } from "@playwright/test";
const image = {
  name: "meal.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvFkAAAAASUVORK5CYII=",
    "base64",
  ),
};
for (const width of [320, 393, 430]) {
  test.describe(`${width}px upload form`, () => {
    test.use({ viewport: { width, height: 736 } });
    for (const kind of ["food", "exercise"]) {
      test(`${kind}: single full-width upload target opens picker and photo-only record saves`, async ({
        page,
      }) => {
        await page.goto("/");
        await page.locator(`[data-add="${kind}"]`).first().click();
        const upload = page.locator("label.uploadbox");
        const layout = await upload.evaluate((el) => {
          const box = el.getBoundingClientRect(),
            form = el.closest("form").getBoundingClientRect(),
            icon = el.querySelector(".big").getBoundingClientRect(),
            sheet = document.querySelector("#sheet");
          return {
            fragments: el.getClientRects().length,
            width: box.width,
            formWidth: form.width,
            iconCenter: icon.x + icon.width / 2,
            boxCenter: box.x + box.width / 2,
            overflow: sheet.scrollWidth - sheet.clientWidth,
          };
        });
        expect(layout.fragments).toBe(1);
        expect(Math.abs(layout.width - layout.formWidth)).toBeLessThan(2);
        expect(Math.abs(layout.iconCenter - layout.boxCenter)).toBeLessThan(2);
        expect(layout.overflow).toBeLessThanOrEqual(1);
        const date = page.locator(kind === "food" ? "#foodDate" : "#exDate");
        const dateLayout = await date.evaluate((el) => ({
          width: el.getBoundingClientRect().width,
          parentWidth: el.parentElement.getBoundingClientRect().width,
          fontSize: parseFloat(getComputedStyle(el).fontSize),
        }));
        expect(dateLayout.width).toBeLessThanOrEqual(
          dateLayout.parentWidth + 1,
        );
        expect(dateLayout.fontSize).toBeGreaterThanOrEqual(16);
        const [picker] = await Promise.all([
          page.waitForEvent("filechooser"),
          upload.click(),
        ]);
        await picker.setFiles(image);
        await expect(
          page.locator(
            kind === "food" ? "#photoPreview img" : "#exPhotoPreview img",
          ),
        ).toBeVisible();
        await page
          .locator(
            `#${kind === "food" ? "foodForm" : "exerciseForm"} button[type="submit"]`,
          )
          .click();
        await expect(page.locator("#overlay")).toHaveClass(/hidden/);
        await page.reload();
        expect(
          await page.evaluate(
            (kind) =>
              JSON.parse(localStorage.getItem("meday-mvp-v02"))[
                kind === "food" ? "records" : "exercises"
              ].length,
            kind,
          ),
        ).toBe(1);
      });
    }
  });
}
