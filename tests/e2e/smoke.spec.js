import { test, expect } from '@playwright/test';
import {
  collectRuntimeErrors,
  openDashboard,
  expectNoHorizontalPageOverflow
} from './helpers.js';

test('dashboard loads without runtime errors and without page overflow', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openDashboard(page);

  await expect(page.locator('#kpiVillages')).toHaveText('2');
  await expect(page.locator('#kpiSystems')).toHaveText('2');
  await expectNoHorizontalPageOverflow(page);
  expect(runtimeErrors).toEqual([]);
});
