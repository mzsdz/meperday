import { expect } from "@playwright/test";
export async function mine(page) { await page.locator("#myPageBtn").click(); }
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
