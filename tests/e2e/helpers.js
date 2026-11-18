import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { repoRoot, resolveUiSourcePath, resolveUiSourceRoot } from '../support/source-root.mjs';

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

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const BLANK_TILE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e8f0"/></svg>';

export async function installBasePublicRoutes(page) {
  if (page.__vwsPublicRouted) return;
  page.__vwsPublicRouted = true;
  page.__vwsUnexpectedHosts = [];

  const uiRoot = resolveUiSourceRoot();
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());

    if (url.origin === 'http://127.0.0.1:4173' || url.origin === 'http://localhost:4173') {
      if (url.pathname === '/assets/js/config.js') {
        return route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: "export const CONFIG = { APP_NAME: 'Village Water Supply Dashboard', PROVINCE: 'พะเยา', API_URL: '', USE_MOCK_DATA: true };"
        });
      }
      const pathname = decodeURIComponent(url.pathname);
      const rel = (pathname.endsWith('/') ? `${pathname}index.html` : pathname).replace(/^\/+/, '');
      const file = resolveUiSourcePath(rel);
      const allowed = file.startsWith(`${uiRoot}${path.sep}`) ||
        (file.startsWith(`${repoRoot}${path.sep}`) && /^(?:data\/mock|tools)\//.test(rel));
      if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, body: 'Not found' });
      }
      return route.fulfill({
        status: 200,
        contentType: MIME_TYPES[path.extname(file)] || 'application/octet-stream',
        body: fs.readFileSync(file)
      });
    }

    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    if (url.hostname.endsWith('.arcgisonline.com') || url.hostname.endsWith('.tile.openstreetmap.org')) {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: BLANK_TILE_SVG });
    }

    page.__vwsUnexpectedHosts.push(route.request().url());
    return route.abort();
  });
}

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
  await installBasePublicRoutes(page);
  await page.route('**/data/mock/villages.json', route => route.fulfill({ json: villages }));
  await page.route('**/data/mock/water_systems.json', route => route.fulfill({ json: waterSystems }));
  await page.route('**/data/mock/village_water_sources.json', route => route.fulfill({ json: waterSources }));
}

export async function clickChartElement(page, canvasId, datasetIndex, index) {
  const canvas = page.locator(`#${canvasId}`);
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();

  await expect.poll(async () => page.evaluate(({ id, dataset, item }) => {
    const element = document.getElementById(id);
    const chart = window.Chart?.getChart?.(element);
    const visual = chart?.getDatasetMeta(dataset)?.data?.[item];
    if (!chart || !visual) return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const center = typeof visual.getCenterPoint === 'function'
      ? visual.getCenterPoint()
      : { x: visual.x, y: visual.y };
    return Number.isFinite(center.x) && Number.isFinite(center.y) ? { x: center.x, y: center.y } : null;
  }, { id: canvasId, dataset: datasetIndex, item: index })).not.toBeNull();

  const point = await page.evaluate(({ id, dataset, item }) => {
    const element = document.getElementById(id);
    const chart = window.Chart?.getChart?.(element);
    const visual = chart?.getDatasetMeta(dataset)?.data?.[item];
    return typeof visual.getCenterPoint === 'function'
      ? visual.getCenterPoint()
      : { x: visual.x, y: visual.y };
  }, { id: canvasId, dataset: datasetIndex, item: index });

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
  await installBasePublicRoutes(page);
  await page.goto('/');
  await expect(page.locator('#efCount')).toContainText('ระบบ', { timeout: 20_000 });
  await expect(page.locator('#referenceStatus')).toHaveText('โหลดข้อมูลล่าสุดแล้ว', { timeout: 20_000 });
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
}

/**
 * Opens the Leaflet popup for a deterministic system ID on the Reference hero map.
 */
