import { test, expect } from '@playwright/test';
import {
  collectUserFacingTextAndAttributes,
  openDashboard,
  openMapPopupForSystem
} from './helpers.js';

const TARGET_LOCAL_AUTHORITY_SYSTEM = 'PY-W-000001';
const DATABASE_CODE_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

function expectNoEnumLeaks(surfaceText) {
  const databaseCodes = surfaceText.match(DATABASE_CODE_PATTERN) || [];
  expect(databaseCodes, `database codes leaked: ${databaseCodes.join(', ')}`).toEqual([]);
}

test('database enum codes and private fields do not leak into visible Reference UI', async ({ page }) => {
  await openDashboard(page);

  const execSurface = await collectUserFacingTextAndAttributes(page, 'body');
  expectNoEnumLeaks(execSurface);
  expect(execSurface).not.toContain('76927E3D-BF09-EEF1-E5B6-A9A2ED30F490_test.pdf');
  expect(execSurface).not.toContain('กรมทรัพยากรน้ำบาดาล');

  const popup = await openMapPopupForSystem(page, TARGET_LOCAL_AUTHORITY_SYSTEM);
  const popupSurface = await collectUserFacingTextAndAttributes(page, '#map .leaflet-popup');
  expectNoEnumLeaks(popupSurface);
  await popup.locator(`[data-open-system="${TARGET_LOCAL_AUTHORITY_SYSTEM}"]`).click();

  const modal = page.locator('#referenceDetail');
  await expect(modal).toBeVisible();
  const detailSurface = await collectUserFacingTextAndAttributes(page, '#referenceDetail');
  expectNoEnumLeaks(detailSurface);
  await expect(modal).toContainText('อปท.');

  await page.locator('#referenceDetail .reference-drawer-x').click();
  await page.locator('.main-nav button[data-view="detail"]').click();
  for (const tab of ['compare', 'insight', 'table', 'vtable', 'problem']) {
    await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
    const panelSurface = await collectUserFacingTextAndAttributes(page, `#panel-${tab}`);
    expectNoEnumLeaks(panelSurface);
  }
});
