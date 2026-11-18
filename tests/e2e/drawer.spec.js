import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

async function openFromTable(page) {
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="table"]').click();
  const row = page.locator('#tblBody tr').first();
  await expect(row).toBeVisible();
  await row.focus();
  await row.click();
  const modal = page.locator('#referenceDetail');
  await expect(modal).toBeVisible();
  return row;
}

test('detail dialog closes by button and Escape and restores trigger focus', async ({ page }) => {
  await openDashboard(page);

  let trigger = await openFromTable(page);
  await page.locator('#referenceDetail .reference-drawer-x').click();
  await expect(page.locator('#referenceDetail')).toHaveCount(0);
  await expect(trigger).toBeFocused();

  trigger = await openFromTable(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#referenceDetail')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('mobile detail dialog stays within viewport and scrolls internally without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await openFromTable(page);

  const box = await page.locator('#referenceDetail').boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(page.locator('#referenceDetail')).toContainText('ข้อมูลระบบประปา');
});
