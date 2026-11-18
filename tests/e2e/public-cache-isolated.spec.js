import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { repoRoot, resolveUiSourcePath, resolveUiSourceRoot } from '../support/source-root.mjs';

const uiRoot = resolveUiSourceRoot();
const origin = 'http://village.test';
const blankTile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e8f0"/></svg>';

const NINE_RESTRICTED_FIELDS = [
  'responsible_agency', 'establishment_agency', 'transfer_agency',
  'transfer_other', 'transfer_year', 'shared_village_name',
  'transfer_document_url', 'document_url', 'owner'
];
const MANAGEMENT_AND_AUTH_FIELDS = [
  'is_deleted', 'deleted_at', 'record_status', 'submission_status', 'publication_status',
  'isDeleted', 'deletedAt', 'recordStatus', 'submissionStatus', 'publicationStatus',
  'publicVisible', 'processingGuard', 'password', 'passwordHash', 'token', 'auth_token'
];

function createSyntheticDataset() {
  const villages = [
    {
      village_id: 'v-visible-1', province: 'พะเยา', district: 'จุน', subdistrict: 'ห้วยข้าวก่ำ',
      local_authority: 'เทศบาลตำบลจุน', village_no: 1, village_name: 'บ้านเผยแพร่ 01',
      has_village_waterworks: true, pwa_households: 10, is_deleted: false, password: 'do-not-store-password'
    },
    {
      village_id: 'v-visible-2', province: 'พะเยา', district: 'เชียงคำ', subdistrict: 'หย่วน',
      local_authority: 'เทศบาลตำบลเชียงคำ', village_no: 2, village_name: 'บ้านเผยแพร่ 02',
      has_village_waterworks: true, pwa_households: 12
    },
    {
      village_id: 'v-coord-only-linked', province: 'พะเยา', district: 'จุน', subdistrict: 'จุน',
      local_authority: 'เทศบาลตำบลจุน', village_no: 3, village_name: 'บ้านเชื่อมโยงระบบพิกัดว่าง',
      has_village_waterworks: true
    },
    {
      village_id: 'v-unlinked-waterworks', province: 'พะเยา', district: 'จุน', subdistrict: 'จุน',
      local_authority: 'เทศบาลตำบลจุน', village_no: 4, village_name: 'บ้านไม่มีระบบเชื่อมโยง',
      has_village_waterworks: true
    }
  ];

  const waterSystems = [
    {
      system_id: 's-visible-1', village_id: 'v-visible-1', system_name: 'ระบบเผยแพร่ 01',
      latitude: 19.201, longitude: 99.801, system_type: 'GROUNDWATER_SMALL',
      operational_status: 'WORKING', drinking_water_quality: 'PASS', water_quantity: 'SUFFICIENT',
      households_served: 40, owner_type: 'LOCAL_AUTHORITY',
      responsible_agency: 'หน่วยงานลับ 1', establishment_agency: 'หน่วยงานจัดตั้งลับ',
      transfer_agency: 'หน่วยงานถ่ายโอนลับ', transfer_other: 'หมายเหตุลับ', transfer_year: 2561,
      shared_village_name: 'หมู่บ้านร่วมลับ',
      transfer_document_url: 'https://example.invalid/private-transfer.pdf',
      document_url: 'https://example.invalid/private-legacy.pdf',
      owner: 'เจ้าของลับ', publicVisible: true, processingGuard: { mutable: true },
      recordStatus: 'ACTIVE', token: 'MGT-secret-token', auth_token: 'bearer-secret'
    },
    {
      system_id: 's-visible-2', village_id: 'v-visible-2', system_name: 'ระบบเผยแพร่ 02',
      latitude: 19.225, longitude: 99.825, system_type: 'SURFACE_SMALL',
      operational_status: 'NOT_WORKING', drinking_water_quality: 'FAIL',
      water_quantity: 'INSUFFICIENT', households_served: 55
    },
    {
      system_id: 's-missing-coords', village_id: 'v-coord-only-linked', system_name: 'ระบบพิกัดว่าง',
      latitude: '', longitude: '', operational_status: 'NOT_WORKING'
    }
  ];

  const waterSources = [
    { source_id: 'src-1', village_id: 'v-visible-1', source_type: 'WELL', households: 15, passwordHash: 'secret-hash' },
    { source_id: 'src-2', village_id: 'v-coord-only-linked', source_type: 'RAIN', households: 8 },
    { source_id: 'src-unlinked', village_id: 'v-unlinked-waterworks', source_type: 'WELL', households: 4 }
  ];

  return { villages, waterSystems, waterSources };
}

function createDeferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

