import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

const SYSTEM_COUNT = 25;

async function installLargeWatchlistFixture(page) {
  await page.route('**/data/mock/water_systems.json', async route => {
    const response = await route.fetch();
    const base = await response.json();
    const template = base[0];
    const systems = Array.from({ length: SYSTEM_COUNT }, (_, index) => ({
      ...template,
      system_id: `QA-W-${String(index + 1).padStart(6, '0')}`,
      system_name: `ระบบประปาทดสอบรายการที่ ${index + 1}`,
      latitude: 19.20 + (index % 5) * 0.005,
      longitude: 99.80 + Math.floor(index / 5) * 0.005,
      operational_status: 'WORKING',
      drinking_water_quality: 'FAIL',
      water_quantity: 'SUFFICIENT',
      transfer_document_status: 'NO_DATA',
      transfer_document_url: ''
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(systems) });
  });
}

test('watchlist renders every matching record and remains internally scrollable', async ({ page }) => {
  await installLargeWatchlistFixture(page);
  await openDashboard(page);

  await expect(page.locator('#watchlistTotal')).toHaveText(String(SYSTEM_COUNT));
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(SYSTEM_COUNT);
  await expect(page.locator('.watchlist-mobile .watch-card')).toHaveCount(SYSTEM_COUNT);

  const desktopScroll = await page.locator('.watchlist-scroll').evaluate(node => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    overflowY: getComputedStyle(node).overflowY
  }));
  expect(desktopScroll.overflowY).toBe('auto');
  expect(desktopScroll.scrollHeight).toBeGreaterThan(desktopScroll.clientHeight);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.watchlist-mobile')).toBeVisible();
  const mobileScroll = await page.locator('.watchlist-mobile').evaluate(node => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    overflowY: getComputedStyle(node).overflowY
  }));
  expect(mobileScroll.overflowY).toBe('auto');
  expect(mobileScroll.scrollHeight).toBeGreaterThan(mobileScroll.clientHeight);
});
