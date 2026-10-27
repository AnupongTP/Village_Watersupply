import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { LOCKED_VIEWPORTS, expectNoHorizontalPageOverflow, expectHashAnchorSafe, clickChartElement, chartLabelIndex } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://village.test';
const blankTile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e8f0"/></svg>';
const villages = Array.from({ length: 27 }, (_, index) => ({
  village_id: `v${index + 1}`,
  village_name: `บ้านเผยแพร่ ${String(index + 1).padStart(2, '0')}`,
  district: index < 24 ? 'จุน' : 'เชียงคำ',
  local_authority: index < 24 ? 'เทศบาลตำบลจุน' : 'เทศบาลตำบลเชียงคำ',
  has_village_waterworks: true
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
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, body: 'Not found' });
      }
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: fs.readFileSync(file) });
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.hostname === 'unpkg.com' && url.pathname.includes('/images/')) {
      return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.join(root, 'assets/vendor/leaflet/images', path.basename(url.pathname))) });
    }
    const vendor = url.hostname === 'unpkg.com'
      ? (url.pathname.endsWith('.css') ? 'assets/vendor/leaflet/leaflet.css' : url.pathname.endsWith('.js') ? 'assets/vendor/leaflet/leaflet.js' : '')
      : url.hostname === 'cdn.jsdelivr.net'
        ? (url.pathname.includes('sweetalert2') ? 'assets/vendor/sweetalert2/sweetalert2.all.min.js' : url.pathname.includes('chart.js') ? 'assets/vendor/chartjs/chart.umd.js' : '')
        : '';
    if (vendor) return route.fulfill({ contentType: vendor.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join(root, vendor)) });
    if (url.hostname.includes('arcgisonline.com') || url.hostname.endsWith('.tile.openstreetmap.org')) return route.fulfill({ contentType: 'image/svg+xml', body: blankTile });
    unexpected.push(url.hostname);
    return route.abort();
  });
  await page.goto(origin);
  await expect(page.locator('#publicListAllCount')).toHaveText('27');
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  return { unexpected, pageErrors };
}

test('single global filter and separate list search support IDs without revealing hidden systems',async({page})=>{
  const evidence=await openIsolatedPublic(page);
  const legendText=id=>page.locator(`#${id}Legend button`).allTextContents();
  expect(await legendText('quantityChart')).toEqual(['เพียงพอ 27 ระบบ','ไม่เพียงพอ 0 ระบบ','ไม่มีข้อมูล 0 ระบบ']);
  expect(await legendText('qualityChart')).toEqual(['ผ่านเกณฑ์ 27 ระบบ','ไม่ผ่านเกณฑ์ 0 ระบบ','ไม่มีข้อมูล 0 ระบบ']);
  await page.locator('#quantityChartLegend button').first().click();
  await expect(page.locator('#filterWaterQuantity')).toHaveValue('SUFFICIENT');
  await expect(page.locator('#quantityChartLegend button').first()).toHaveAttribute('aria-pressed','true');
  await page.locator('#quantityChartLegend button').first().press('Enter');
  await expect(page.locator('#filterWaterQuantity')).toHaveValue('');
  await expect(page.locator('#btnClearFilters')).toBeHidden();
  await expect(page.locator('#publicListDistrict,#publicListType,#publicListStatus,#publicListClear,#filterPublicVisibility')).toHaveCount(0);
  await page.locator('#publicListSearch').fill('s27');
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(1);
  await expect(page.locator('#kpiSystems')).toHaveText('27');
  await expect(page.locator('#btnClearFilters')).toBeHidden();
  await page.locator('#publicListSearch').fill('');
  await page.locator('#filterSearch').fill('s27');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  expect(await legendText('quantityChart')).toEqual(['เพียงพอ 1 ระบบ','ไม่เพียงพอ 0 ระบบ','ไม่มีข้อมูล 0 ระบบ']);
  expect(await legendText('qualityChart')).toEqual(['ผ่านเกณฑ์ 1 ระบบ','ไม่ผ่านเกณฑ์ 0 ระบบ','ไม่มีข้อมูล 0 ระบบ']);
  await expect(page.locator('#btnClearFilters')).toBeVisible();
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(1);
  await page.locator('#filterSearch').fill('hidden-system');
  await expect(page.locator('#kpiSystems')).toHaveText('0');
  await expect(page.locator('#qualityChartLegend button')).toHaveCount(0);
  await expect(page.locator('#problemList')).not.toContainText('บ้านข้อมูลซ่อน');
  await page.locator('#btnClearFilters').click();
  await expect(page.locator('#btnClearFilters')).toBeHidden();
  await expect(page.locator('#kpiSystems')).toHaveText('27');
  await expect(page.locator('#qualityChartLegend button')).toHaveCount(3);
  expect(evidence.unexpected).toEqual([]);expect(evidence.pageErrors).toEqual([]);
});

