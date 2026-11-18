import { test, expect } from '@playwright/test';
import {
  LOCKED_VIEWPORTS,
  openDashboard,
  expectHashAnchorSafe,
  expectMapContained,
  expectNoHorizontalPageOverflow
} from './helpers.js';

const REFERENCE_ROUTES = ['overview', 'compare', 'table', 'problemList'];

for (const viewport of LOCKED_VIEWPORTS) {
  test(`responsive layout: ${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openDashboard(page);
    await expectNoHorizontalPageOverflow(page);
    await expectMapContained(page);

    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(mapBox.height).toBeGreaterThan(200);

    for (const route of REFERENCE_ROUTES) {
      await expectHashAnchorSafe(page, route);
      await expectNoHorizontalPageOverflow(page);
    }

    await page.locator('.main-nav button[data-view="exec"]').click();
    await expect(page.locator('#view-exec')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}.png`), fullPage: true });
  });
}
