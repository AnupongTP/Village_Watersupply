import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

const SYSTEM_ID = 'PY-W-000001';

function visibleDetailButton(page) {
  return page.locator(`[data-watch-system-id="${SYSTEM_ID}"]:visible [data-action="detail"]`).first();
}

async function openFromWatchlist(page) {
  const button = visibleDetailButton(page);
  await expect(button).toBeVisible();
  await button.focus();
  await button.click();
  await expect(page.locator('#systemDrawer')).toHaveClass(/open/);
  await expect(page.locator('#systemDrawer')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#btnCloseDrawer')).toBeFocused();
  return button;
}

test('drawer closes by X, Escape and backdrop and restores trigger focus', async ({ page }) => {
  await openDashboard(page);

  let trigger = await openFromWatchlist(page);
  await page.locator('#btnCloseDrawer').click();
  await expect(page.locator('#systemDrawer')).not.toHaveClass(/open/);
  await expect(page.locator('#systemDrawer')).toHaveAttribute('aria-hidden', 'true');
  await expect(trigger).toBeFocused();

  trigger = await openFromWatchlist(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#systemDrawer')).not.toHaveClass(/open/);
  await expect(trigger).toBeFocused();

  trigger = await openFromWatchlist(page);
  await page.locator('#systemDrawer').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('#systemDrawer')).not.toHaveClass(/open/);
  await expect(trigger).toBeFocused();
});

test('mobile drawer fills the viewport, scrolls internally and keeps content readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await openFromWatchlist(page);

  const geometry = await page.locator('.drawer-panel').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(geometry.viewportWidth - 2);
  expect(geometry.height).toBeGreaterThanOrEqual(geometry.viewportHeight - 2);

  const content = await page.locator('#drawerContent').evaluate(node => ({
    overflowY: getComputedStyle(node).overflowY,
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight
  }));
  expect(content.overflowY).toBe('auto');
  expect(content.scrollHeight).toBeGreaterThanOrEqual(content.clientHeight);
  await expect(page.locator('#drawerContent')).toContainText('ข้อมูลระบบประปา');
});
