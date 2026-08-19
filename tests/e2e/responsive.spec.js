import { test, expect } from '@playwright/test';
import { openDashboard, expectNoHorizontalPageOverflow } from './helpers.js';

const viewports = [
  { name: 'desktop-xl', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'notebook', width: 1366, height: 768 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'mobile-wide', width: 440, height: 956 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'mobile-narrow', width: 360, height: 800 }
];

for (const viewport of viewports) {
  test(`responsive layout: ${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openDashboard(page);
    await expectNoHorizontalPageOverflow(page);

    const mapBox = await page.locator('#waterMap').boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(mapBox.height).toBeGreaterThan(200);
    expect(mapBox.height).toBeLessThanOrEqual(Math.max(540, viewport.height * 0.75));

    if (viewport.width < 768) {
      await expect(page.locator('#btnFilterToggle')).toBeVisible();
      await expect(page.locator('.watchlist-mobile')).toBeVisible();
    }

    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}.png`),
      fullPage: true
    });
  });
}
