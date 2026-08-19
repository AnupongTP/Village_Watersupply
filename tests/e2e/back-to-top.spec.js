import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

test('back-to-top is hidden near the top, appears after scrolling, and returns to the top', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  const button = page.locator('#btnBackToTop');
  await expect(button).toBeHidden();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(button).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('back-to-top-mobile.png'), fullPage: false });

  await button.click();
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeLessThan(5);
  await expect(button).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('appHeader');
});

test('back-to-top honors reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('#btnBackToTop')).toBeVisible();

  await page.evaluate(() => {
    const original = window.scrollTo.bind(window);
    window.__backToTopScrollCalls = [];
    window.scrollTo = options => {
      window.__backToTopScrollCalls.push(options);
      original(options);
    };
  });

  await page.locator('#btnBackToTop').click();
  const lastCall = await page.evaluate(() => window.__backToTopScrollCalls.at(-1));
  expect(lastCall?.behavior).toBe('auto');
});