async function installPublicCacheHarness(page, { basePath = '' } = {}) {
  const state = {
    dataset: createSyntheticDataset(),
    gate: null,
    failStatus: 0,
    mockHits: 0,
    unexpected: [],
    pageErrors: []
  };

  page.on('pageerror', error => state.pageErrors.push(error.stack || error.message));
  page.on('request', request => {
    if (request.url().includes('script.google.com')) state.unexpected.push(request.url());
  });

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      let pathname = decodeURIComponent(url.pathname);
      if (basePath && pathname.startsWith(basePath)) {
        pathname = pathname.slice(basePath.length) || '/';
      }
      if (pathname === '/assets/js/config.js') {
        return route.fulfill({ contentType: 'text/javascript', body: "export const CONFIG = { USE_MOCK_DATA: true, API_URL: '' };" });
      }
      const mockMap = {
        '/data/mock/villages.json': () => state.dataset.villages,
        '/data/mock/water_systems.json': () => state.dataset.waterSystems,
        '/data/mock/village_water_sources.json': () => state.dataset.waterSources
      };
      if (Object.hasOwn(mockMap, pathname)) {
        state.mockHits += 1;
        if (state.gate) await state.gate.promise;
        if (state.failStatus) {
          return route.fulfill({ status: state.failStatus, contentType: 'text/plain', body: 'upstream error' });
        }
        return route.fulfill({ json: mockMap[pathname]() });
      }
      const rel = (pathname.endsWith('/') ? `${pathname}index.html` : pathname).replace(/^\/+/, '');
      const file = resolveUiSourcePath(rel);
      const allowed = file.startsWith(`${uiRoot}${path.sep}`) ||
        (file.startsWith(`${repoRoot}${path.sep}`) && /^(?:data\/mock|tools)\//.test(rel));
      if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return route.fulfill({ status: 404, body: 'Not found' });
      }
      const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ contentType, body: fs.readFileSync(file) });
    }
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    if (url.hostname.endsWith('.arcgisonline.com') || url.hostname.endsWith('.tile.openstreetmap.org')) {
      return route.fulfill({ contentType: 'image/svg+xml', body: blankTile });
    }
    state.unexpected.push(url.hostname);
    return route.abort();
  });

  return state;
}

async function readIdbRecord(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('vws_public_dashboard_cache');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const record = await new Promise(resolve => {
      const tx = db.transaction('datasets', 'readonly');
      const req = tx.objectStore('datasets').get('public-dataset');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return record;
  });
}

async function mutateIdbRecord(page, mutatorSource) {
  await page.evaluate(async fnBody => {
    const mutate = new Function('rec', fnBody);
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('vws_public_dashboard_cache');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');
    const rec = await new Promise(resolve => {
      const req = store.get('public-dataset');
      req.onsuccess = () => resolve(req.result);
    });
    mutate(rec);
    store.put(rec, 'public-dataset');
    await new Promise(resolve => { tx.oncomplete = resolve; });
    db.close();
  }, mutatorSource);
}

test('cold load writes strictly allowlisted R5.1 dataset to IndexedDB, and warm repeat visit renders before API completion then updates on deletion', async ({ page }) => {
  const harness = await installPublicCacheHarness(page);

  await page.goto(`${origin}/`);
  await expect(page.locator('#efCount')).toContainText('แสดง 2 ระบบ จาก 2 · 3 หมู่บ้าน จาก 3');
  await expect(page.locator('#referenceStatus')).toHaveText('โหลดข้อมูลล่าสุดแล้ว');

  await expect.poll(() => readIdbRecord(page)).not.toBeNull();
  const cached = await readIdbRecord(page);
  expect(cached.schema).toBe(1);
  expect(cached.policy).toBe('PUBLIC_ALLOWLIST_R5_1_V1');
  expect(cached.sourceKey).toBe('mock');
  expect(cached.counts).toEqual({ villages: 3, waterSystems: 2, waterSources: 2 });
  expect(cached.data.villages.map(v => v.village_id)).toEqual(['v-visible-1', 'v-visible-2', 'v-coord-only-linked']);
  expect(cached.data.waterSystems.map(s => s.system_id)).toEqual(['s-visible-1', 's-visible-2']);
  expect(cached.suppression.hiddenIssueRows).toBe(2);

  const serialized = JSON.stringify(cached);
  for (const field of [...NINE_RESTRICTED_FIELDS, ...MANAGEMENT_AND_AUTH_FIELDS]) {
    expect(serialized).not.toContain(`"${field}"`);
  }
  for (const secretValue of ['หน่วยงานลับ', 'เจ้าของลับ', 'MGT-secret-token', 'do-not-store-password', 'secret-hash']) {
    expect(serialized).not.toContain(secretValue);
  }
  expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).toEqual({ local: [], session: [] });

  // Warm repeat visit while API is held pending + deleted system in fresh response
  harness.dataset.waterSystems = harness.dataset.waterSystems.filter(s => s.system_id !== 's-visible-2');
  harness.gate = createDeferred();

  await page.reload();
  await expect(page.locator('#efCount')).toContainText('แสดง 2 ระบบ จาก 2 · 3 หมู่บ้าน จาก 3');
  await expect(page.locator('#referenceStatus')).toHaveText('กำลังอัปเดตข้อมูล…');

  harness.gate.resolve();
  harness.gate = null;
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ จาก 1 · 2 หมู่บ้าน จาก 2');
  await expect(page.locator('#referenceStatus')).toHaveText('โหลดข้อมูลล่าสุดแล้ว');

  await expect.poll(async () => (await readIdbRecord(page))?.counts?.waterSystems).toBe(1);
  const updatedCache = await readIdbRecord(page);
  expect(updatedCache.data.waterSystems.map(s => s.system_id)).toEqual(['s-visible-1']);
  expect(updatedCache.data.villages.map(v => v.village_id)).toEqual(['v-visible-1', 'v-coord-only-linked']);

  expect(harness.unexpected).toEqual([]);
  expect(harness.pageErrors).toEqual([]);
});

