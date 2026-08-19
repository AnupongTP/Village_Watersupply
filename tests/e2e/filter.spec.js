import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

test('district → local-authority cascade updates dashboard and clear filters restores province scope', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#filterDistrict').selectOption({ label: 'จุน' });
  await expect(page.locator('#kpiVillages')).toHaveText('1');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expect(page.locator('#scopeLabel')).toContainText('จุน');

  const authorityOptions = page.locator('#filterLocalAuthority option');
  await expect(authorityOptions).toHaveCount(2);
  await expect(authorityOptions.nth(0)).toHaveText('ทั้งหมด');
  await expect(authorityOptions.nth(1)).toHaveText('เทศบาลตำบลจุน');

  await page.locator('#filterLocalAuthority').selectOption({ label: 'เทศบาลตำบลจุน' });
  await expect(page.locator('#kpiVillages')).toHaveText('1');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expect(page.locator('#scopeLabel')).toContainText('เทศบาลตำบลจุน');

  await page.locator('#filterDistrict').selectOption({ label: 'เมืองพะเยา' });
  await expect(page.locator('#filterLocalAuthority')).toHaveValue('');
  await expect(page.locator('#filterLocalAuthority option')).toHaveCount(2);
  await expect(page.locator('#filterLocalAuthority option').nth(1)).toHaveText('เทศบาลเมืองพะเยา');

  await page.locator('#btnClearFilters').click();
  await expect(page.locator('#kpiVillages')).toHaveText('2');
  await expect(page.locator('#kpiSystems')).toHaveText('2');
  await expect(page.locator('#scopeLabel')).toHaveText('จังหวัดพะเยา');
  await expect(page.locator('#filterDistrict')).toHaveValue('');
  await expect(page.locator('#filterLocalAuthority')).toHaveValue('');
});
