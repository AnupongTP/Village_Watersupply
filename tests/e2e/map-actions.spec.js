import { test, expect } from '@playwright/test';
import { openDashboard, openMapPopupForSystem } from './helpers.js';

const SYSTEM_WITH_DOCUMENT = 'PY-W-000001';

test('map popup exposes shared detail action and preview-first document card', async ({ page }) => {
  await openDashboard(page);
  await openMapPopupForSystem(page, SYSTEM_WITH_DOCUMENT);

  const detailButton = page.locator('[data-map-action="detail"]');
  const navigateButton = page.locator('[data-map-action="navigate"]');
  await expect(detailButton).toBeVisible();
  await expect(navigateButton).toBeVisible();

  await detailButton.click();
  await expect(page.locator('#systemDrawer')).toHaveClass(/open/);
  await expect(page.locator('#drawerContent')).toContainText('เอกสารอ้างอิง');

  const previewLink = page.locator('#drawerContent a[data-document-preview]');
  await expect(previewLink).toBeVisible();
  const href = await previewLink.getAttribute('href');
  expect(href).toContain('https://docs.google.com/gview');
  expect(await previewLink.getAttribute('download')).toBeNull();
});

test('desktop navigation opens Google Maps directions with marker coordinates', async ({ page }) => {
  await page.addInitScript(() => {
    window.__openedNavigationUrls = [];
    window.open = url => {
      window.__openedNavigationUrls.push(String(url));
      return { opener: null };
    };
  });

  await openDashboard(page);
  await openMapPopupForSystem(page, SYSTEM_WITH_DOCUMENT);
  await page.locator('[data-map-action="navigate"]').click();

  await expect.poll(
    () => page.evaluate(() => window.__openedNavigationUrls || []),
    { timeout: 3_000 }
  ).toHaveLength(1);

  const opened = await page.evaluate(() => window.__openedNavigationUrls || []);
  expect(opened[0]).toContain('https://www.google.com/maps/dir/');
  expect(opened[0]).toContain('destination=19.320000%2C100.170000');
});

test('mobile navigation shows an app chooser instead of forcing one provider', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await openMapPopupForSystem(page, SYSTEM_WITH_DOCUMENT);
  await page.locator('[data-map-action="navigate"]').click();

  await expect(page.locator('.swal2-title')).toHaveText('เลือกแอปนำทาง');
  await expect(page.locator('[data-navigation-target="google"]')).toContainText('Google Maps');
  await expect(page.locator('[data-navigation-target="other"]')).toBeVisible();
  await expect(page.locator('[data-navigation-target="web"]')).toContainText('Google Maps บนเว็บ');
});
