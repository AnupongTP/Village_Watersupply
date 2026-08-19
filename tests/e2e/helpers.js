import { expect } from '@playwright/test';

export const LOCKED_VIEWPORTS = Object.freeze([
  { name: 'desktop-xl', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'notebook', width: 1366, height: 768 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'mobile-wide', width: 440, height: 956 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'mobile-narrow', width: 360, height: 800 }
]);

export function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

export function collectForbiddenHttpMethods(page) {
  const forbidden = [];
  page.on('request', request => {
    const method = request.method().toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      forbidden.push(`${method} ${request.url()}`);
    }
  });
  return forbidden;
}


export async function installMockData(page, {
  villages = [],
  waterSystems = [],
  waterSources = []
} = {}) {
  await page.route('**/data/mock/villages.json', route => route.fulfill({ json: villages }));
  await page.route('**/data/mock/water_systems.json', route => route.fulfill({ json: waterSystems }));
  await page.route('**/data/mock/village_water_sources.json', route => route.fulfill({ json: waterSources }));
}

export async function clickChartElement(page, canvasId, datasetIndex, index) {
  const canvas = page.locator(`#${canvasId}`);
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();

  const point = await page.evaluate(({ canvasId: id, datasetIndex: dataset, index: item }) => {
    const element = document.getElementById(id);
    const chart = window.Chart?.getChart?.(element);
    const visual = chart?.getDatasetMeta(dataset)?.data?.[item];
    if (!chart || !visual) return null;
    const center = typeof visual.getCenterPoint === 'function'
      ? visual.getCenterPoint()
      : { x: visual.x, y: visual.y };
    return { x: center.x, y: center.y };
  }, { canvasId, datasetIndex, index });

  expect(point, `Chart element ${canvasId}[${datasetIndex}][${index}] was not rendered`).not.toBeNull();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + point.x, box.y + point.y);
}

export async function chartLabelIndex(page, canvasId, label) {
  return page.evaluate(({ canvasId: id, label: expected }) => {
    const chart = window.Chart?.getChart?.(document.getElementById(id));
    return chart?.data?.labels?.findIndex(value => String(value) === String(expected)) ?? -1;
  }, { canvasId, label });
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

export async function expectMapContained(page) {
  const geometry = await page.evaluate(() => {
    const map = document.getElementById('waterMap')?.getBoundingClientRect();
    const stack = document.querySelector('.map-stack')?.getBoundingClientRect();
    const panel = document.querySelector('.map-panel')?.getBoundingClientRect();
    const header = document.getElementById('appHeader')?.getBoundingClientRect();
    const filter = document.querySelector('.filter-shell')?.getBoundingClientRect();
    const controls = [...document.querySelectorAll('#waterMap .leaflet-control')]
      .filter(node => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(node => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
      });

    if (!map || !stack || !panel || !header || !filter) return null;
    return {
      map: { top: map.top, right: map.right, bottom: map.bottom, left: map.left },
      stack: { top: stack.top, right: stack.right, bottom: stack.bottom, left: stack.left },
      panel: { top: panel.top, right: panel.right, bottom: panel.bottom, left: panel.left },
      headerBottom: header.bottom,
      filterBottom: filter.bottom,
      controls
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.map.top).toBeGreaterThanOrEqual(geometry.headerBottom - 1);
  expect(geometry.map.top).toBeGreaterThanOrEqual(geometry.filterBottom - 1);
  expect(geometry.map.top).toBeGreaterThanOrEqual(geometry.stack.top - 1);
  expect(geometry.map.bottom).toBeLessThanOrEqual(geometry.stack.bottom + 1);
  expect(geometry.map.left).toBeGreaterThanOrEqual(geometry.stack.left - 1);
  expect(geometry.map.right).toBeLessThanOrEqual(geometry.stack.right + 1);
  expect(geometry.map.top).toBeGreaterThan(geometry.panel.top);
  expect(geometry.map.bottom).toBeLessThanOrEqual(geometry.panel.bottom + 1);

  for (const control of geometry.controls) {
    expect(control.top).toBeGreaterThanOrEqual(geometry.map.top - 1);
    expect(control.bottom).toBeLessThanOrEqual(geometry.map.bottom + 1);
    expect(control.left).toBeGreaterThanOrEqual(geometry.map.left - 1);
    expect(control.right).toBeLessThanOrEqual(geometry.map.right + 1);
  }
}

export async function expectHashAnchorSafe(page, targetId) {
  await page.evaluate(id => {
    window.location.hash = `#${id}`;
  }, targetId);

  await expect.poll(async () => page.evaluate(id => {
    const target = document.getElementById(id);
    const header = document.getElementById('appHeader');
    const filter = document.getElementById('filters');
    if (!target || !header) return null;

    const headerBottom = header.getBoundingClientRect().bottom;
    const filterSticky = filter && getComputedStyle(filter).position === 'sticky';
    const filterHeight = filterSticky ? filter.getBoundingClientRect().height + 8 : 0;
    const expectedTop = headerBottom + filterHeight;
    const targetTop = target.getBoundingClientRect().top;
    return {
      hash: window.location.hash,
      targetTop,
      expectedTop,
      delta: targetTop - expectedTop
    };
  }, targetId), { timeout: 5_000 }).toMatchObject({ hash: `#${targetId}` });

  const geometry = await page.evaluate(id => {
    const target = document.getElementById(id);
    const header = document.getElementById('appHeader');
    const filter = document.getElementById('filters');
    const headerBottom = header?.getBoundingClientRect().bottom || 0;
    const filterSticky = filter && getComputedStyle(filter).position === 'sticky';
    const filterHeight = filterSticky ? filter.getBoundingClientRect().height + 8 : 0;
    return {
      targetTop: target?.getBoundingClientRect().top ?? -9999,
      obstructionBottom: headerBottom + filterHeight,
      viewportHeight: window.innerHeight
    };
  }, targetId);

  expect(geometry.targetTop).toBeGreaterThanOrEqual(geometry.obstructionBottom - 2);
  // Near the end of the document the browser may hit max scroll before the
  // target can align exactly to scroll-margin-top. It still has to be visible.
  expect(geometry.targetTop).toBeLessThan(geometry.viewportHeight);
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