test('all and monitoring modes, local filters, pagination and R5.1 use only accepted systems', async ({ page }) => {
  const evidence = await openIsolatedPublic(page);
  await expect(page.locator('#publicListMonitoringCount')).toHaveText('5');
  await expect(page.locator('#publicListPageStatus')).toHaveText('หน้า 1/2');
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(20);
  await expect(page.locator('body')).not.toContainText('ระบบข้อมูลซ่อน');
  await expect(page.locator('#publicListSearch')).toHaveValue('');
  const firstIds = await page.locator('.problem-table tbody tr').evaluateAll(rows => rows.map(row => row.dataset.watchSystemId));
  await page.locator('#publicListNext').click();
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(7);
  const lastIds = await page.locator('.problem-table tbody tr').evaluateAll(rows => rows.map(row => row.dataset.watchSystemId));
  expect(new Set([...firstIds, ...lastIds]).size).toBe(27);

  await page.locator('#publicListMonitoring').click();
  await expect(page.locator('#publicListPageStatus')).toHaveText('หน้า 1/1');
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(5);
  await page.locator('#publicListAll').click();
  await page.locator('#publicListSearch').fill('ระบบเผยแพร่ 27');
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(1);
  await page.locator('#publicListSearch').fill('ระบบข้อมูลซ่อน');
  await expect(page.locator('#problemList .empty-state')).toBeVisible();
  await page.locator('#publicListSearch').fill('');
  if (await page.locator('#btnClearFilters').isEnabled()) await page.locator('#btnClearFilters').click();
  await page.locator('#filterDistrict').selectOption('เชียงคำ');
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(3);
  await page.locator('#publicListSearch').fill('');
  if (await page.locator('#btnClearFilters').isEnabled()) await page.locator('#btnClearFilters').click();
  await page.locator('#filterOperationalStatus').selectOption('NOT_WORKING');
  await expect(page.locator('.problem-table tbody tr')).toHaveCount(5);
  await page.locator('#publicListSearch').fill('');
  if (await page.locator('#btnClearFilters').isEnabled()) await page.locator('#btnClearFilters').click();
  await page.locator('#filterSystemType').selectOption('GROUNDWATER_SMALL');
  await expect(page.locator('#problemList .problem-summary strong')).toHaveText('14');
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
});

