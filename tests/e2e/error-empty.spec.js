import { test, expect } from '@playwright/test';
import { collectRuntimeErrors } from './helpers.js';

test('API/network failure resolves to a visible initial-load error state instead of a broken page', async ({ page }) => {
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

test('refresh failure preserves the last accepted public data and successful-load timestamp', async ({ page }) => {
  let villageRequests = 0;
  await page.route('**/data/mock/villages.json', route => {
    villageRequests += 1;
    if (villageRequests === 1) {
      return route.fulfill({ json: [
        { village_id: 'v1', province: 'พะเยา', district: 'จุน', local_authority: 'ทต.จุน', village_name: 'บ้านคงข้อมูล', has_village_waterworks: true }
      ] });
    }
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/data/mock/water_systems.json', route => route.fulfill({ json: [
    { system_id: 's1', village_id: 'v1', system_name: 'ระบบคงข้อมูล', latitude: 19.2, longitude: 100.1, operational_status: 'WORKING', drinking_water_quality: 'PASS', water_quantity: 'SUFFICIENT', system_type: 'GROUNDWATER_SMALL' }
  ] }));
  await page.route('**/data/mock/village_water_sources.json', route => route.fulfill({ json: [] }));

  await page.goto('/');
  await expect(page.locator('#kpiVillages')).toHaveText('1', { timeout: 20_000 });
  await expect(page.locator('.swal2-container')).toHaveCount(0, { timeout: 20_000 });
  const beforeTimestamp = await page.locator('#dataUpdatedAt').innerText();

  await page.locator('#btnRefresh').click();
  await expect(page.locator('.swal2-title')).toHaveText('รีเฟรชข้อมูลไม่สำเร็จ', { timeout: 20_000 });
  await expect(page.locator('.swal2-html-container')).toContainText('ข้อมูลเดิมที่โหลดสำเร็จล่าสุดยังคงแสดงอยู่');
  await expect(page.locator('#kpiVillages')).toHaveText('1');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expect(page.locator('#dataUpdatedAt')).toHaveText(beforeTimestamp);
  await expect(page.locator('#btnRefresh')).toHaveAttribute('aria-busy', 'false');
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
