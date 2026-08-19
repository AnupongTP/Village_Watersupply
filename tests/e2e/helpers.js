import { expect } from '@playwright/test';

export function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

export async function openDashboard(page) {
  await page.goto('/');
  await expect(page.locator('#kpiVillages')).not.toHaveText('-', { timeout: 20_000 });
  await expect(page.locator('#waterMap')).toBeVisible();
}

/**
 * Opens the popup for a deterministic fixture system through the real Watchlist
 * → Map focus flow. This avoids depending on SVG DOM order or on whether a
 * marker starts inside the current Leaflet viewport.
 */
export async function openMapPopupForSystem(page, systemId = 'PY-W-000001') {
  const mapButton = page
    .locator(`[data-watch-system-id="${systemId}"]:visible [data-action="map"]`)
    .first();

  await expect(mapButton).toBeVisible({ timeout: 20_000 });
  await mapButton.click();

  const popup = page.locator('.leaflet-popup');
  await expect(popup).toBeVisible({ timeout: 6_000 });
  await expect(popup.locator('[data-system-id="' + systemId + '"]').first()).toBeAttached();
  return popup;
}

// Backward-compatible helper for any older spec that still imports it.
export async function openFirstMapPopup(page) {
  return openMapPopupForSystem(page, 'PY-W-000001');
}

export async function expectNoHorizontalPageOverflow(page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

export async function collectUserFacingTextAndAttributes(page, rootSelector) {
  return page.locator(rootSelector).evaluate(root => {
    const chunks = [];
    const push = value => {
      const text = String(value || '').trim();
      if (text) chunks.push(text);
    };

    push(root.innerText);

    const attrs = ['aria-label', 'title', 'alt', 'placeholder'];
    const nodes = [root, ...root.querySelectorAll('*')];
    for (const node of nodes) {
      for (const attr of attrs) push(node.getAttribute?.(attr));
    }

    return chunks.join('\n');
  });
}
