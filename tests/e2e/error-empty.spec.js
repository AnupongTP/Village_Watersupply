import { test, expect } from '@playwright/test';
import { collectRuntimeErrors } from './helpers.js';

test('API/network failure resolves to a visible error state instead of a broken page', async ({ page }) => {
  await page.route('**/data/mock/villages.json', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'fixture unavailable' })
  }));

  await page.goto('/');
  await expect(page.locator('.swal2-title')).toHaveText('ไม่สามารถโหลดข้อมูลได้', { timeout: 20_000 });
  await expect(page.locator('.swal2-html-container')).toContainText('โหลดไฟล์');
  await expect(page.locator('body')).toContainText('ระบบข้อมูลประปาหมู่บ้าน');
});

test('empty datasets render explicit empty states without runtime exceptions', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);

  for (const file of ['villages.json', 'water_systems.json', 'village_water_sources.json']) {
    await page.route(`**/data/mock/${file}`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]'
    }));
  }

  await page.goto('/');
  await expect(page.locator('#kpiVillages')).toHaveText('0', { timeout: 20_000 });
  await expect(page.locator('#kpiSystems')).toHaveText('0');
  await expect(page.locator('#problemList .empty-state')).toBeVisible();
  await expect(page.locator('.chart-empty')).toHaveCount(4);
  await expect(page.locator('.water-system-marker')).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});
