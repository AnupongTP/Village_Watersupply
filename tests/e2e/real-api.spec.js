import { test, expect } from '@playwright/test';
import {
  collectForbiddenHttpMethods,
  collectRuntimeErrors,
  collectUserFacingTextAndAttributes
} from './helpers.js';

const DATABASE_CODE_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const INTERNAL_ID_PATTERN = /\bPY-[A-Z0-9]+-\d+\b/gi;

function expectNoPresentationLeaks(surfaceText) {
  const databaseCodes = surfaceText.match(DATABASE_CODE_PATTERN) || [];
  const internalIds = surfaceText.match(INTERNAL_ID_PATTERN) || [];
  expect(databaseCodes, `database codes leaked: ${databaseCodes.join(', ')}`).toEqual([]);
  expect(internalIds, `internal IDs leaked: ${internalIds.join(', ')}`).toEqual([]);
}

test('real Apps Script data loads into production dashboard without presentation or read-only regressions', async ({ page }) => {
  test.skip(process.env.REAL_API !== '1', 'Runs only in the real API smoke workflow');

  const runtimeErrors = collectRuntimeErrors(page);
  const forbiddenMethods = collectForbiddenHttpMethods(page);
  await page.goto('/');
  await expect(page.locator('#kpiVillages')).not.toHaveText('-', { timeout: 35_000 });

  const villageCount = Number((await page.locator('#kpiVillages').innerText()).replace(/[^0-9]/g, ''));
  const systemCount = Number((await page.locator('#kpiSystems').innerText()).replace(/[^0-9]/g, ''));

  expect(villageCount).toBeGreaterThan(0);
  expect(systemCount).toBeGreaterThan(0);
  await expect(page.locator('.water-system-marker').first()).toBeAttached({ timeout: 15_000 });

  const bodySurface = await collectUserFacingTextAndAttributes(page, 'body');
  expectNoPresentationLeaks(bodySurface);

  const mapButton = page.locator('[data-watch-system-id]:visible [data-action="map"]:not([disabled])').first();
  await expect(mapButton).toBeVisible({ timeout: 15_000 });
  await mapButton.click();
  await expect(page.locator('.leaflet-popup')).toBeVisible({ timeout: 8_000 });

  const popupSurface = await collectUserFacingTextAndAttributes(page, '.leaflet-popup');
  expectNoPresentationLeaks(popupSurface);

  await page.locator('.leaflet-popup [data-map-action="detail"]').click();
  await expect(page.locator('#systemDrawer')).toHaveClass(/open/);
  const drawerSurface = await collectUserFacingTextAndAttributes(page, '#drawerContent');
  expectNoPresentationLeaks(drawerSurface);

  expect(forbiddenMethods).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
