import { test, expect } from '@playwright/test';
import { collectRuntimeErrors, installBasePublicRoutes } from './helpers.js';

test('API/network failure resolves to a visible initial-load error state instead of a broken page', async ({ page }) => {
  await installBasePublicRoutes(page);
  await page.route('**/data/mock/villages.json', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'fixture unavailable' })
  }));

  await page.goto('/');
  await expect(page.locator('#referenceStatus')).toContainText('โหลดข้อมูลไม่สำเร็จ', { timeout: 20_000 });
  await expect(page.locator('body')).toContainText('KwanKukkeb');
});

test('refresh failure preserves the last accepted public data and shows distinct error status', async ({ page }) => {
  await installBasePublicRoutes(page);
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
  await expect(page.locator('#efCount')).toContainText('1 ระบบ', { timeout: 20_000 });
  await expect(page.locator('#referenceStatus')).toHaveText('โหลดข้อมูลล่าสุดแล้ว');

  await page.locator('#btnRefresh').click();
  await expect(page.locator('#referenceStatus')).toContainText('อัปเดตไม่สำเร็จ กำลังแสดงข้อมูลที่โหลดก่อนหน้านี้', { timeout: 20_000 });
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  await expect(page.locator('#btnRefresh')).toBeEnabled();
});

test('empty datasets render explicit empty states without runtime exceptions', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await installBasePublicRoutes(page);

  for (const file of ['villages.json', 'water_systems.json', 'village_water_sources.json']) {
    await page.route(`**/data/mock/${file}`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]'
    }));
  }

  await page.goto('/');
  await expect(page.locator('#efCount')).toContainText('แสดง 0 ระบบ จาก 0 · 0 หมู่บ้าน จาก 0', { timeout: 20_000 });
  await expect(page.locator('#gfEmpty')).toBeVisible();
  await expect(page.locator('#heroMapStage .map-empty')).toBeVisible();
  await expect(page.locator('#map .dvicon')).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});
