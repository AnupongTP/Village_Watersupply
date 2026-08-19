import { test, expect } from '@playwright/test';
import {
  collectUserFacingTextAndAttributes,
  openDashboard,
  openMapPopupForSystem
} from './helpers.js';

const TARGET_LOCAL_AUTHORITY_SYSTEM = 'PY-W-000001';
const DATABASE_CODE_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const INTERNAL_ID_PATTERN = /\bPY-[A-Z0-9]+-\d+\b/gi;

function expectNoPresentationLeaks(surfaceText) {
  const databaseCodes = surfaceText.match(DATABASE_CODE_PATTERN) || [];
  const internalIds = surfaceText.match(INTERNAL_ID_PATTERN) || [];

  expect(databaseCodes, `database codes leaked: ${databaseCodes.join(', ')}`).toEqual([]);
  expect(internalIds, `internal IDs leaked: ${internalIds.join(', ')}`).toEqual([]);
}

test('database enum codes and internal IDs do not leak into visible UI', async ({ page }) => {
  await openDashboard(page);

  const pageSurface = await collectUserFacingTextAndAttributes(page, 'body');
  expectNoPresentationLeaks(pageSurface);

  // Validate the map popup user-facing surface as well as the main dashboard.
  await openMapPopupForSystem(page, TARGET_LOCAL_AUTHORITY_SYSTEM);
  const popupSurface = await collectUserFacingTextAndAttributes(page, '.leaflet-popup');
  expectNoPresentationLeaks(popupSurface);

  // Open the exact fixture that carries owner_type=LOCAL_AUTHORITY. The old test
  // clicked the first severity-sorted Watchlist row, which is a different owner.
  await page.locator('[data-map-action="detail"]').click();
  await expect(page.locator('#systemDrawer')).toHaveClass(/open/);

  const drawerSurface = await collectUserFacingTextAndAttributes(page, '#drawerContent');
  expectNoPresentationLeaks(drawerSurface);
  await expect(page.locator('#drawerContent')).toContainText('องค์กรปกครองส่วนท้องถิ่น');
});
