import { test, expect } from '@playwright/test';
import { collectRuntimeErrors } from './helpers.js';

test('real Apps Script data loads into production dashboard', async ({ page }) => {
  test.skip(process.env.REAL_API !== '1', 'Runs only in the real API smoke workflow');

  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('#kpiVillages')).not.toHaveText('-', { timeout: 35_000 });

  const villageCount = Number((await page.locator('#kpiVillages').innerText()).replace(/[^0-9]/g, ''));
  const systemCount = Number((await page.locator('#kpiSystems').innerText()).replace(/[^0-9]/g, ''));

  expect(villageCount).toBeGreaterThan(0);
  expect(systemCount).toBeGreaterThan(0);
  expect(runtimeErrors).toEqual([]);
});
