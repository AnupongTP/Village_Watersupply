import { test, expect } from '@playwright/test';
import { collectForbiddenHttpMethods, openDashboard } from './helpers.js';

// Reference UX (index_watersupply (2).html) omits legacy #btnUserLocation and #btnMapHome map buttons.
test('hero map renders without legacy Phayao home or geolocation buttons and issues zero mutating requests', async ({ page }) => {
  const forbidden = collectForbiddenHttpMethods(page);
  await openDashboard(page);

  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#map .dvicon')).toHaveCount(2);
  await expect(page.locator('#btnMapHome')).toHaveCount(0);
  await expect(page.locator('#btnUserLocation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'กว๊านพะเยา' })).toHaveCount(0);

  const storageSnapshot = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage)
  }));
  expect(storageSnapshot).toEqual({ local: [], session: [] });
  expect(forbidden).toEqual([]);
});
