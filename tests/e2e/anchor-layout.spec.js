import { test, expect } from '@playwright/test';
import { openDashboard, expectHashAnchorSafe, expectMapContained } from './helpers.js';

const REFERENCE_HASH_ROUTES = ['overview', 'compare', 'insight', 'table', 'vtable', 'problemList'];

test('view and tab navigation switch Reference workspaces cleanly', async ({ page }) => {
  await openDashboard(page);

  await page.locator('.main-nav button[data-view="detail"]').click();
  await expect(page.locator('#view-detail')).toBeVisible();
  await expect(page.locator('#view-exec')).toBeHidden();

  for (const tab of ['compare', 'insight', 'table', 'vtable', 'problem']) {
    await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
    await expect(page.locator(`#panel-${tab}`)).toBeVisible();
  }

  await page.locator('.main-nav button[data-view="exec"]').click();
  await expect(page.locator('#view-exec')).toBeVisible();
});

test('global filter bar is part of normal document flow and never sticky', async ({ page }) => {
  await openDashboard(page);
  const position = await page.locator('#gfBar').evaluate(element => getComputedStyle(element).position);
  expect(position).not.toBe('sticky');
  expect(position).not.toBe('fixed');
});

test('Leaflet map remains contained below header and global filter bar', async ({ page }) => {
  await openDashboard(page);
  await expectMapContained(page);
});

test('direct hash navigation resolves to Reference views and tabs', async ({ page }) => {
  await openDashboard(page);
  for (const route of REFERENCE_HASH_ROUTES) {
    await expectHashAnchorSafe(page, route);
  }
});
