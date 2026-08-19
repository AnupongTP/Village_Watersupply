import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

test('district filter updates dashboard and clear filters restores province scope', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#filterDistrict').selectOption({ label: 'จุน' });
  await expect(page.locator('#kpiVillages')).toHaveText('1');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expect(page.locator('#scopeLabel')).toContainText('จุน');

  await page.locator('#btnClearFilters').click();
  await expect(page.locator('#kpiVillages')).toHaveText('2');
  await expect(page.locator('#scopeLabel')).toHaveText('จังหวัดพะเยา');
});
