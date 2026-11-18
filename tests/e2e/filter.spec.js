import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

test('district → local-authority cascade updates dashboard and clear filters restores province scope', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#fd').selectOption('จุน');
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ จาก 2 · 1 หมู่บ้าน จาก 2');

  const authorityOptions = page.locator('#fla option');
  await expect(authorityOptions).toHaveCount(2);
  await expect(authorityOptions.nth(0)).toHaveText('ทั้งหมด');
  await expect(authorityOptions.nth(1)).toHaveText('เทศบาลตำบลจุน');

  await page.locator('#fla').selectOption('เทศบาลตำบลจุน');
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ จาก 2 · 1 หมู่บ้าน จาก 2');
  await expect(page.locator('#gfChips')).toContainText('อำเภอ: จุน');
  await expect(page.locator('#gfChips')).toContainText('อปท.: เทศบาลตำบลจุน');

  await page.locator('#fd').selectOption('เมืองพะเยา');
  await expect(page.locator('#fla')).toHaveValue('');
  await expect(page.locator('#fla option')).toHaveCount(2);
  await expect(page.locator('#fla option').nth(1)).toHaveText('เทศบาลเมืองพะเยา');
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ จาก 2 · 1 หมู่บ้าน จาก 2');

  await page.locator('#efReset').click();
  await expect(page.locator('#efCount')).toContainText('แสดง 2 ระบบ จาก 2 · 2 หมู่บ้าน จาก 2');
  await expect(page.locator('#fd')).toHaveValue('');
  await expect(page.locator('#fla')).toHaveValue('');
  await expect(page.locator('#efReset')).toBeHidden();
});
