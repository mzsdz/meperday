import { expect } from "@playwright/test";
export async function mine(page) {
  await expect(page.locator(".concierge-thread,.brand-hero,.mypage-intro").first()).toBeVisible();
  if (await page.locator(".conversation-actions [data-open-journal]").isVisible()) await page.locator(".conversation-actions [data-open-journal]").click();
  else if (await page.locator("#myPageBtn").isVisible()) await page.locator("#myPageBtn").click();
  else { await page.locator("#settingsButton").click(); await page.locator("[data-open-journal]").click(); }
}
export async function addManual(page,kind) {
  await mine(page);
  const details=page.locator(".manual-options");
  if(!(await details.evaluate(el=>el.open))) await details.locator("summary").click();
  await page.locator(`[data-add="${kind}"]`).click();
}
export async function editRecord(page,kind) {
  await mine(page);
  await page.locator(`[data-record-kind="${kind}"]`).first().click();
  if(await page.locator("#editConversationRecord").count()) await page.locator("#editConversationRecord").click();
  await expect(page.locator(`#${kind==='food'?'food':kind==='weight'?'weight':'exercise'}Form`)).toBeVisible();
}
