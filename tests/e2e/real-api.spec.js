import { test, expect } from '@playwright/test';
import {
  collectForbiddenHttpMethods,
  collectRuntimeErrors,
  collectUserFacingTextAndAttributes
} from './helpers.js';

const DATABASE_CODE_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

function expectNoEnumLeaks(surfaceText) {
  const databaseCodes = surfaceText.match(DATABASE_CODE_PATTERN) || [];
  expect(databaseCodes, `database codes leaked: ${databaseCodes.join(', ')}`).toEqual([]);
}

test('real Apps Script data loads into production dashboard without presentation or read-only regressions', async ({ page }) => {
  test.skip(process.env.REAL_API !== '1', 'Runs only in the real API smoke workflow');

  const runtimeErrors = collectRuntimeErrors(page);
  const forbiddenMethods = collectForbiddenHttpMethods(page);
  await page.goto('/');
  await expect(page.locator('#efCount')).toContainText('ระบบ', { timeout: 35_000 });
  await expect(page.locator('#referenceStatus')).toHaveText('โหลดข้อมูลล่าสุดแล้ว', { timeout: 35_000 });
  await expect(page.locator('#map .dvicon').first()).toBeAttached({ timeout: 15_000 });

  const bodySurface = await collectUserFacingTextAndAttributes(page, 'body');
  expectNoEnumLeaks(bodySurface);

  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="table"]').click();
  await page.locator('#tblBody tr').first().click();
  await expect(page.locator('#referenceDetail')).toBeVisible();
  const detailSurface = await collectUserFacingTextAndAttributes(page, '#referenceDetail');
  expectNoEnumLeaks(detailSurface);

  expect(forbiddenMethods).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