test('list actions, global filter, charts and map stay connected to the accepted dataset', async ({ page }) => {
  const evidence = await openIsolatedPublic(page);
  await page.locator('.problem-table tbody tr:first-child [data-action="detail"]').click();
  await expect(page.locator('#systemDrawer')).toHaveAttribute('aria-hidden', 'false');
  await page.locator('#btnCloseDrawer').click();
  await page.locator('.problem-table tbody tr:first-child [data-action="map"]').click();
  await expect(page.locator('.leaflet-popup')).toBeVisible();
  await expect(page.locator('.leaflet-popup [data-map-action="detail"]')).toBeVisible();
  await page.locator('#filterDistrict').selectOption('เชียงคำ');
  await expect(page.locator('#publicListAllCount')).toHaveText('3');
  await expect(page.locator('#kpiSystems')).toHaveText('3');
  await expect(page.locator('.water-system-marker')).toHaveCount(3);
  await expect(page.locator('#districtChart')).toBeVisible();
  await page.locator('#btnClearFilters').click();
  await expect(page.locator('#publicListAllCount')).toHaveText('27');
  const districtIndex = await chartLabelIndex(page, 'districtChart', 'เชียงคำ');
  expect(districtIndex).toBeGreaterThanOrEqual(0);
  await clickChartElement(page, 'districtChart', 0, districtIndex);
  await expect(page.locator('#publicListAllCount')).toHaveText('3');
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
});

for (const width of [360, 390]) test(`mobile Public map popup stays compact at ${width}px with visible actions`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const evidence = await openIsolatedPublic(page);
  await page.locator('.watchlist-mobile .watch-card:first-child [data-action="map"]').click();
  const popup = page.locator('#waterMap .system-map-popup');
  await expect(popup).toBeVisible();
  await expect.poll(async () => {
    const mapBox = await page.locator('#waterMap').boundingBox();
    const popupBox = await popup.boundingBox();
    return popupBox.y >= mapBox.y + 70 && popupBox.y + popupBox.height <= mapBox.y + mapBox.height - 8;
  }).toBe(true);
  await expect(popup.locator('[data-map-action="detail"]')).toBeVisible();
  await expect(popup.locator('[data-map-action="navigate"]')).toBeVisible();
  const map = await page.locator('#waterMap').boundingBox();
  const box = await popup.boundingBox();
  const zoom = await page.locator('#waterMap .leaflet-control-zoom').boundingBox();
  const layers = await page.locator('#waterMap .leaflet-control-layers').boundingBox();
  expect(box.height).toBeLessThanOrEqual(map.height * .7);
  expect(box.width).toBeLessThan(map.width - 50);
  await expect.poll(async () => {
    const current = await popup.boundingBox();
    return current.y >= Math.max(zoom.y + zoom.height, layers.y + layers.height) + 4;
  }).toBe(true);
  await expect(popup.locator('.map-popup strong')).toBeVisible();
  await expect(popup.locator('.detail-status-row .badge')).toHaveText(['ใช้การได้', 'น้ำเพียงพอ', 'น้ำดื่มผ่านเกณฑ์']);
  await expect(popup.locator('.map-popup')).not.toContainText('คุณภาพน้ำใช้');
  await page.screenshot({ path: testInfo.outputPath(`public-mobile-map-popup-${width}.png`) });
  await popup.locator('[data-map-action="detail"]').click();
  await expect(page.locator('#systemDrawer')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#drawerContent')).toContainText('ประเภทระบบ');
  expect(evidence.unexpected).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
});

for (const viewport of LOCKED_VIEWPORTS) {
  test(`isolated public list responsive ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const evidence = await openIsolatedPublic(page);
    await expectNoHorizontalPageOverflow(page);
    await expectHashAnchorSafe(page, 'watchlist');
    await expect(page.locator('#publicListSearch')).toBeVisible();
    await expect(page.locator('#publicListAll')).toBeVisible();
    await expect(page.locator('#waterMap')).toBeVisible();
    if (viewport.width < 1024) await expect(page.locator('.watchlist-mobile')).toBeVisible();
    else await expect(page.locator('.watchlist-scroll')).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath(`public-list-${viewport.width}.png`), fullPage: true });
    await page.locator('#watchlist').screenshot({ path: testInfo.outputPath(`public-list-section-${viewport.width}.png`) });
    expect(evidence.unexpected).toEqual([]);
    expect(evidence.pageErrors).toEqual([]);
  });
}