test('API 503 and offline fallback preserve cached dataset on screen with explicit unverified notice', async ({ page, context }) => {
  const harness = await installPublicCacheHarness(page);
  await page.goto(`${origin}/`);
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await expect.poll(() => readIdbRecord(page)).not.toBeNull();

  await mutateIdbRecord(page, "rec.savedAt = '2025-01-15T08:30:00.000Z';");
  harness.failStatus = 503;
  await page.reload();
  await expect(page.locator('#efCount')).toContainText('แสดง 2 ระบบ จาก 2 · 3 หมู่บ้าน จาก 3');
  await expect(page.locator('#referenceStatus')).toContainText('อัปเดตไม่สำเร็จ');
  await expect(page.locator('#referenceStatus')).toContainText('ยังไม่ได้ตรวจสอบ');

  await context.setOffline(true);
  await page.locator('#btnRefresh').click();
  await expect(page.locator('#referenceStatus')).toContainText('อัปเดตไม่สำเร็จ');
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await context.setOffline(false);

  harness.failStatus = 0;
  await page.locator('#btnRefresh').click();
  await expect(page.locator('#referenceStatus')).toHaveText('โหลดข้อมูลล่าสุดแล้ว');
  await expect.poll(async () => (await readIdbRecord(page))?.savedAt).not.toBe('2025-01-15T08:30:00.000Z');

  expect(harness.unexpected).toEqual([]);
  expect(harness.pageErrors).toEqual([]);
});

test('corrupted, schema-mismatched, policy-mismatched, and restricted-field-injected cache records are rejected and overwritten', async ({ page }) => {
  const harness = await installPublicCacheHarness(page);
  await page.goto(`${origin}/`);
  await expect.poll(() => readIdbRecord(page)).not.toBeNull();

  for (const [label, mutation] of [
    ['integrity tampering', "rec.data.villages[0].village_name = 'TAMPERED_VILLAGE';"],
    ['schema mismatch', 'rec.schema = 999;'],
    ['policy mismatch', "rec.policy = 'LEGACY_POLICY';"],
    ['restricted field injection', "rec.data.waterSystems[0].responsible_agency = 'LEAKED';"]
  ]) {
    await mutateIdbRecord(page, mutation);
    await page.reload();
    await expect(page.locator('#efCount'), label).toContainText('แสดง 2 ระบบ จาก 2 · 3 หมู่บ้าน จาก 3');
    await expect(page.locator('#referenceStatus'), label).toHaveText('โหลดข้อมูลล่าสุดแล้ว');
    await expect(page.locator('body'), label).not.toContainText('TAMPERED_VILLAGE');
    await expect(page.locator('body'), label).not.toContainText('LEAKED');
    await expect.poll(async () => {
      const rec = await readIdbRecord(page);
      return rec && rec.schema === 1 && rec.policy === 'PUBLIC_ALLOWLIST_R5_1_V1' &&
        rec.data.villages[0].village_name === 'บ้านเผยแพร่ 01' &&
        !Object.hasOwn(rec.data.waterSystems[0], 'responsible_agency');
    }, { message: label }).toBe(true);
  }

  expect(harness.unexpected).toEqual([]);
  expect(harness.pageErrors).toEqual([]);
});

test('gracefully recovers when IndexedDB open or write fails and works under a subdirectory deployment path', async ({ page }) => {
  const harness = await installPublicCacheHarness(page, { basePath: '/Village_Watersupply' });

  await page.goto(`${origin}/Village_Watersupply/`);
  await expect(page.locator('#efCount')).toContainText('แสดง 2 ระบบ จาก 2 · 3 หมู่บ้าน จาก 3');
  await expect.poll(() => readIdbRecord(page)).not.toBeNull();

  await page.addInitScript(() => {
    if (window.__simulateQuota) {
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      };
    }
    if (window.__simulateBlockedOpen) {
      indexedDB.open = function () {
        throw new DOMException('IDB blocked', 'SecurityError');
      };
    }
  });

  await page.evaluate(() => { window.__simulateQuota = true; });
  await page.locator('#btnRefresh').click();
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  const intact = await readIdbRecord(page);
  expect(intact.counts).toEqual({ villages: 3, waterSystems: 2, waterSources: 2 });

  await page.addInitScript(() => { window.__simulateBlockedOpen = true; });
  await page.goto(`${origin}/Village_Watersupply/`);
  await expect(page.locator('#efCount')).toContainText('แสดง 2 ระบบ จาก 2 · 3 หมู่บ้าน จาก 3');

  expect(harness.unexpected).toEqual([]);
  expect(harness.pageErrors).toEqual([]);
});
