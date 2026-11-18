import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { repoRoot, resolveUiSourcePath, resolveUiSourceRoot } from '../support/source-root.mjs';
import { projectPublicDataset } from '../../tools/public-dataset/projection.mjs';
import { prepareLocalPublicCandidate } from '../../tools/public-dataset/local-integration.mjs';
import { createVerifiedSnapshotStore } from '../../tools/public-dataset/snapshot.mjs';

const uiRoot = resolveUiSourceRoot();
const origin = 'http://village.test';
const BLANK_TILE = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e8f0"/></svg>';
const fixture = {
  success: true,
  villages: [
    { village_id: 'v1', village_name: 'Linked coordinate-less', has_village_waterworks: true },
    { village_id: 'v2', village_name: 'Unlinked waterworks', has_village_waterworks: true },
    { village_id: 'v3', village_name: 'Visible village', has_village_waterworks: true }
  ],
  waterSystems: [
    { system_id: 's1', village_id: 'v1', system_name: 'Hidden system', latitude: '', longitude: 100 },
    { system_id: 's3', village_id: 'v3', system_name: 'Visible system', latitude: 19.2, longitude: 100.1 }
  ],
  waterSources: [
    { source_id: 'r1', village_id: 'v1', source_type: 'PWA' },
    { source_id: 'r2', village_id: 'v2', source_type: 'PWA' },
    { source_id: 'r3', village_id: 'v3', source_type: 'PWA' }
  ]
};
const manifest = { complete: true, counts: { villages: 3, waterSystems: 2, waterSources: 3 } };

test('isolated browser R5.1 output agrees with local projection for synthetic source data', async ({ page }) => {
  const forbidden = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        return route.fulfill({ contentType: 'text/css', body: '' });
      }
      if (url.hostname.endsWith('.arcgisonline.com') || url.hostname.endsWith('.tile.openstreetmap.org')) {
        return route.fulfill({ contentType: 'image/svg+xml', body: BLANK_TILE });
      }
      forbidden.push(url.hostname);
      return route.abort();
    }
    if (url.pathname === '/assets/js/config.js') {
      return route.fulfill({ contentType: 'text/javascript', body: "export const CONFIG = { USE_MOCK_DATA: true, API_URL: '' };" });
    }
    const dataFiles = {
      '/data/mock/villages.json': fixture.villages,
      '/data/mock/water_systems.json': fixture.waterSystems,
      '/data/mock/village_water_sources.json': fixture.waterSources
    };
    if (Object.hasOwn(dataFiles, url.pathname)) return route.fulfill({ json: dataFiles[url.pathname] });
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
  });

  await page.goto(origin);
  const projection = projectPublicDataset(fixture, manifest);
  await expect(page.locator('#efCount')).toContainText(`${projection.waterSystems.length} ระบบ`);
  await expect(page.locator('#efCount')).toContainText(`${projection.villages.length} หมู่บ้าน`);
  await expect(page.locator('body')).not.toContainText('Unlinked waterworks');
  await expect(page.locator('body')).not.toContainText('Hidden system');

  await page.locator('#fq').fill('Linked coordinate-less');
  await expect(page.locator('#efCount')).toContainText('แสดง 0 ระบบ จาก 1 · 1 หมู่บ้าน จาก 2');

  const prepare = () => prepareLocalPublicCandidate(fixture, manifest, {
    verifyRead: () => ({
      complete: true, consistentRead: true, authority: 'synthetic browser oracle',
      tables: { villages: 'villages', waterSystems: 'water_systems', waterSources: 'village_water_sources' },
      headers: {
        villages: ['village_id', 'has_village_waterworks'],
        waterSystems: ['system_id', 'village_id', 'latitude', 'longitude'],
        waterSources: ['source_id', 'village_id']
      },
      tableIds: {
        villages: fixture.villages.map(row => row.village_id),
        waterSystems: fixture.waterSystems.map(row => row.system_id),
        waterSources: fixture.waterSources.map(row => row.source_id)
      },
      revision: { value: 1, monotonic: true, authority: 'synthetic browser sequence' }
    }),
    verifyEligibility: () => ({
      complete: true, authority: 'synthetic browser oracle',
      decisions: fixture.waterSystems.map(row => ({ systemId: row.system_id, status: 'ELIGIBLE' }))
    }),
    observationTime: '2026-10-19T04:00:00Z'
  });
  const store = createVerifiedSnapshotStore();
  store.accept(prepare().candidate);
  const serverResponse = store.publicResponse(prepare().candidate);
  const consumedIds = await page.evaluate(async response => {
    const { consumeLocalDashboardResponse } = await import('/tools/public-dataset/dashboard-consumer.mjs');
    const data = consumeLocalDashboardResponse(response);
    return data.villages.map(row => row.village_id);
  }, serverResponse);
  expect(consumedIds).toEqual(['v1', 'v3']);
  expect(forbidden).toEqual([]);
});
