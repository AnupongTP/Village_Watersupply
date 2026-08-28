import { test, expect } from '@playwright/test';
import {
  LOCKED_VIEWPORTS,
  openDashboard,
  expectHashAnchorSafe,
  expectMapContained,
  expectNoHorizontalPageOverflow
} from './helpers.js';

const CRITICAL_ANCHORS = ['map-section', 'system-structure', 'watchlist'];

for (const viewport of LOCKED_VIEWPORTS) {
  test(`responsive layout: ${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openDashboard(page);
    await expectNoHorizontalPageOverflow(page);
    await expectMapContained(page);

    const mapBox = await page.locator('#waterMap').boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(mapBox.height).toBeGreaterThan(200);
    expect(mapBox.height).toBeLessThanOrEqual(Math.max(540, viewport.height * 0.75));

    for (const id of CRITICAL_ANCHORS) await expectHashAnchorSafe(page, id);

    if (viewport.width < 768) {
      await expect(page.locator('#btnFilterToggle')).toBeVisible();
      await expect(page.locator('.watchlist-mobile')).toBeVisible();
      await expect(page.locator('.problem-table')).toBeHidden();
    } else {
      await expect(page.locator('#filterPanel')).toBeVisible();
    }

    await expect(page.locator('#data-completeness')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}.png`), fullPage: true });
  });
}
