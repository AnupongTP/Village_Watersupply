import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

// Reference UX replaces legacy floating #btnBackToTop with view navigation that scrolls to top on switch.
test('switching Reference main views returns scroll to the top and omits legacy floating #btnBackToTop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await expect(page.locator('#btnBackToTop')).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  await page.locator('.main-nav button[data-view="detail"]').click();
  await expect(page.locator('#view-detail')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeLessThan(5);
});
