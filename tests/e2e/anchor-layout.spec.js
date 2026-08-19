import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

test('section navigation does not place target underneath sticky chrome', async ({ page }) => {
  await openDashboard(page);

  for (const id of ['map-section', 'system-structure', 'watchlist', 'data-completeness']) {
    await page.locator(`.section-link[href="#${id}"]`).click();
    await page.waitForTimeout(350);

    const geometry = await page.evaluate(targetId => {
      const target = document.getElementById(targetId);
      const header = document.getElementById('appHeader');
      if (!target) return null;
      return {
        targetTop: target.getBoundingClientRect().top,
        headerBottom: header?.getBoundingClientRect().bottom || 0
      };
    }, id);

    expect(geometry).not.toBeNull();
    expect(geometry.targetTop).toBeGreaterThanOrEqual(geometry.headerBottom - 2);
  }
});

test('Leaflet map remains contained below header/navigation/filter stacking', async ({ page }) => {
  await openDashboard(page);

  const boxes = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
    const map = document.getElementById('waterMap')?.getBoundingClientRect();
    const header = document.getElementById('appHeader')?.getBoundingClientRect();
    const filter = rect('.filter-shell');
    const stack = rect('.map-stack');
    const panel = rect('.map-panel');

    if (!map || !header || !filter || !stack || !panel) return null;

    return {
      mapTop: map.top,
      mapRight: map.right,
      mapBottom: map.bottom,
      mapLeft: map.left,
      headerBottom: header.bottom,
      filterBottom: filter.bottom,
      stackTop: stack.top,
      stackRight: stack.right,
      stackBottom: stack.bottom,
      stackLeft: stack.left,
      panelTop: panel.top,
      panelBottom: panel.bottom
    };
  });

  expect(boxes).not.toBeNull();

  // At initial load the map belongs to normal content flow below both sticky UI layers.
  expect(boxes.mapTop).toBeGreaterThanOrEqual(boxes.headerBottom - 1);
  expect(boxes.mapTop).toBeGreaterThanOrEqual(boxes.filterBottom - 1);

  // Leaflet must remain clipped to its own map stack; this is the regression that
  // prevents panes/controls from visually escaping over the header/filter chrome.
  expect(boxes.mapTop).toBeGreaterThanOrEqual(boxes.stackTop - 1);
  expect(boxes.mapBottom).toBeLessThanOrEqual(boxes.stackBottom + 1);
  expect(boxes.mapLeft).toBeGreaterThanOrEqual(boxes.stackLeft - 1);
  expect(boxes.mapRight).toBeLessThanOrEqual(boxes.stackRight + 1);
  expect(boxes.mapTop).toBeGreaterThan(boxes.panelTop);
  expect(boxes.mapBottom).toBeLessThanOrEqual(boxes.panelBottom + 1);
});
