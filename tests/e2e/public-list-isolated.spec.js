import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { repoRoot, resolveUiSourcePath, resolveUiSourceRoot } from '../support/source-root.mjs';
import { LOCKED_VIEWPORTS, expectNoHorizontalPageOverflow, expectHashAnchorSafe, clickChartElement, chartLabelIndex } from './helpers.js';

const uiRoot = resolveUiSourceRoot();
const origin = 'http://village.test';
const blankTile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e8f0"/></svg>';

const villages = Array.from({ length: 27 }, (_, index) => ({
  village_id: `v${index + 1}`,
  village_name: `บ้านเผยแพร่ ${String(index + 1).padStart(2, '0')}`,
  district: index < 24 ? 'จุน' : 'เชียงคำ',
  local_authority: index < 24 ? 'เทศบาลตำบลจุน' : 'เทศบาลตำบลเชียงคำ',
  has_village_waterworks: true,
  pwa_households: 15, mwa_households: 0, commercial_households: 0, other_village_pipe_households: 0,
  waterbank_households: 0, self_source_households: 5, natural_source_households: 0
}));
villages.push({ village_id: 'hidden-village', village_name: 'บ้านข้อมูลซ่อน', district: 'จุน', has_village_waterworks: true });
villages.push({ village_id: 'unlinked-village', village_name: 'บ้านไม่เชื่อมโยง', district: 'จุน', has_village_waterworks: true });

const systems = Array.from({ length: 27 }, (_, index) => ({
  system_id: `s${index + 1}`,
  village_id: `v${index + 1}`,
  system_name: `ระบบเผยแพร่ ${String(index + 1).padStart(2, '0')}`,
  latitude: 19.2 + index * 0.001,
  longitude: 99.8 + index * 0.001,
  system_type: index % 2 === 0 ? 'GROUNDWATER_SMALL' : 'SURFACE_SMALL',
  operational_status: (index + 1) % 5 === 0 ? 'NOT_WORKING' : 'WORKING',
  drinking_water_quality: 'PASS',
  water_quantity: 'SUFFICIENT',
  households_served: 25
}));
systems.push({ system_id: 'hidden-system', village_id: 'hidden-village', system_name: 'ระบบข้อมูลซ่อน', latitude: '', longitude: '', operational_status: 'NOT_WORKING' });

async function openIsolatedPublic(page) {
  const unexpected = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || error.message));
  page.on('request', request => {
    if (request.url().includes('script.google.com')) unexpected.push(request.url());
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (url.pathname === '/assets/js/config.js') {
        return route.fulfill({ contentType: 'text/javascript', body: "export const CONFIG = { USE_MOCK_DATA: true, API_URL: '' };" });
      }
      const data = {
        '/data/mock/villages.json': villages,
        '/data/mock/water_systems.json': systems,
        '/data/mock/village_water_sources.json': []
      };
      if (Object.hasOwn(data, url.pathname)) return route.fulfill({ json: data[url.pathname] });
      const pathname = decodeURIComponent(url.pathname);
      const rel = (pathname.endsWith('/') ? `${pathname}index.html` : pathname).replace(/^\/+/, '');
      const file = resolveUiSourcePath(rel);
      const allowed = file.startsWith(`${uiRoot}${path.sep}`) ||
        (file.startsWith(`${repoRoot}${path.sep}`) && /^(?:data\/mock|tools)\//.test(rel));
      if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, body: 'Not found' });
      }
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: fs.readFileSync(file) });
    }
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    if (url.hostname.endsWith('.arcgisonline.com') || url.hostname.endsWith('.tile.openstreetmap.org')) {
      return route.fulfill({ contentType: 'image/svg+xml', body: blankTile });
    }
    unexpected.push(url.hostname);
    return route.abort();
  });
  await page.goto(origin);
  await expect(page.locator('#efCount')).toContainText('แสดง 27 ระบบ จาก 27', { timeout: 20_000 });
  return { unexpected, pageErrors };
}

