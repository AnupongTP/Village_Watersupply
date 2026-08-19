import { test, expect } from '@playwright/test';
import { collectForbiddenHttpMethods, openDashboard } from './helpers.js';

test('map toolbar exposes user location and removes the old Phayao home button', async ({ page }) => {
  await openDashboard(page);
  await expect(page.locator('#btnUserLocation')).toBeVisible();
  await expect(page.locator('#btnUserLocation')).toContainText('ตำแหน่งฉัน');
  await expect(page.locator('#btnMapFit')).toBeVisible();
  await expect(page.locator('#btnMapHome')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'กว๊านพะเยา' })).toHaveCount(0);
});

test('user location is shown on the map without issuing mutating HTTP requests', async ({ context, page }, testInfo) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await context.setGeolocation({ latitude: 19.171194, longitude: 99.874972, accuracy: 9 });
  const forbidden = collectForbiddenHttpMethods(page);

  await openDashboard(page);
  await page.locator('#btnUserLocation').click();

  await expect(page.locator('.user-location-marker')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('.leaflet-popup')).toContainText('ตำแหน่งของคุณ');
  await expect(page.locator('.leaflet-popup')).toContainText('ไม่ได้ส่งไปบันทึกในระบบ');
  expect(forbidden).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('user-location.png'), fullPage: false });
});

test('permission denial shows actionable Thai guidance and leaves the dashboard usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success, failure) {
          failure({ code: 1, message: 'Permission denied' });
        }
      }
    });
  });

  await openDashboard(page);
  await page.locator('#btnUserLocation').click();

  await expect(page.locator('.swal2-title')).toHaveText('ไม่สามารถใช้ตำแหน่งปัจจุบันได้');
  await expect(page.locator('.swal2-popup')).toContainText('อนุญาตสิทธิ์ตำแหน่ง');
  await page.locator('.swal2-confirm').click();
  await expect(page.locator('#waterMap')).toBeVisible();
});
