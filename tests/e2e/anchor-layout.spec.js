import { test, expect } from '@playwright/test';
import { openDashboard, expectHashAnchorSafe, expectMapContained } from './helpers.js';

const SECTION_IDS = [
  'overview',
  'map-section',
  'areas',
  'quality',
  'system-structure',
  'watchlist',
  'data-completeness'
];

test('section navigation does not place target underneath sticky chrome', async ({ page }) => {
  await openDashboard(page);

  for (const id of SECTION_IDS) {
    await page.locator(`.section-link[href="#${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));

    await expect.poll(() => page.evaluate(targetId => {
      const target = document.getElementById(targetId);
      const header = document.getElementById('appHeader');
      const filter = document.getElementById('filters');
      if (!target || !header) return false;
      const filterSticky = filter && getComputedStyle(filter).position === 'sticky';
      const obstructionBottom = header.getBoundingClientRect().bottom +
        (filterSticky ? filter.getBoundingClientRect().height + 8 : 0);
      const targetTop = target.getBoundingClientRect().top;
      return targetTop >= obstructionBottom - 2 && targetTop < window.innerHeight;
    }, id), { timeout: 5_000 }).toBe(true);
  }
});

test('Leaflet map remains contained below header/navigation/filter stacking', async ({ page }) => {
  await openDashboard(page);
  await expectMapContained(page);
});

test('direct hash navigation resolves without sticky collision', async ({ page }) => {
  await openDashboard(page);
  for (const id of SECTION_IDS) await expectHashAnchorSafe(page, id);
});
