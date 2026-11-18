import { test, expect } from '@playwright/test';
import {
  collectForbiddenHttpMethods,
  collectRuntimeErrors,
  openDashboard,
  expectNoHorizontalPageOverflow
} from './helpers.js';

test('dashboard loads without runtime errors, write requests or page overflow', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const forbiddenMethods = collectForbiddenHttpMethods(page);

  await openDashboard(page);
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await expect(page.locator('#execKpi')).toContainText('2');
  await expectNoHorizontalPageOverflow(page);

  expect(page.__vwsUnexpectedHosts || []).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  expect(forbiddenMethods).toEqual([]);
});