test('single global filter supports canonical ID search and R5.1 without revealing hidden systems', async ({ page }) => {
  const evidence = await openIsolatedPublic(page);

  await expect(page.locator('#referenceVisibility')).toHaveCount(0);
  await page.locator('#fq').fill('s27');
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ จาก 27');
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="table"]').click();
  await expect(page.locator('#tblBody tr')).toHaveCount(1);
  await expect(page.locator('#tblBody')).toContainText('s27');

  await page.locator('#fq').fill('hidden-system');
  await expect(page.locator('#efCount')).toContainText('แสดง 0 ระบบ จาก 27');
  await expect(page.locator('#tblBody')).not.toContainText('บ้านข้อมูลซ่อน');

  await page.locator('#efReset').click();
  await expect(page.locator('#efCount')).toContainText('แสดง 27 ระบบ จาก 27');
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
});

test('detail systems table, problem view, global filters and R5.1 stay synchronized', async ({ page }) => {
  const evidence = await openIsolatedPublic(page);
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="table"]').click();
  await expect(page.locator('#tblBody tr')).toHaveCount(27);
  await expect(page.locator('#tblBody')).not.toContainText('ระบบข้อมูลซ่อน');

  await page.locator('.tab-btn[data-tab="problem"]').click();
  await expect(page.locator('#probBody tr.dmg-row')).toHaveCount(5);

  await page.locator('#frule').selectOption('ops');
  await expect(page.locator('#efCount')).toContainText('แสดง 5 ระบบ จาก 27');
  await page.locator('#efReset').click();

  await page.locator('#fd').selectOption('เชียงคำ');
  await expect(page.locator('#efCount')).toContainText('แสดง 3 ระบบ จาก 27');
  await page.locator('#efReset').click();

  await page.locator('#fst').selectOption('GROUNDWATER_SMALL');
  await expect(page.locator('#efCount')).toContainText('แสดง 14 ระบบ จาก 27');

  expect(evidence.unexpected).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
});

test('chart cross-filter, map popups and table detail stay connected to the accepted dataset', async ({ page }) => {
  const evidence = await openIsolatedPublic(page);
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="table"]').click();
  await page.locator('#tblBody tr').first().click();
  await expect(page.locator('#referenceDetail')).toBeVisible();
  await page.locator('#referenceDetail .reference-drawer-x').click();

  await page.locator('.main-nav button[data-view="exec"]').click();
  const districtIndex = await chartLabelIndex(page, 'c_hhmix', 'เชียงคำ');
  expect(districtIndex).toBeGreaterThanOrEqual(0);
  await clickChartElement(page, 'c_hhmix', 0, districtIndex);
  await expect(page.locator('#efCount')).toContainText('แสดง 3 ระบบ จาก 27');
  await expect(page.locator('#fd')).toHaveValue('เชียงคำ');

  expect(evidence.unexpected).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
});

for (const width of [360, 390]) test(`mobile Public map popup stays within stage bounds at ${width}px with visible actions`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const evidence = await openIsolatedPublic(page);
  await page.evaluate(() => {
    const map = window.__map;
    let firstMarker = null;
    let cluster = null;
    map.eachLayer(l => {
      if (typeof l.zoomToShowLayer === 'function' && typeof l.getLayers === 'function' && !firstMarker) {
        cluster = l;
        firstMarker = l.getLayers()[0] || null;
      }
    });
    if (cluster && firstMarker) cluster.zoomToShowLayer(firstMarker, () => firstMarker.openPopup());
  });
  const popup = page.locator('#map .leaflet-popup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('[data-open-system]')).toBeVisible();
  await expect(popup.locator('a[href*="google.com/maps"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath(`public-mobile-map-popup-${width}.png`) });
  await popup.locator('[data-open-system]').click();
  await expect(page.locator('#referenceDetail')).toBeVisible();
  await expect(page.locator('#referenceDetail')).toContainText('ข้อมูลระบบประปา');
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
});

for (const viewport of LOCKED_VIEWPORTS) {
  test(`isolated public list responsive ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const evidence = await openIsolatedPublic(page);
    await expectNoHorizontalPageOverflow(page);
    await expectHashAnchorSafe(page, 'table');
    await expect(page.locator('#tblBody tr')).toHaveCount(27);
    await expectNoHorizontalPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`public-list-${viewport.width}.png`), fullPage: true });
    expect(evidence.unexpected).toEqual([]);
    expect(evidence.pageErrors).toEqual([]);
  });
}
