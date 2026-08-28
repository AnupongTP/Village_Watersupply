import { test, expect } from '@playwright/test';
import { openDashboard, expectHashAnchorSafe, expectMapContained } from './helpers.js';

const SECTION_IDS = [
  'overview',
  'map-section',
  'areas',
  'quality',
  'system-structure',
  'watchlist'
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

test('global filter is part of normal document flow and never sticky', async ({ page }) => {
  await openDashboard(page);
  const position = await page.locator('#filters').evaluate(element => getComputedStyle(element).position);
  expect(position).not.toBe('sticky');
  expect(position).not.toBe('fixed');
});

test('Leaflet map remains contained below header/navigation/filter stacking', async ({ page }) => {
  await openDashboard(page);
  await expectMapContained(page);
});

test('direct hash navigation resolves without sticky collision', async ({ page }) => {
  await openDashboard(page);
  for (const id of SECTION_IDS) await expectHashAnchorSafe(page, id);
});