export async function openMapPopupForSystem(page, systemId = 'PY-W-000001') {
  const execBtn = page.locator('.main-nav button[data-view="exec"]');
  if (await execBtn.count() && !await execBtn.evaluate(b => b.classList.contains('active'))) {
    await execBtn.click();
    await page.waitForTimeout(100);
  }
  await expect(page.locator('#map')).toBeVisible();

  const opened = await page.evaluate(id => {
    const map = window.__map;
    if (!map) return false;
    let found = null;
    let clusterGroup = null;
    map.eachLayer(layer => {
      if (typeof layer.zoomToShowLayer === 'function' && typeof layer.getLayers === 'function') {
        const match = layer.getLayers().find(m =>
          m.getPopup?.()?.getContent?.()?.includes(`data-open-system="${id}"`)
        );
        if (match) {
          found = match;
          clusterGroup = layer;
        }
      } else if (layer.getPopup?.()?.getContent?.()?.includes(`data-open-system="${id}"`)) {
        found = layer;
      }
    });
    if (!found) return false;
    if (clusterGroup && typeof clusterGroup.zoomToShowLayer === 'function') {
      clusterGroup.zoomToShowLayer(found, () => found.openPopup());
    } else {
      map.setView(found.getLatLng(), 16, { animate: false });
      found.openPopup();
    }
    return true;
  }, systemId);

  expect(opened, `Marker with system ${systemId} not found on map`).toBe(true);
  const popup = page.locator('#map .leaflet-popup');
  await expect(popup).toBeVisible({ timeout: 8_000 });
  await expect(popup.locator(`[data-open-system="${systemId}"]`)).toBeVisible();
  return popup;
}

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
    const map = document.getElementById('map')?.getBoundingClientRect();
    const stage = document.getElementById('heroMapStage')?.getBoundingClientRect();
    const header = document.querySelector('.app-header')?.getBoundingClientRect();
    const filter = document.getElementById('gfBar')?.getBoundingClientRect();
    const controls = [...document.querySelectorAll('#map .leaflet-control')]
      .filter(node => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(node => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
      });

    if (!map || !stage || !header || !filter) return null;
    return {
      map: { top: map.top, right: map.right, bottom: map.bottom, left: map.left },
      stage: { top: stage.top, right: stage.right, bottom: stage.bottom, left: stage.left },
      headerBottom: header.bottom,
      filterBottom: filter.bottom,
      controls
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry.map.top).toBeGreaterThanOrEqual(geometry.headerBottom - 1);
  expect(geometry.map.top).toBeGreaterThanOrEqual(geometry.filterBottom - 1);
  expect(geometry.map.top).toBeGreaterThanOrEqual(geometry.stage.top - 1);
  expect(geometry.map.bottom).toBeLessThanOrEqual(geometry.stage.bottom + 1);
  expect(geometry.map.left).toBeGreaterThanOrEqual(geometry.stage.left - 1);
  expect(geometry.map.right).toBeLessThanOrEqual(geometry.stage.right + 1);

  for (const control of geometry.controls) {
    expect(control.top).toBeGreaterThanOrEqual(geometry.map.top - 1);
    expect(control.bottom).toBeLessThanOrEqual(geometry.map.bottom + 1);
    expect(control.left).toBeGreaterThanOrEqual(geometry.map.left - 1);
    expect(control.right).toBeLessThanOrEqual(geometry.map.right + 1);
  }
}

export async function expectHashAnchorSafe(page, hashTarget) {
  await page.evaluate(id => {
    window.location.hash = `#${id}`;
  }, hashTarget);

  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#${hashTarget}`);

  const visiblePanel = ['overview', 'exec'].includes(hashTarget)
    ? '#view-exec'
    : ['compare', 'insight', 'table', 'vtable'].includes(hashTarget)
      ? `#panel-${hashTarget}`
      : ['problem', 'problemList'].includes(hashTarget)
        ? '#panel-problem'
        : `#${hashTarget}`;

  await expect(page.locator(visiblePanel)).toBeVisible({ timeout: 5_000 });
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
