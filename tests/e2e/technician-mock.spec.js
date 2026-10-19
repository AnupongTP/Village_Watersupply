import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'http://village.test';
const observations = new WeakMap();
async function captureArchitecture(page, name) {
  const directory = process.env.VWS_ARCH_SCREENSHOTS;
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
}
async function captureParity(page,name,fullPage=false) {
  const directory=process.env.VWS_PARITY_SCREENSHOTS;
  if(!directory)return;
  fs.mkdirSync(directory,{recursive:true});
  await page.screenshot({path:path.join(directory,`${name}.png`),fullPage});
}
const token = `MGT-${'a'.repeat(64)}`;
const user = { username: 'synthetic-technician', displayName: 'Synthetic Technician', role: 'TECHNICIAN' };
const system = {
  system_id: 'QA-SYSTEM-1', village_id: 'QA-VILLAGE-1', system_name: 'Synthetic Water System',
  recordStatus: 'ACTIVE', publicVisible: true, publicSuppressionReasons: [],
  recordVersion: 'b'.repeat(64), processingGuard: { mutable: true },
  latitude: 19.2, longitude: 100.1, system_type: 'GROUNDWATER_SMALL',
  capacity_m3_hr: '',
  operational_status: 'WORKING', water_quantity: 'SUFFICIENT', drinking_water_quality: 'PASS',
  village: { village_name: 'Synthetic Village', district: 'จุน' }
};

function success(data = {}) { return { success: true, data }; }
function failure(code, message) { return { success: false, error: { code, message } }; }

async function installIsolatedTechnician(page, overrides = {}) {
  const calls = [];
  const blocked = [];
  const pageErrors = [];
  const consoleWarnings = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') consoleWarnings.push(message.text()); });
  observations.set(page, { calls, blocked, pageErrors, consoleWarnings });

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.hostname === 'script.google.com') {
      // The syntactically valid endpoint is synthetic; this route always fulfills it locally.
      expect(url.pathname).toBe('/macros/s/SYNTHETIC/exec');
      expect(request.method()).toBe('POST');
      const envelope = JSON.parse(request.postData() || '{}');
      expect(envelope.version).toBe(2);
      calls.push(envelope);
      const defaults = {
        'auth.login': success({ token, user }),
        'auth.me': success({ user }),
        'data.bootstrap': success({ user, permissions: [], featureFlags: { managementRead: true }, enumCatalog: {} }),
        'data.dashboard': success({ generatedAt: '2026-01-01T00:00:00Z', villages: [], waterSystems: [system], waterSources: [] }),
        'data.waterSystem': success({ system }),
        'auth.logout': success()
      };
      const configured = overrides[envelope.action] ?? defaults[envelope.action];
      const response = typeof configured === 'function' ? await configured(envelope) : configured;
      expect(response, `Unexpected Management action: ${envelope.action}`).toBeDefined();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    }

    if (url.origin !== origin) {
      // Map tiles and fonts are fulfilled locally. No request reaches these hosts.
      if (url.hostname === 'fonts.googleapis.com') {
        return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      }
      if (url.hostname === 'services.arcgisonline.com' || url.hostname.endsWith('.tile.openstreetmap.org')) {
        return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e8f0"/></svg>' });
      }
      blocked.push(url.hostname);
      return route.abort();
    }

    if (url.pathname === '/technician/assets/config.js') {
      return route.fulfill({
        status: 200, contentType: 'text/javascript',
        body: "window.VWS_MANAGEMENT_CONFIG={endpoint:'https://script.google.com/macros/s/SYNTHETIC/exec'};"
      });
    }

    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative.endsWith('/') ? `${relative}index.html` : relative);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: 'Not found' });
    }
    const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType, body: fs.readFileSync(file) });
  });

  return { calls, blocked, pageErrors, consoleWarnings };
}

test.afterEach(async ({ page }) => {
  const network = observations.get(page);
  expect(network).toBeDefined();
  expect(network.blocked.filter(host => host !== 'fonts.googleapis.com')).toEqual([]);
  expect(network.pageErrors).toEqual([]);
});

async function openLogin(page) {
  await page.goto(`${origin}/technician/`);
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#appView')).toBeHidden();
}

async function submitSyntheticLogin(page) {
  await page.locator('#loginUsername').fill('synthetic-technician');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test.describe(`Technician mocked ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('initializes with login form and no backend request', async ({ page }) => {
      const network = await installIsolatedTechnician(page);
      await openLogin(page);
      await expect(page.locator('#loginUsername')).toBeVisible();
      await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'password');
      expect(network.calls).toEqual([]);
      expect(network.pageErrors).toEqual([]);
      expect(network.blocked.every(host => host === 'fonts.googleapis.com')).toBe(true);
    });

    test('uses synthetic login and renders the authenticated read-only dataset', async ({ page }) => {
      const network = await installIsolatedTechnician(page);
      await openLogin(page);
      await submitSyntheticLogin(page);
      await expect(page.locator('#appView')).toBeVisible();
      await expect(page.locator('#currentUserName')).toHaveText(user.displayName);
      await expect(page.locator('#kpiSystems')).toHaveText('1');
      await expect(page.locator('#systemsTableBody')).toContainText(system.system_name);
      expect(network.calls.map(call => call.action)).toEqual(['auth.login', 'data.bootstrap', 'data.dashboard']);
      expect(network.calls[0].payload).toMatchObject({ username: user.username, password: 'synthetic-password' });
      expect(network.calls[1].payload.token).toBe(token);
      expect(network.calls[2].payload.token).toBe(token);
      expect(network.pageErrors).toEqual([]);
    });

    test('shows a mocked authentication failure without retaining a session', async ({ page }) => {
      const network = await installIsolatedTechnician(page, {
        'auth.login': failure('AUTH_INVALID', 'Synthetic credentials rejected')
      });
      await openLogin(page);
      await submitSyntheticLogin(page);
      await expect(page.locator('#loginError')).toHaveText('Synthetic credentials rejected');
      await expect(page.locator('#appView')).toBeHidden();
      expect(await page.evaluate(() => sessionStorage.getItem('vws_management_token_v2'))).toBeNull();
      expect(network.calls.map(call => call.action)).toEqual(['auth.login']);
      expect(network.pageErrors).toEqual([]);
    });
  });
}

test('loads a mocked system detail and logs out locally', async ({ page }) => {
  const network = await installIsolatedTechnician(page);
  await openLogin(page);
  await submitSyntheticLogin(page);
  await expect(page.locator('#appView')).toBeVisible();
  await openToolSection(page, 'systems');
  await page.locator('#systemsTableBody [data-action="view"]').first().click();
  await expect(page.locator('#systemDialog')).toBeVisible();
  await expect(page.locator('#systemDialogTitle')).toHaveText(system.system_name);
  await expect(page.locator('#systemDialogBody')).toContainText(system.system_id);
  expect(network.calls.find(call => call.action === 'data.waterSystem')?.payload.systemId).toBe(system.system_id);
  await page.locator('#systemDialog').evaluate(dialog => dialog.close());
  await page.locator('#logoutButton').click();
  await expect(page.locator('#loginView')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('vws_management_token_v2'))).toBeNull();
  expect(network.calls.at(-1).action).toBe('auth.logout');
  expect(network.pageErrors).toEqual([]);
});

test('handles a revoked synthetic session on resume', async ({ page }) => {
  const network = await installIsolatedTechnician(page, {
    'auth.me': failure('SESSION_REVOKED', 'Synthetic session revoked')
  });
  await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
  await openLogin(page);
  expect(await page.evaluate(() => sessionStorage.getItem('vws_management_token_v2'))).toBeNull();
  expect(network.calls.map(call => call.action)).toEqual(['auth.me']);
  expect(network.pageErrors).toEqual([]);
});

test('handles an invalid synthetic session on resume', async ({ page }) => {
  const network = await installIsolatedTechnician(page, { 'auth.me': failure('AUTH_INVALID', 'Synthetic session invalid') });
  await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
  await openLogin(page);
  expect(await page.evaluate(() => sessionStorage.getItem('vws_management_token_v2'))).toBeNull();
  expect(network.calls.map(call => call.action)).toEqual(['auth.me']);
});

test('handles a mocked dashboard read error and clears the session', async ({ page }) => {
  const network = await installIsolatedTechnician(page, {
    'data.dashboard': failure('READ_UNAVAILABLE', 'Synthetic read unavailable')
  });
  await openLogin(page);
  await submitSyntheticLogin(page);
  await expect(page.locator('#loginError')).toHaveText('Synthetic read unavailable');
  await expect(page.locator('#appView')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('vws_management_token_v2'))).toBeNull();
  expect(network.calls.map(call => call.action)).toEqual(['auth.login', 'data.bootstrap', 'data.dashboard']);
  expect(network.pageErrors).toEqual([]);
});

const editableSystem = {
  ...system, managementMutable: true, usage_type: '',
  usage_types_json: '["AGRICULTURE","DOMESTIC"]',
  quality_failure_categories_json: '{invalid json',
  shared_villages_json: '[{"village_id":"QA-VILLAGE-2"}]'
};
const managementUser = { ...user, role: 'ADMIN' };
function managementMocks(extra = {}) {
  return {
    'data.bootstrap': success({ user: managementUser, permissions: ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS'], enumCatalog: { usage_type: ['DOMESTIC', 'AGRICULTURE'] } }),
    'data.dashboard': success({ generatedAt: '2026-01-01T00:00:00Z', villages: [{ village_id: 'QA-VILLAGE-2', village_name: 'Synthetic Neighbor' }], waterSystems: [editableSystem], waterSources: [] }),
    'data.waterSystem': success({ system: editableSystem }),
    'data.updateWaterSystem': success({ system: editableSystem }),
    'data.deleteWaterSystem': success(),
    'technicians.list': success({ technicians: [{ userId: 'QA-TECH-1', username: 'synthetic-account', displayName: 'Synthetic Account', status: 'ACTIVE', recordVersion: 'v1' }] }),
    'technicians.create': success(), 'technicians.update': success(), 'technicians.disable': success(),
    'technicians.enable': success(), 'technicians.delete': success(), 'technicians.resetPassword': success(),
    'auth.changePassword': success(),
    ...extra
  };
}
async function openToolSection(page, name) {
  if (await page.locator('#technicianToolsMenu').isHidden()) await page.locator('#technicianToolsButton').click();
  await page.locator(`[data-tab="${name}"]`).click();
}

async function openManagement(page, overrides = {}, start = 'management') {
  const network = await installIsolatedTechnician(page, managementMocks(overrides));
  await openLogin(page);
  await submitSyntheticLogin(page);
  await expect(page.locator('#appView')).toBeVisible();
  if (start === 'management') await openToolSection(page, 'systems');
  return network;
}

test('Public-style Dashboard is continuous and tools open exclusive authenticated workspaces', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const network = await openManagement(page, {}, 'dashboard');
  await captureArchitecture(page, 'technician-1440-overview');
  const analytical = ['overview','map-section','areas','quality','system-structure','watchlist'];
  for (const id of analytical) await expect(page.locator(`#${id}`)).toBeVisible();
  for (const id of ['managementWorkspace','historyPanel','techniciansPanel']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expect(page.locator('#overview .kpi-card')).toHaveCount(4);
  await expect(page.locator('#kpiWithWaterworks')).toHaveText('ไม่พร้อมใช้');
  expect(await page.locator('.tabs a.section-link').count()).toBe(6);
  await page.locator('#filterSearch').fill('Synthetic');
  const reads = network.calls.filter(call => call.action === 'data.dashboard').length;
  await page.locator('a[href="#areas"]').click();
  await expect(page).toHaveURL(/#areas$/);
  await expect(page.locator('#areas')).toBeInViewport();
  await captureArchitecture(page, 'technician-1440-area');
  await expect(page.locator('#quality')).toBeVisible();
  await openToolSection(page, 'systems');
  await expect(page.locator('#managementWorkspace')).toBeVisible();
  await expect(page.locator('#dashboardWorkspace')).toBeHidden();
  await captureArchitecture(page, 'technician-1440-management');
  await page.goBack();
  await expect(page).toHaveURL(/#areas$/);
  await expect(page.locator('#areas')).toBeVisible();
  await expect(page.locator('#filterSearch')).toHaveValue('Synthetic');
  await page.goForward();
  await expect(page.locator('#managementWorkspace')).toBeVisible();
  await page.locator('#managementWorkspace [data-return-dashboard]').click();
  await expect(page.locator('#dashboardWorkspace')).toBeVisible();
  await expect(page.locator('#filterSearch')).toHaveValue('Synthetic');
  await expect(page.locator('#areas')).toBeInViewport();
  await openToolSection(page, 'history');
  await expect(page.locator('#historyPanel')).toBeVisible();
  await expect(page.locator('#managementWorkspace')).toBeHidden();
  await page.locator('#historyPanel [data-return-dashboard]').click();
  await expect(page.locator('#dashboardWorkspace')).toBeVisible();
  await expect(page.locator('#filterSearch')).toHaveValue('Synthetic');
  await openToolSection(page, 'technicians');
  await expect(page.locator('#techniciansPanel')).toBeVisible();
  await expect(page.locator('#historyPanel')).toBeHidden();
  await expect(page.locator('#techniciansTableBody')).toContainText('synthetic-account');
  await page.locator('#techniciansPanel [data-return-dashboard]').click();
  await expect(page.locator('#dashboardWorkspace')).toBeVisible();
  await expect(page.locator('#filterSearch')).toHaveValue('Synthetic');
  expect(network.calls.filter(call => call.action === 'data.dashboard')).toHaveLength(reads);
  expect(network.blocked).toEqual([]);
  expect(network.pageErrors).toEqual([]);
});

for (const width of [768, 390]) {
  test(`continuous Dashboard and exclusive tools remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const network = await openManagement(page, {}, 'dashboard');
    await captureArchitecture(page, `technician-${width}-overview`);
    await page.locator('a[href="#watchlist"]').click();
    await expect(page.locator('#watchlist')).toBeInViewport();
    await captureArchitecture(page, `technician-${width}-monitoring`);
    await expect(page.locator('#areas')).toBeVisible();
    await page.locator('#technicianToolsButton').click();
    await expect(page.locator('#technicianToolsButton')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#technicianToolsMenu')).toBeHidden();
    await page.locator('#technicianToolsButton').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#technicianToolsMenu')).toBeVisible();
    await captureArchitecture(page, `technician-${width}-tools`);
    await page.locator('a[href="#historyPanel"]').click();
    await expect(page.locator('#historyPanel')).toBeVisible();
    await expect(page.locator('#dashboardWorkspace')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(network.blocked).toEqual([]);
  });
}

for (const width of [1440,768,390]) {
  test(`visual acceptance states remain reachable at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:width===390?844:900});
    const network=await installIsolatedTechnician(page,managementMocks());
    await openLogin(page);
    await captureParity(page,`technician-${width}-login`);
    await submitSyntheticLogin(page);
    await expect(page.locator('#dashboardWorkspace')).toBeVisible();
    await captureParity(page,`technician-${width}-dashboard`,true);
    await openToolSection(page,'systems');
    await captureParity(page,`technician-${width}-management`);
    const list=width<768?'#systemsMobileList':'#systemsTableBody';
    await page.locator(`${list} [data-action="edit"]`).first().click();
    await expect(page.locator('#editDialog')).toBeVisible();
    await captureParity(page,`technician-${width}-edit`);
    await page.locator('#editDialog [data-dismiss-dialog]').first().click();
    await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
    await page.locator(`${list} [data-action="delete"]`).first().click();
    await expect(page.locator('#deleteDialog')).toBeVisible();
    await captureParity(page,`technician-${width}-delete`);
    await page.locator('#deleteDialog [data-dismiss-dialog]').first().click();
    await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
    await openToolSection(page,'history');
    await captureParity(page,`technician-${width}-history`);
    await openToolSection(page,'technicians');
    await expect(page.locator('#techniciansTableBody')).toContainText('synthetic-account');
    await captureParity(page,`technician-${width}-accounts`);
    expect(network.calls.filter(call=>/^(data\.(update|delete)|technicians\.(create|update|disable|enable|delete|resetPassword))/.test(call.action))).toEqual([]);
    expect(network.blocked).toEqual([]);
    expect(network.pageErrors).toEqual([]);
  });
}

test('tablet Management tables chain vertical wheel and retain horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const network = await openManagement(page);
  for (const [name, wrapper, row] of [
    ['systems', '.desktop-table-wrap', '#systemsTableBody tr'],
    ['technicians', '.technicians-desktop-table', '#techniciansTableBody tr']
  ]) {
    await openToolSection(page, name);
    if (name === 'technicians') await expect(page.locator(row)).toHaveCount(1);
    const table = page.locator(wrapper);
    await page.locator(row).first().hover();
    const canScroll = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1);
    if (canScroll) {
      const beforeY = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 300);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeY);
    } else {
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    }
    const dimensions = await table.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
    await table.hover();
    await page.mouse.wheel(350, 0);
    await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  }
  expect(network.blocked).toEqual([]);
  expect(network.pageErrors).toEqual([]);
});

test('saved session deep link waits for verification and rejects unauthorized account hash', async ({ page }) => {
  const pending = heldResponse(success({ user }));
  const network = await installIsolatedTechnician(page, { 'auth.me': pending.respond });
  await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
  await page.goto(`${origin}/technician/#areas`);
  await expect(page.locator('#busyOverlay')).toBeVisible();
  await captureArchitecture(page, 'technician-boot-1440');
  await expect(page.locator('#loginView')).toBeHidden();
  await expect(page.locator('#appView')).toBeHidden();
  pending.release();
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#areas')).toBeInViewport();
  await page.goto(`${origin}/technician/#techniciansPanel`);
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#techniciansPanel')).toBeHidden();
  await expect(page.locator('#techniciansTab')).toBeHidden();
  await expect(page).not.toHaveURL(/#techniciansPanel$/);
  expect(network.calls.some(call => call.action === 'technicians.list')).toBe(false);
  expect(network.blocked).toEqual([]);
});
async function openEditFromTable(page, mobile = false) {
  if (await page.locator('#managementWorkspace').isHidden()) await openToolSection(page, 'systems');
  await page.locator(`${mobile ? '#systemsMobileList' : '#systemsTableBody'} [data-action="edit"]`).first().click();
  await expect(page.locator('#editDialog')).toBeVisible();
}
function mutations(network) { return network.calls.filter(call => /^(data\.(update|delete)|technicians\.|auth\.changePassword)/.test(call.action)); }

async function expectCenteredDialog(page, selector) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  const { width, height } = page.viewportSize();
  expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(10);
  expect(Math.abs(box.y + box.height / 2 - height / 2)).toBeLessThanOrEqual(10);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test.describe(`Technician dialog geometry ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test('ordinary dialogs center and the detail drawer remains right aligned', async ({ page }) => {
      await openManagement(page);
      const mobile = viewport.width < 768;
      await openEditFromTable(page, mobile);
      const drawer = await page.locator('#systemDialog .drawer-panel').boundingBox();
      expect(Math.abs(drawer.x + drawer.width - viewport.width)).toBeLessThanOrEqual(2);
      await expectCenteredDialog(page, '#editDialog');
      await page.locator('#edit_system_name').fill('Changed synthetic name');
      await page.locator('#editDialog .modal-footer [data-dismiss-dialog]').click();
      await expectCenteredDialog(page, '#discardDialog');
      await expect(page.locator('#edit_system_name')).toHaveValue('Changed synthetic name');
      await page.locator('#continueEditingButton').click();
      await expect(page.locator('#editDialog')).toBeVisible();
      await page.locator('#editDialog .modal-footer [data-dismiss-dialog]').click();
      await page.locator('#confirmDiscardButton').click();
      await page.locator('#deleteSystemButton').click();
      await expectCenteredDialog(page, '#deleteDialog');
      await page.locator('#deleteDialog .modal-footer [data-dismiss-dialog]').click();
      await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
      if (viewport.width < 1200) {
        await page.locator('#mobileAccountButton').click();
        await page.locator('#mobileChangePasswordButton').click();
      } else await page.locator('#changePasswordButton').click();
      await expectCenteredDialog(page, '#passwordDialog');
      if (process.env.VWS_PHASE_D_SCREENSHOTS) {
        fs.mkdirSync(process.env.VWS_PHASE_D_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.VWS_PHASE_D_SCREENSHOTS, `phase-d-${viewport.name}-password.png`) });
      }
      await page.locator('#passwordCancelButton').click();
      await openToolSection(page, 'technicians');
      await expect(page.locator(mobile ? '#techniciansMobileList' : '#techniciansTableBody')).toContainText('synthetic-account');
      await page.locator('#createTechnicianButton').click();
      await expectCenteredDialog(page, '#technicianDialog');
      await page.locator('#technicianDialog [data-dismiss-dialog]').first().click();
      await page.locator(`${mobile ? '#techniciansMobileList' : '#techniciansTableBody'} [data-tech-action="disable"]`).first().click();
      await expectCenteredDialog(page, '#actionDialog');
    });
  });
}

const visibleMapSystem = { ...editableSystem, system_id: 'QA-MAP-VISIBLE', system_name: 'Visible Synthetic System', latitude: 19.2, longitude: 100.1, publicVisible: true };
const hiddenMapSystem = { ...editableSystem, system_id: 'QA-MAP-HIDDEN', system_name: 'Hidden Synthetic System', latitude: '19.3', longitude: '100.2', publicVisible: false, operational_status: 'NOT_WORKING' };
const missingMapSystem = { ...editableSystem, system_id: 'QA-MAP-MISSING', system_name: 'Missing Coordinate System', latitude: '', longitude: null };
const malformedMapSystem = { ...editableSystem, system_id: 'QA-MAP-MALFORMED', system_name: 'Malformed Coordinate System', latitude: 'not-a-number', longitude: '100.3' };
const outlierMapSystem = { ...editableSystem, system_id: 'QA-MAP-OUTLIER', system_name: 'Outlier Coordinate System', latitude: 9.218651, longitude: 99.832377 };
const mapSystems = [visibleMapSystem, hiddenMapSystem, missingMapSystem, malformedMapSystem, outlierMapSystem];
const mapDashboard = systems => success({ generatedAt: '2026-01-01T00:00:00Z', villages: [], waterSystems: systems, waterSources: [] });

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test.describe(`Technician map ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test('header navigation reaches implemented views without page overflow', async ({ page }) => {
      await openManagement(page, { 'data.dashboard': mapDashboard(mapSystems) });
      const header = await page.locator('#appHeader').boundingBox();
      const brand = await page.locator('.brand-inline').boundingBox();
      const actions = await page.locator('.topbar-actions').boundingBox();
      expect(brand.x + brand.width).toBeLessThanOrEqual(actions.x + 2);
      expect(header.x).toBeGreaterThanOrEqual(0);
      await page.locator('[data-tab="map"]').click();
      await expect(page.locator('[data-tab="map"]')).toHaveClass(/active/);
      await expect(page.locator('#map-section')).toBeVisible();
      const mapBox = await page.locator('#map-section').boundingBox();
      expect(mapBox.x).toBeGreaterThanOrEqual(0);
      expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(viewport.width + 1);
      await page.locator('#technicianMapFit').click();
      await openToolSection(page, 'systems');
      await expect(page.locator('#technicianManagementSection')).toBeVisible();
      await page.locator('[data-tab="overview"]').click();
      await expect(page.locator('#kpiSystems')).toHaveText('5');
      await openToolSection(page, 'history');
      await expect(page.locator('#historyPanel')).toBeVisible();
      await openToolSection(page, 'technicians');
      await expect(page.locator('#techniciansPanel')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
    test('maps visible and Public-hidden systems, synchronizes filters and opens authenticated detail', async ({ page }) => {
      const network = await openManagement(page, {
        'data.dashboard': mapDashboard(mapSystems),
        'data.waterSystem': envelope => success({ system: mapSystems.find(item => item.system_id === envelope.payload.systemId) })
      });
      await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(3);
      expect(await page.evaluate(() => window.VWSTechnicianMap.markerCount())).toBe(3);
      await expect(page.locator('#systemsTableBody tr[data-system-id]')).toHaveCount(5);
      expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-MAP-MISSING'))).toBeNull();
      expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-MAP-MALFORMED'))).toBeNull();
      expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-MAP-OUTLIER').lat)).toBeCloseTo(9.218651);
      expect(await page.evaluate(() => window.VWSTechnicianMap.coordinates({ latitude: '  ', longitude: '100.1' }))).toBeNull();
      expect(await page.evaluate(() => window.VWSTechnicianMap.coordinates({ latitude: 'Infinity', longitude: '100.1' }))).toBeNull();
      expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-MAP-HIDDEN').lat)).toBeCloseTo(19.3);
      await expect(page.locator('#technicianMapScope')).toContainText('รวมรายการที่ไม่แสดงใน Public');
      if (process.env.VWS_PHASE_D_SCREENSHOTS) {
        fs.mkdirSync(process.env.VWS_PHASE_D_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.VWS_PHASE_D_SCREENSHOTS, `phase-d-${viewport.name}-map.png`), fullPage: true });
      }
      await page.locator('[data-tab="map"]').click();
      await expect(page.locator('#technicianWaterMap')).toBeVisible();
      await page.locator('#technicianWaterMap [data-system-id="QA-MAP-HIDDEN"]').click();
      await expect(page.locator('.technician-map-popup')).toContainText('ไม่แสดงใน Public Dashboard');
      await expect(page.locator('.technician-map-popup')).toContainText('ใช้งานไม่ได้');
      await page.locator('[data-technician-map-detail="QA-MAP-HIDDEN"]').click();
      await expect(page.locator('#systemDialogTitle')).toHaveText(hiddenMapSystem.system_name);
      await expect(page.locator('#editSystemButton')).toBeEnabled();
      expect(network.calls.find(call => call.action === 'data.waterSystem')?.payload.systemId).toBe(hiddenMapSystem.system_id);
      await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
      await openToolSection(page, 'systems');
      if (viewport.width < 768) await page.locator('#filterToggleButton').click();
      await page.locator('#publicFilter').selectOption('HIDDEN');
      await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(3);
      await expect(page.locator('#resultCount')).toHaveText('1 รายการ');
      await page.locator('#clearFiltersButton').click();
      await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(3);
      await expect(page.locator('#resultCount')).toHaveText('5 รายการ');
      await expect(page.locator('#technicianMapScope')).toContainText('แสดงทุกระบบ');
      await page.locator('#searchInput').fill('Visible Synthetic System');
      await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(3);
      await expect(page.locator('#resultCount')).toHaveText('1 รายการ');
      await page.locator('[data-tab="overview"]').click();
      if (viewport.width < 768) await page.locator('#btnFilterToggle').click();
      await page.locator('#filterSearch').fill('Visible Synthetic System');
      await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(1);
      await expect(page.locator('#technicianMapScope')).toContainText('กรองตามรายการปัจจุบัน');
      expect(network.calls.filter(call => call.action === 'data.dashboard')).toHaveLength(1);
      expect(network.calls.filter(call => /^(data\.(update|delete)|technicians\.)/.test(call.action))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  });
}

test('Technician map refresh, update and physical deletion replace markers without duplicates', async ({ page }) => {
  let systems = [visibleMapSystem, hiddenMapSystem];
  const network = await openManagement(page, {
    'data.dashboard': () => mapDashboard(systems),
    'data.waterSystem': envelope => success({ system: systems.find(item => item.system_id === envelope.payload.systemId) }),
    'data.updateWaterSystem': () => {
      systems = systems.map(item => item.system_id === visibleMapSystem.system_id ? { ...item, latitude: 19.45, longitude: 100.35 } : item);
      return success({ system: systems[0] });
    },
    'data.deleteWaterSystem': () => { systems = systems.filter(item => item.system_id !== hiddenMapSystem.system_id); return success(); }
  });
  await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(2);
  await page.locator('#systemsTableBody [data-system-id="QA-MAP-VISIBLE"] [data-action="edit"]').click();
  await page.locator('#edit_system_name').fill('Updated Synthetic Name');
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(2);
  expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-MAP-VISIBLE').lat)).toBeCloseTo(19.45);
  expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-MAP-VISIBLE').lng)).toBeCloseTo(100.35);
  await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
  await page.locator('#systemsTableBody [data-system-id="QA-MAP-HIDDEN"] [data-action="delete"]').click();
  await page.locator('#deleteReason').fill('Synthetic removal');
  await page.locator('#deleteConfirmInput').fill(hiddenMapSystem.system_id);
  await page.locator('#confirmDeleteButton').click();
  await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(1);
  await expect(page.locator('#technicianWaterMap [data-system-id="QA-MAP-HIDDEN"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-MAP-HIDDEN'))).toBeNull();
  await expect(page.locator('#systemsTableBody tr[data-system-id]')).toHaveCount(1);
  for (let iteration = 0; iteration < 3; iteration++) {
    await page.locator('#refreshButton').click();
    await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(1);
  }
  expect(network.calls.filter(call => call.action === 'data.dashboard')).toHaveLength(6);
});

test('Technician map keyboard popup and restricted detail keep management actions guarded', async ({ page }) => {
  await installIsolatedTechnician(page, {
    'data.bootstrap': success({ user, permissions: [], featureFlags: { managementRead: true }, enumCatalog: {} }),
    'data.dashboard': mapDashboard([hiddenMapSystem]),
    'data.waterSystem': success({ system: hiddenMapSystem })
  });
  await openLogin(page);
  await submitSyntheticLogin(page);
  await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(1);
  const marker = page.locator('#technicianWaterMap [data-system-id="QA-MAP-HIDDEN"]');
  await marker.focus();
  await expect(marker).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.technician-map-popup')).toContainText('Hidden Synthetic System');
  const a11y = await new AxeBuilder({ page }).include('#map-section').analyze();
  expect(a11y.violations).toEqual([]);
  await page.locator('[data-technician-map-detail="QA-MAP-HIDDEN"]').click();
  await expect(page.locator('#systemDialog')).toBeVisible();
  await expect(page.locator('#editSystemButton')).toBeDisabled();
  await expect(page.locator('#deleteSystemButton')).toBeDisabled();
});

test('Technician map uses a synthetic browser location without an API mutation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success) { success({ coords: { latitude: 19.22, longitude: 100.12 } }); }
    } });
  });
  const network = await openManagement(page, { 'data.dashboard': mapDashboard([visibleMapSystem]) });
  await page.locator('[data-tab="map"]').click();
  await page.locator('#technicianMapLocate').click();
  await expect(page.locator('#technicianWaterMap .user-location-marker')).toHaveCount(1);
  await expect(page.locator('#technicianMapLocate')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#technicianMapLocate')).toContainText('ตำแหน่งฉัน');
  expect(network.calls.filter(call => call.action !== 'auth.login' && call.action !== 'data.bootstrap' && call.action !== 'data.dashboard')).toEqual([]);
});

test('later Technician detail selection wins over a stale response', async ({ page }) => {
  const first = heldResponse(success({ system: visibleMapSystem }));
  const second = heldResponse(success({ system: hiddenMapSystem }));
  await openManagement(page, {
    'data.dashboard': mapDashboard([visibleMapSystem, hiddenMapSystem]),
    'data.waterSystem': envelope => envelope.payload.systemId === visibleMapSystem.system_id ? first.respond() : second.respond()
  });
  await page.locator('#systemsTableBody [data-system-id="QA-MAP-VISIBLE"] [data-action="view"]').click();
  await expectBusyDialog(page, 'กำลังโหลดข้อมูลระบบ...');
  await page.locator('#systemsTableBody [data-system-id="QA-MAP-HIDDEN"] [data-action="view"]').evaluate(button => button.click());
  second.release();
  await expect(page.locator('#systemDialogTitle')).toHaveText(hiddenMapSystem.system_name);
  first.release();
  await expect(page.locator('#systemDialogTitle')).toHaveText(hiddenMapSystem.system_name);
  await expect(page.locator('#busyOverlay')).toBeHidden();
});

test('Technician map handles a synthetic 733-system dataset without duplicate markers', async ({ page }) => {
  test.setTimeout(60000);
  const manySystems = Array.from({ length: 733 }, (_, index) => ({
    ...editableSystem, system_id: `QA-LOAD-${index}`, system_name: `Synthetic System ${index}`,
    latitude: 18.85 + (index % 35) * .025, longitude: 99.55 + Math.floor(index / 35) * .035,
    publicVisible: index % 3 !== 0
  }));
  const network = await openManagement(page, { 'data.dashboard': mapDashboard(manySystems) });
  await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(733);
  const mapId = await page.locator('#technicianWaterMap').evaluate(element => element._leaflet_id);
  const redrawMilliseconds = await page.evaluate(systems => {
    const start = performance.now();
    window.VWSTechnicianMap.render(systems);
    return performance.now() - start;
  }, manySystems);
  const elapsed = await page.evaluate(() => {
    const start = performance.now();
    document.querySelector('#filterSearch').value = 'Synthetic System 1';
    document.querySelector('#filterSearch').dispatchEvent(new Event('input', { bubbles: true }));
    const filtered = window.VWSTechnicianMap.markerCount();
    document.querySelector('#btnClearFilters').click();
    return { milliseconds: performance.now() - start, filtered, restored: window.VWSTechnicianMap.markerCount() };
  });
  expect(elapsed.filtered).toBeGreaterThan(0);
  expect(elapsed.filtered).toBeLessThan(733);
  expect(elapsed.restored).toBe(733);
  expect(elapsed.milliseconds).toBeLessThan(5000);
  expect(redrawMilliseconds).toBeLessThan(5000);
  console.log(`Synthetic 733-system Leaflet redraw: ${redrawMilliseconds.toFixed(1)} ms; filter and reset: ${elapsed.milliseconds.toFixed(1)} ms`);
  await page.locator('#refreshButton').click();
  await expect(page.locator('#technicianWaterMap .water-system-marker')).toHaveCount(733);
  expect(await page.locator('#technicianWaterMap').evaluate(element => element._leaflet_id)).toBe(mapId);
  expect(network.calls.filter(call => call.action === 'data.dashboard')).toHaveLength(2);
});

function heldResponse(response = success()) {
  let release;
  const pending = new Promise(resolve => { release = () => resolve(response); });
  return { respond: () => pending, release };
}

async function expectBusyDialog(page, message) {
  await expect(page.locator('#busyOverlay')).toBeVisible();
  await expect(page.locator('#busyOverlay .swal2-popup')).toHaveCount(1);
  await expect(page.locator('#busyOverlay .swal2-title')).toHaveText(message);
  await expect(page.locator('#bootView')).toBeHidden();
  await expect(page.locator('.swal2-popup:visible')).toHaveCount(1);
  expect(await page.locator('#busyOverlay').evaluate(element => element.matches(':modal'))).toBe(true);
  const style = await page.locator('#busyOverlay .swal2-title').evaluate(element => getComputedStyle(element));
  expect(Number.parseFloat(style.fontSize)).toBeGreaterThanOrEqual(18);
}

async function spinnerFrames(page, selector) {
  return page.locator(selector).evaluate(async element => {
    const animation = element.getAnimations().find(item => item.effect?.getComputedTiming().iterations === Infinity);
    const first = { transform: getComputedStyle(element).transform, time: animation?.currentTime };
    await new Promise(resolve => setTimeout(resolve, 180));
    const second = { transform: getComputedStyle(element).transform, time: animation?.currentTime };
    return { first, second, animation: getComputedStyle(element).animationName };
  });
}

async function loadingGeometry(page, popupSelector) {
  return page.locator(popupSelector).evaluate(async popup => {
    await Promise.all(popup.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations === 1).map(animation => animation.finished));
    const box = element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
    const title = popup.querySelector('.swal2-title');
    const spinner = popup.querySelector('.swal2-loader');
    const p = box(popup), t = box(title), s = box(spinner);
    const spinnerStyle = getComputedStyle(spinner);
    return { popup: p, title: t, spinner: s, spinnerSize: { width: spinnerStyle.width, height: spinnerStyle.height }, titleSize: getComputedStyle(title).fontSize,
      titleLineHeight: getComputedStyle(title).lineHeight, popupLineHeight: getComputedStyle(popup).lineHeight,
      spinnerColor: spinnerStyle.borderTopColor, after: getComputedStyle(popup, '::after').content,
      centerX: p.x + p.width / 2 - innerWidth / 2, centerY: p.y + p.height / 2 - innerHeight / 2,
      spinnerCenterX: s.x + s.width / 2 - p.x - p.width / 2,
      gap: spinner.parentElement.getBoundingClientRect().y - t.y - t.height };
  });
}

for (const width of [1440, 768, 390]) {
  test(`actual Public SweetAlert loader matches Technician at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const network = await installIsolatedTechnician(page, { 'auth.login': heldResponse().respond });
    await page.route('**/assets/js/app.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('https://unpkg.com/**', route => route.fulfill({ contentType: route.request().url().endsWith('.css') ? 'text/css' : 'text/javascript', body: '' }));
    await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: route.request().url().includes('sweetalert2') ? fs.readFileSync(path.join(root, 'assets/vendor/sweetalert2/sweetalert2.all.min.js')) : '' }));
    await page.goto(origin);
    await page.evaluate(async () => { const { showLoading } = await import('/assets/js/ui.js'); showLoading('กำลังเข้าสู่ระบบ...'); });
    await expect(page.locator('body > .swal2-container .swal2-loader')).toBeVisible();
    const publicGeometry = await loadingGeometry(page, 'body > .swal2-container .swal2-popup');
    const directory = process.env.VWS_LOADING_SCREENSHOTS;
    if (directory) { fs.mkdirSync(directory, { recursive: true }); await page.screenshot({ path: path.join(directory, `public-loading-${width}.png`) }); }
    await openLogin(page);
    await submitSyntheticLogin(page);
    await expectBusyDialog(page, 'กำลังเข้าสู่ระบบ...');
    const technicianGeometry = await loadingGeometry(page, '#busyOverlay .swal2-popup');
    if (directory) await page.screenshot({ path: path.join(directory, `technician-loading-${width}.png`) });
    for (const key of ['width', 'height']) expect(Math.abs(publicGeometry.popup[key] - technicianGeometry.popup[key]), key).toBeLessThanOrEqual(2);
    expect(technicianGeometry.spinnerSize).toEqual(publicGeometry.spinnerSize);
    for (const key of ['centerX', 'centerY', 'spinnerCenterX', 'gap']) expect(Math.abs(publicGeometry[key] - technicianGeometry[key]), key).toBeLessThanOrEqual(2);
    expect(technicianGeometry.titleSize).toBe(publicGeometry.titleSize);
    expect(technicianGeometry.spinnerColor).toBe(publicGeometry.spinnerColor);
    expect(technicianGeometry.after).toBe('none');
    console.log(`Loading geometry ${width}px`, JSON.stringify({ public: publicGeometry, technician: technicianGeometry }));
    expect(network.blocked).toEqual([]);
    expect(network.consoleWarnings).toEqual([]);
  });
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test.describe(`Technician loading ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('session verification is singular, readable, animated and hides after success', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const hold = heldResponse(success({ user }));
      await installIsolatedTechnician(page, { 'auth.me': hold.respond });
      await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
      await page.goto(`${origin}/technician/`);
      await expect(page.locator('#bootView')).toBeHidden();
      await expect(page.locator('#loginView')).toBeHidden();
      await expect(page.locator('#busyOverlay')).toBeVisible();
      await expect(page.locator('#busyOverlay .swal2-popup:visible')).toHaveCount(1);
      await expect(page.locator('#busyOverlay .swal2-title')).toContainText('กำลัง');
      const frames = await spinnerFrames(page, '#busyOverlay .swal2-loader');
      expect(frames.animation).toBe('swal2-rotate-loading');
      expect(frames.second.time).toBeGreaterThan(frames.first.time);
      expect(frames.second.transform).not.toBe(frames.first.transform);
      const a11y = await new AxeBuilder({ page }).include('#busyOverlay').analyze();
      expect(a11y.violations).toEqual([]);
      hold.release();
      await expect(page.locator('#appView')).toBeVisible();
      await expect(page.locator('#bootView')).toBeHidden();
      await expect(page.locator('#busyOverlay')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('reduced motion keeps a static progress cue and retry remains usable', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const hold = heldResponse(failure('TEMPORARY', 'Synthetic verification interruption'));
      await installIsolatedTechnician(page, { 'auth.me': hold.respond });
      await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
      await page.goto(`${origin}/technician/`);
      await expect(page.locator('#busyOverlay')).toBeVisible();
      await expect(page.locator('#busyOverlay .swal2-title')).toContainText('กำลัง');
      const frames = await spinnerFrames(page, '#busyOverlay .swal2-loader');
      expect(frames.animation).toBe('none');
      expect(frames.second.transform).toBe(frames.first.transform);
      hold.release();
      await expect(page.locator('#retryResumeButton')).toBeVisible();
      await expect(page.locator('#bootView .boot-actions')).toBeHidden();
      await expect(page.locator('#loginView')).toBeHidden();
    });
  });
}

test('login busy dialog survives pending authentication and clears on failure', async ({ page }) => {
  const hold = heldResponse(failure('AUTH_INVALID', 'Synthetic credentials rejected'));
  await installIsolatedTechnician(page, { 'auth.login': hold.respond });
  await openLogin(page);
  await submitSyntheticLogin(page);
  await expectBusyDialog(page, 'กำลังเข้าสู่ระบบ...');
  await page.keyboard.press('Escape');
  await expect(page.locator('#busyOverlay')).toBeVisible();
  hold.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await expect(page.locator('#loginError')).toHaveText('Synthetic credentials rejected');
});

test('overlapping loading tokens retain the active Public popup until final cleanup', async ({ page }) => {
  const network = await installIsolatedTechnician(page);
  await openLogin(page);
  await page.evaluate(() => {
    window.firstLoading = window.VWSTechnicianUI.showLoading('กำลังโหลดข้อมูล...');
    window.loadingPopup = document.querySelector('#busyOverlay .swal2-popup');
    window.secondLoading = window.VWSTechnicianUI.showLoading('กำลังโหลดบัญชีช่าง...');
  });
  await expectBusyDialog(page, 'กำลังโหลดบัญชีช่าง...');
  await page.evaluate(() => window.VWSTechnicianUI.closeLoading(window.firstLoading));
  await expectBusyDialog(page, 'กำลังโหลดบัญชีช่าง...');
  expect(await page.evaluate(() => window.loadingPopup === document.querySelector('#busyOverlay .swal2-popup'))).toBe(true);
  await page.evaluate(() => window.VWSTechnicianUI.closeLoading(window.secondLoading));
  await expect(page.locator('#busyOverlay')).toBeHidden();
  expect(network.calls).toEqual([]);
});

test('reduced-motion busy dialog keeps a static cue and clears after successful login', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const hold = heldResponse(success({ token, user }));
  await installIsolatedTechnician(page, { 'auth.login': hold.respond });
  await openLogin(page);
  await submitSyntheticLogin(page);
  await expectBusyDialog(page, 'กำลังเข้าสู่ระบบ...');
  const frames = await spinnerFrames(page, '#busyOverlay .swal2-loader');
  expect(frames.animation).toBe('none');
  expect(frames.second.transform).toBe(frames.first.transform);
  expect(await page.locator('#busyOverlay .swal2-popup').evaluate(element => getComputedStyle(element, '::after').content)).toBe('none');
  const reducedDirectory = process.env.VWS_LOADING_SCREENSHOTS;
  if (reducedDirectory) { fs.mkdirSync(reducedDirectory, { recursive: true }); await page.screenshot({ path: path.join(reducedDirectory, 'technician-loading-reduced-390.png') }); }
  const a11y = await new AxeBuilder({ page }).include('#busyOverlay').analyze();
  expect(a11y.violations).toEqual([]);
  hold.release();
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#busyOverlay')).toBeHidden();
});

test('refresh, account listing, detail and history use the shared busy dialog', async ({ page }) => {
  const refresh = heldResponse(success({ generatedAt: '2026-01-01T00:00:00Z', villages: [], waterSystems: [editableSystem], waterSources: [] }));
  const list = heldResponse(managementMocks()['technicians.list']);
  const detail = heldResponse(success({ system: editableSystem }));
  const history = heldResponse(success({ history: [] }));
  let dashboardReads = 0;
  await openManagement(page, {
    'data.dashboard': () => ++dashboardReads === 1 ? managementMocks()['data.dashboard'] : refresh.respond(),
    'technicians.list': list.respond,
    'data.waterSystem': detail.respond,
    'data.entityHistory': history.respond
  });
  await page.locator('#refreshButton').click();
  await expectBusyDialog(page, 'กำลังรีเฟรชข้อมูล...');
  refresh.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await page.locator('#systemsTableBody [data-action="view"]').first().click();
  await expectBusyDialog(page, 'กำลังโหลดข้อมูลระบบ...');
  detail.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await expect(page.locator('#systemDialog')).toBeVisible();
  await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
  await openToolSection(page, 'technicians');
  await expectBusyDialog(page, 'กำลังโหลดบัญชีช่าง...');
  list.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await openToolSection(page, 'history');
  await page.locator('#historySystemId').fill(system.system_id);
  await page.locator('#historySearchButton').click();
  await expectBusyDialog(page, 'กำลังโหลดประวัติ...');
  history.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
});

test('edit, delete, account mutation and password loading remain above their dialogs', async ({ page }) => {
  const edit = heldResponse(success({ system: editableSystem }));
  const deleteHold = heldResponse(success());
  const account = heldResponse(success());
  const password = heldResponse(success());
  const network = await openManagement(page, {
    'data.updateWaterSystem': edit.respond,
    'data.deleteWaterSystem': deleteHold.respond,
    'technicians.create': account.respond,
    'auth.changePassword': password.respond
  });
  await openEditFromTable(page);
  await page.locator('#edit_service_agency').fill('Synthetic Agency');
  await page.locator('#saveEditButton').click();
  await expectBusyDialog(page, 'กำลังบันทึกการแก้ไข...');
  edit.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
  await page.locator('#systemsTableBody [data-action="delete"]').first().click();
  await expect(page.locator('#deleteDialog')).toBeVisible();
  await page.locator('#deleteReason').fill('Synthetic deletion reason');
  await page.locator('#deleteConfirmInput').fill(system.system_id);
  await page.locator('#confirmDeleteButton').click();
  await expectBusyDialog(page, 'กำลังลบระบบประปา...');
  deleteHold.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await openToolSection(page, 'technicians');
  await page.locator('#createTechnicianButton').click();
  await page.locator('#techUsername').fill('another-synthetic');
  await page.locator('#techDisplayName').fill('Another Synthetic');
  await page.locator('#techPassword').fill('synthetic-secret');
  await page.locator('#technicianForm button[type="submit"]').click();
  await expectBusyDialog(page, 'กำลังสร้างบัญชี...');
  account.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await page.locator('#changePasswordButton').click();
  await page.locator('#currentPassword').fill('synthetic-old');
  await page.locator('#newPassword').fill('synthetic-new');
  await page.locator('#confirmNewPassword').fill('synthetic-new');
  await page.locator('#passwordChangeSubmit').click();
  await expectBusyDialog(page, 'กำลังเปลี่ยนรหัสผ่าน...');
  password.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toHaveLength(1);
  expect(network.calls.filter(call => call.action === 'data.deleteWaterSystem')).toHaveLength(1);
});

test('account edit and action keep one animated dialog through nested list reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const reload = heldResponse(managementMocks()['technicians.list']);
  const action = heldResponse(success());
  let listCalls = 0;
  const network = await openManagement(page, {
    'technicians.list': () => ++listCalls === 1 ? managementMocks()['technicians.list'] : reload.respond(),
    'technicians.disable': action.respond
  });
  await openToolSection(page, 'technicians');
  await expect(page.locator('#techniciansTableBody')).toContainText('synthetic-account');
  await page.locator('#techniciansTableBody [data-tech-action="edit"]').first().click();
  await page.locator('#techDisplayName').fill('Updated Synthetic');
  await page.locator('#technicianForm button[type="submit"]').click();
  await expectBusyDialog(page, 'กำลังโหลดบัญชีช่าง...');
  const firstAnimationTime = await page.locator('#busyOverlay .swal2-loader').evaluate(element => element.getAnimations().find(item => item.effect?.getComputedTiming().iterations === Infinity)?.currentTime);
  const frames = await spinnerFrames(page, '#busyOverlay .swal2-loader');
  expect(frames.second.time).toBeGreaterThan(frames.first.time);
  expect(frames.first.time).toBeGreaterThanOrEqual(firstAnimationTime);
  const a11y = await new AxeBuilder({ page }).include('#busyOverlay').analyze();
  expect(a11y.violations).toEqual([]);
  reload.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await page.locator('#techniciansTableBody [data-tech-action="disable"]').first().click();
  await page.locator('#actionConfirmButton').click();
  await expectBusyDialog(page, 'กำลังดำเนินการบัญชี...');
  action.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'technicians.update')).toHaveLength(1);
  expect(network.calls.filter(call => call.action === 'technicians.disable')).toHaveLength(1);
});

const analyticsSystems = [
  { ...editableSystem, system_id: 'QA-ANALYTICS-1', village_id: 'QA-VILLAGE-1', system_name: 'Synthetic A', village: { village_name: 'Village One', district: 'จุน', subdistrict: 'A', local_authority: 'Authority A' }, utility_water_quality: 'PASS' },
  { ...editableSystem, system_id: 'QA-ANALYTICS-2', village_id: 'QA-VILLAGE-1', system_name: 'Synthetic B', village: { village_name: 'Village One', district: 'จุน', subdistrict: 'A', local_authority: 'Authority A' }, drinking_water_quality: 'FAIL', utility_water_quality: 'NO_DATA', water_quantity: 'INSUFFICIENT', publicVisible: false },
  { ...editableSystem, system_id: 'QA-ANALYTICS-3', village_id: 'QA-VILLAGE-2', system_name: 'Synthetic C', village: { village_name: 'Village Two', district: 'เมือง', subdistrict: 'B', local_authority: 'Authority B' }, system_type: 'FUTURE_SYNTHETIC_TYPE', drinking_water_quality: '', utility_water_quality: 'FAIL', latitude: '', longitude: '' }
];
const analyticsDataset = { generatedAt: '2026-01-01T00:00:00Z', villages: [
  { village_id: 'QA-VILLAGE-1', village_name: 'Village One', district: 'จุน', local_authority: 'Authority A', has_village_waterworks: true },
  { village_id: 'QA-VILLAGE-2', village_name: 'Village Two', district: 'เมือง', local_authority: 'Authority B', has_village_waterworks: false }
], waterSystems: analyticsSystems, waterSources: [{ source_id: 'QA-SOURCE-1', village_id: 'QA-VILLAGE-1' }] };

test('four Public-style charts cross-filter the authenticated Dashboard without Management mutations', async ({ page }) => {
  const network=await openManagement(page,{'data.dashboard':success(analyticsDataset)},'dashboard');
  for(const [canvas,index,control,value] of [
    ['districtChart',0,'filterDistrict','จุน'],
    ['qualityChart',1,'filterDrinkingWaterQuality','FAIL'],
    ['quantityChart',1,'filterWaterQuantity','INSUFFICIENT'],
    ['systemTypeChart',0,'filterSystemType','GROUNDWATER_SMALL']
  ]) {
    await page.locator(`#${canvas}`).scrollIntoViewIfNeeded();
    const clickPoint=async()=>page.locator(`#${canvas}`).evaluate((element,i)=>{
      const chart=Chart.getChart(element),point=chart.getDatasetMeta(0).data[i].getCenterPoint(),box=element.getBoundingClientRect();
      return {x:box.left+point.x,y:box.top+point.y};
    },index);
    let point=await clickPoint();
    await page.mouse.click(point.x,point.y);
    await expect(page.locator(`#${control}`)).toHaveValue(value);
    await page.waitForTimeout(250);
    point=await clickPoint();
    await page.mouse.click(point.x,point.y);
    await expect(page.locator(`#${control}`)).toHaveValue('');
  }
  expect(network.calls.filter(call=>/^(data\.(update|delete)|technicians\.)/.test(call.action))).toEqual([]);
  expect(network.blocked).toEqual([]);
  expect(network.pageErrors).toEqual([]);
});

test('global Dashboard filters cascade, keep their own state, and leave Management search unchanged', async ({ page }) => {
  const network=await openManagement(page,{'data.dashboard':success(analyticsDataset)},'dashboard');
  await page.locator('#filterDistrict').selectOption('จุน');
  await expect(page.locator('#filterLocalAuthority option')).toHaveCount(2);
  await expect(page.locator('#filterLocalAuthority')).toContainText('Authority A');
  await expect(page.locator('#filterLocalAuthority')).not.toContainText('Authority B');
  await page.locator('#filterLocalAuthority').selectOption('Authority A');
  await page.locator('#filterDrinkingWaterQuality').selectOption('FAIL');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expect(page.locator('#activeFilterChips [data-filter-remove]')).toHaveCount(3);
  await page.locator('#filterDistrict').selectOption('เมือง');
  await expect(page.locator('#filterLocalAuthority')).toHaveValue('');
  await expect(page.locator('#filterDrinkingWaterQuality')).toHaveValue('');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await openToolSection(page,'systems');
  await expect(page.locator('#searchInput')).toHaveValue('');
  await page.locator('#searchInput').fill('Synthetic B');
  await expect(page.locator('#resultCount')).toHaveText('1 รายการ');
  await page.locator('[data-tab="overview"]').click();
  await expect(page.locator('#filterDistrict')).toHaveValue('เมือง');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await page.locator('#btnClearFilters').click();
  await expect(page.locator('#kpiSystems')).toHaveText('3');
  await openToolSection(page,'systems');
  await expect(page.locator('#searchInput')).toHaveValue('Synthetic B');
  expect(network.calls.filter(call=>call.action==='data.dashboard')).toHaveLength(1);
  expect(network.blocked).toEqual([]);
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`Phase E analytics ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test('canonical KPI, monitoring, four charts and cross-filter use authenticated data', async ({ page }) => {
      const network = await openManagement(page, { 'data.dashboard': success(analyticsDataset),
        'data.waterSystem': envelope => success({ system: analyticsSystems.find(row => row.system_id === envelope.payload.systemId) }) }, 'dashboard');
      if (process.env.VWS_PHASE_E_SCREENSHOTS) {
        fs.mkdirSync(process.env.VWS_PHASE_E_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.VWS_PHASE_E_SCREENSHOTS, `phase-parity-${viewport.name}-overview.png`), fullPage: true });
      }
      await expect(page.locator('#overview .kpi-card')).toHaveCount(4);
      await expect(page.locator('#kpiVillages')).toHaveText('2');
      await expect(page.locator('#kpiWithWaterworks')).toHaveText('1');
      await expect(page.locator('#kpiWithoutWaterworks')).toHaveText('1');
      await expect(page.locator('#kpiSystems')).toHaveText('3');
      await expect(page.locator('#alertNotWorking')).toHaveText('0');
      await expect(page.locator('#alertInsufficient')).toHaveText('1');
      await expect(page.locator('#alertQualityFail')).toHaveText('1');
      await expect(page.locator('#watchlistTotal')).toHaveText('1');
      await expect(page.locator('#problemList .watch-card')).toHaveCount(1);
      for (const [tab, panel] of [['area','areas'],['quality','quality'],['types','system-structure'],['monitoring','watchlist']]) {
        await page.locator(`[data-tab="${tab}"]`).click();
        await expect(page.locator(`#${panel}`)).toBeVisible();
        if (process.env.VWS_PHASE_E_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.VWS_PHASE_E_SCREENSHOTS, `phase-parity-${viewport.name}-${tab}.png`), fullPage: true });
      }
      const chartState = await page.evaluate(() => ({ local: window.VWSTechnicianAnalytics.chartCount(), global: Object.keys(Chart.instances).length,
        district: Chart.getChart('districtChart').data.datasets.map(d => d.label),
        quality: Chart.getChart('qualityChart').config.type, quantity: Chart.getChart('quantityChart').config.type,
        type: Chart.getChart('systemTypeChart').options.indexAxis }));
      expect(chartState).toEqual({ local: 4, global: 4, district: ['หมู่บ้าน','ระบบประปา'], quality: 'doughnut', quantity: 'doughnut', type: 'y' });
      if (viewport.width < 768) await page.locator('#btnFilterToggle').click();
      await page.locator('#filterDistrict').selectOption('เมือง');
      await expect(page.locator('#kpiVillages')).toHaveText('1');
      await expect(page.locator('#kpiSystems')).toHaveText('1');
      await expect(page.locator('#watchlistTotal')).toHaveText('0');
      await openToolSection(page, 'systems');
      await expect(page.locator('#systemsTableBody tr[data-system-id]')).toHaveCount(3);
      await page.locator('[data-tab="overview"]').click();
      await expect(page.locator('#filterDistrict')).toHaveValue('เมือง');
      expect(network.calls.filter(call => call.action === 'data.dashboard')).toHaveLength(1);
      expect(network.blocked).toEqual([]);
      expect(network.pageErrors).toEqual([]);
    });

    test('search icon is inside the editable input without covering text', async ({ page }) => {
      await openManagement(page);
      if (viewport.width < 768) await page.locator('#filterToggleButton').click();
      const geometry = await page.locator('#searchInput').evaluate(input => {
        const box = input.getBoundingClientRect();
        const icon = input.parentElement.querySelector('svg, i').getBoundingClientRect();
        const padding = parseFloat(getComputedStyle(input).paddingLeft);
        return { iconLeft: icon.left, iconRight: icon.right, iconTop: icon.top, iconBottom: icon.bottom,
          left: box.left, right: box.right, top: box.top, bottom: box.bottom, textStart: box.left + padding };
      });
      expect(geometry.iconLeft).toBeGreaterThan(geometry.left);
      expect(geometry.iconRight).toBeLessThan(geometry.textStart);
      expect(geometry.iconTop).toBeGreaterThan(geometry.top);
      expect(geometry.iconBottom).toBeLessThan(geometry.bottom);
      await page.locator('#searchInput').fill('Synthetic Water');
      await expect(page.locator('#resultCount')).toHaveText('1 รายการ');
    });
  });
}

// Optional human review. The same fail-closed routes are installed before
// navigation; this case is absent from normal automated test registration.
if (process.env.VWS_MANUAL_ACCEPTANCE === '1') {
  test('interactive local Technician acceptance with synthetic Management responses', async ({ page }) => {
    test.setTimeout(0);
    const width = Number(process.env.VWS_ACCEPTANCE_WIDTH || 1440);
    if ([1440, 768, 390].includes(width)) await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await openManagement(page);
    await page.pause();
  });
}


test('coordinate edit uses archive-verified ranges, paired blank semantics and expectedVersion', async ({ page }) => {
  let row = { ...editableSystem, latitude: 19.2, longitude: 100.1 };
  const network = await openManagement(page, {
    'data.dashboard': () => success({ ...analyticsDataset, waterSystems: [row] }),
    'data.waterSystem': () => success({ system: row }),
    'data.updateWaterSystem': envelope => { row = { ...row, ...envelope.payload.request.patch }; return success({ system: row }); }
  });
  await openEditFromTable(page);
  await expect(page.locator('#edit_latitude')).toHaveValue('19.2');
  await expect(page.locator('#edit_longitude')).toHaveValue('100.1');
  await page.locator('#edit_latitude').fill('91');
  await page.locator('#saveEditButton').click();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toHaveLength(0);
  await page.locator('#edit_latitude').fill('19.4');
  await page.locator('#edit_longitude').fill('100.3');
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const update = network.calls.find(call => call.action === 'data.updateWaterSystem');
  expect(update.payload.request.expectedVersion).toBe(editableSystem.recordVersion);
  expect(update.payload.request.patch).toMatchObject({ latitude: 19.4, longitude: 100.3 });
  expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-SYSTEM-1').lat)).toBeCloseTo(19.4);
  await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
  await openEditFromTable(page);
  await page.locator('#edit_latitude').fill('');
  await page.locator('#saveEditButton').click();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toHaveLength(1);
  await expect(page.locator('#editError')).toContainText('ทั้งสองค่า');
  await page.locator('#edit_longitude').fill('');
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem').at(-1).payload.request.patch).toMatchObject({ latitude: '', longitude: '' });
  expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-SYSTEM-1'))).toBeNull();
  await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
  await openEditFromTable(page);
  await page.locator('#edit_latitude').fill('19.2');
  await page.locator('#edit_longitude').fill('100.1');
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem').at(-1).payload.request.patch).toMatchObject({ latitude: 19.2, longitude: 100.1 });
  expect(await page.evaluate(() => window.VWSTechnicianMap.point('QA-SYSTEM-1').lat)).toBeCloseTo(19.2);
});

test('legacy shared-village name is displayed and serialized without changing the structured selection', async ({ page }) => {
  const row = { ...editableSystem, shared_village_name: 'Synthetic Neighbor Name' };
  const network = await openManagement(page, {
    'data.dashboard': success({ ...analyticsDataset, waterSystems: [row] }),
    'data.waterSystem': success({ system: row })
  });
  await openEditFromTable(page);
  await expect(page.locator('#edit_shared_village_name')).toHaveValue('Synthetic Neighbor Name');
  await page.locator('#edit_shared_village_name').fill('Updated Synthetic Neighbor');
  await page.locator('#saveEditButton').click();
  const patch = network.calls.find(call => call.action === 'data.updateWaterSystem')?.payload.request.patch;
  expect(patch).toEqual({ shared_village_name: 'Updated Synthetic Neighbor' });
});

test('overlapping read operations keep one SweetAlert until the final operation finishes', async ({ page }) => {
  const refresh = heldResponse(success(analyticsDataset));
  const history = heldResponse(success({ history: [] }));
  let reads = 0;
  await openManagement(page, {
    'data.dashboard': () => ++reads === 1 ? success(analyticsDataset) : refresh.respond(),
    'data.entityHistory': history.respond
  });
  await page.locator('#refreshButton').click();
  await expectBusyDialog(page, 'กำลังรีเฟรชข้อมูล...');
  await page.locator('[data-tab="history"]').evaluate(button => button.click());
  await page.locator('#historySystemId').evaluate(input => { input.value = 'QA-ANALYTICS-1'; });
  await page.locator('#historySearchButton').evaluate(button => button.click());
  await expectBusyDialog(page, 'กำลังโหลดประวัติ...');
  refresh.release();
  await expectBusyDialog(page, 'กำลังโหลดประวัติ...');
  history.release();
  await expect(page.locator('#busyOverlay')).toBeHidden();
});

for (const width of [1440, 390]) {
  test(`Phase E analytics axe check at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openManagement(page, { 'data.dashboard': success(analyticsDataset) });
    for (const [tab, panel] of [['area','areas'],['quality','quality'],['types','system-structure'],['monitoring','watchlist']]) {
      await page.locator(`[data-tab="${tab}"]`).click();
      const result = await new AxeBuilder({ page }).include(`#${panel}`).analyze();
      expect(result.violations, `${tab} at ${width}px`).toEqual([]);
    }
  });
}

test('failed refresh cleans up loading dialog and remains usable', async ({ page }) => {
  let reads = 0;
  await openManagement(page, {
    'data.dashboard': () => ++reads === 1 ? managementMocks()['data.dashboard'] : failure('READ_UNAVAILABLE', 'Synthetic refresh failure')
  });
  await page.locator('#refreshButton').click();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#refreshButton')).toBeEnabled();
});

test('session expiration clears pending busy dialog and returns to login', async ({ page }) => {
  const hold = heldResponse(failure('SESSION_EXPIRED', 'Synthetic session expired'));
  let reads = 0;
  await openManagement(page, {
    'data.dashboard': () => ++reads === 1 ? managementMocks()['data.dashboard'] : hold.respond()
  });
  await page.locator('#refreshButton').click();
  await expectBusyDialog(page, 'กำลังรีเฟรชข้อมูล...');
  hold.release();
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('vws_management_token_v2'))).toBeNull();
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test.describe(`Technician safety ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    const mobile = viewport.name === 'mobile';

    test('pristine X and Cancel dismiss edit without mutation and retain detail', async ({ page }) => {
      const network = await openManagement(page);
      await openEditFromTable(page, mobile);
      expect(await page.locator('#edit_usage_type').inputValue()).toBe('');
      await page.locator('#editDialog .modal-header [data-dismiss-dialog]').click();
      await expect(page.locator('#editDialog')).toBeHidden();
      await expect(page.locator('#systemDialog')).toBeVisible();
      await page.locator('#editSystemButton').click();
      await page.locator('#editDialog .modal-footer [data-dismiss-dialog]').click();
      await expect(page.locator('#editDialog')).toBeHidden();
      expect(mutations(network)).toEqual([]);
    });

    test('dirty X, Cancel and Escape require discard; continue preserves values', async ({ page }) => {
      const network = await openManagement(page);
      await openEditFromTable(page, mobile);
      await page.locator('#edit_system_name').fill('Changed synthetic name');
      for (const dismiss of ['#editDialog .modal-header [data-dismiss-dialog]', '#editDialog .modal-footer [data-dismiss-dialog]']) {
        await page.locator(dismiss).click();
        await expect(page.locator('#discardDialog')).toBeVisible();
        await page.locator('#continueEditingButton').click();
        await expect(page.locator('#edit_system_name')).toHaveValue('Changed synthetic name');
      }
      await page.keyboard.press('Escape');
      await expect(page.locator('#discardDialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#discardDialog')).toBeHidden();
      await expect(page.locator('#edit_system_name')).toHaveValue('Changed synthetic name');
      await page.keyboard.press('Escape');
      await expect(page.locator('#discardDialog')).toBeVisible();
      await page.locator('#confirmDiscardButton').click();
      await expect(page.locator('#editDialog')).toBeHidden();
      await expect(page.locator('#systemDialog')).toBeVisible();
      expect(mutations(network)).toEqual([]);
    });

    test('explicit Save sends exactly one patch and untouched structured fields stay untouched', async ({ page }) => {
      const network = await openManagement(page);
      await openEditFromTable(page, mobile);
      await page.locator('#edit_beneficiaries').fill('123');
      await page.locator('#saveEditButton').click();
      await expect(page.locator('#editDialog')).toBeHidden();
      const updates = network.calls.filter(call => call.action === 'data.updateWaterSystem');
      expect(updates).toHaveLength(1);
      expect(updates[0].payload.request).toMatchObject({ systemId: system.system_id, expectedVersion: system.recordVersion, patch: { beneficiaries: 123 } });
      expect(updates[0].payload.request.patch).toEqual({ beneficiaries: 123 });
    });
  });
}

test('delete X and Cancel never delete after confirmation; explicit Delete validates ID', async ({ page }) => {
  const network = await openManagement(page);
  await page.locator('#systemsTableBody [data-action="delete"]').click();
  await expect(page.locator('#deleteDialog')).toBeVisible();
  await page.locator('#deleteReason').fill('Synthetic reason');
  await page.locator('#deleteConfirmInput').fill(system.system_id);
  await page.locator('#deleteDialog .modal-header [data-dismiss-dialog]').click();
  await expect(page.locator('#deleteDialog')).toBeHidden();
  await page.locator('#deleteSystemButton').click();
  await page.locator('#deleteReason').fill('Synthetic reason');
  await page.locator('#deleteConfirmInput').fill(system.system_id);
  await page.locator('#deleteDialog .modal-footer [data-dismiss-dialog]').click();
  await expect(page.locator('#deleteDialog')).toBeHidden();
  expect(mutations(network)).toEqual([]);
  await page.locator('#deleteSystemButton').click();
  await page.locator('#deleteReason').fill('Synthetic reason');
  await page.locator('#deleteConfirmInput').fill('wrong-id');
  await page.locator('#confirmDeleteButton').click();
  await expect(page.locator('#deleteError')).not.toBeEmpty();
  expect(mutations(network)).toEqual([]);
  await page.locator('#deleteConfirmInput').fill(system.system_id);
  await page.locator('#confirmDeleteButton').click();
  await expect(page.locator('#deleteDialog')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'data.deleteWaterSystem')).toHaveLength(1);
});

test('account and password dialog dismissal never dispatches mutations', async ({ page }) => {
  const network = await openManagement(page);
  await openToolSection(page, 'technicians');
  await expect(page.locator('#techniciansTableBody')).toContainText('synthetic-account');
  await page.locator('#createTechnicianButton').click();
  await page.locator('#techUsername').fill('new-synthetic');
  await page.locator('#techDisplayName').fill('New Synthetic');
  await page.locator('#techPassword').fill('synthetic-secret');
  await page.locator('#technicianDialog .modal-header [data-dismiss-dialog]').click();
  await expect(page.locator('#technicianDialog')).toBeHidden();
  await page.locator('#techniciansTableBody [data-tech-action="edit"]').click();
  await page.locator('#technicianDialog .modal-footer [data-dismiss-dialog]').click();
  await page.locator('#techniciansTableBody [data-tech-action="disable"]').click();
  await page.locator('#actionDialog .modal-header [data-dismiss-dialog]').click();
  await page.locator('#techniciansTableBody [data-tech-action="delete"]').click();
  await page.locator('#actionReason').fill('Synthetic reason');
  await page.locator('#actionDialog .modal-footer [data-dismiss-dialog]').click();
  await page.locator('#changePasswordButton').click();
  await page.locator('#currentPassword').fill('synthetic-old');
  await page.locator('#newPassword').fill('synthetic-new');
  await page.locator('#confirmNewPassword').fill('synthetic-new');
  await page.locator('#passwordCloseButton').click();
  await page.locator('#changePasswordButton').click();
  await page.locator('#passwordCancelButton').click();
  expect(mutations(network)).toEqual([expect.objectContaining({ action: 'technicians.list' })]);
});

test('forced password change cannot be dismissed with Escape or backdrop', async ({ page }) => {
  const forced = { ...managementUser, mustChangePassword: true };
  const network = await installIsolatedTechnician(page, managementMocks({ 'auth.login': success({ token, user: forced }) }));
  await openLogin(page); await submitSyntheticLogin(page);
  await expect(page.locator('#passwordDialog')).toBeVisible();
  await expect(page.locator('#passwordCloseButton')).toBeHidden();
  await expect(page.locator('#passwordCancelButton')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#passwordDialog')).toBeVisible();
  await page.locator('#passwordDialog').click({ position: { x: 1, y: 1 }, force: true });
  await expect(page.locator('#passwordDialog')).toBeVisible();
  expect(network.calls.map(call => call.action)).toEqual(['auth.login']);
});

test('restricted role cannot open edit or delete from desktop or mobile actions', async ({ page }) => {
  const network = await openManagement(page, { 'data.bootstrap': success({ user, permissions: [], enumCatalog: {} }) });
  for (const parent of ['#systemsTableBody', '#systemsMobileList']) {
    await expect(page.locator(`${parent} [data-action="edit"]`)).toBeDisabled();
    await expect(page.locator(`${parent} [data-action="delete"]`)).toBeDisabled();
  }
  await page.locator('#systemsTableBody [data-action="view"]').click();
  await expect(page.locator('#editSystemButton')).toBeDisabled();
  await expect(page.locator('#deleteSystemButton')).toBeDisabled();
  expect(network.calls.filter(call => /^(data\.update|data\.delete)/.test(call.action))).toEqual([]);
});

test('saved valid session shows boot state before validation, never login flash', async ({ page }) => {
  let release; const hold = new Promise(resolve => { release = resolve; });
  const network = await installIsolatedTechnician(page, managementMocks({ 'auth.me': async () => { await hold; return success({ user: managementUser }); } }));
  await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
  await page.goto(`${origin}/technician/`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#busyOverlay')).toBeVisible();
  await expect(page.locator('#loginView')).toBeHidden();
  await expect(page.locator('#appView')).toBeHidden();
  release();
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#loginView')).toBeHidden();
  expect(network.calls.map(call => call.action)).toEqual(['auth.me', 'data.bootstrap', 'data.dashboard']);
});

for (const width of [1440, 768, 390]) test(`saved session hides login before deferred application script executes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  let releaseScript; const holdScript = new Promise(resolve => { releaseScript = resolve; });
  const holdMe = heldResponse(success({ user: managementUser }));
  const network = await installIsolatedTechnician(page, managementMocks({ 'auth.me': holdMe.respond }));
  await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
  await page.route('**/technician/assets/technician.js', async route => { await holdScript; await route.fallback(); });
  await page.goto(`${origin}/technician/`, { waitUntil: 'commit' });
  await expect(page.locator('#bootView')).toBeVisible();
  const directory = process.env.VWS_LOADING_SCREENSHOTS;
  await expect(page.locator('#loginView')).toBeHidden();
  await expect(page.locator('#appView')).toBeHidden();
  expect(network.calls).toEqual([]);
  const fallback = await loadingGeometry(page, '#bootView .swal2-popup');
  if (directory) { fs.mkdirSync(directory, { recursive: true }); await page.screenshot({ path: path.join(directory, `technician-first-paint-${width}.png`) }); }
  releaseScript();
  await expect(page.locator('#busyOverlay')).toBeVisible();
  await expect(page.locator('#bootView')).toBeHidden();
  const sweet = await loadingGeometry(page, '#busyOverlay .swal2-popup');
  if (directory) await page.screenshot({ path: path.join(directory, `technician-session-${width}.png`) });
  for (const key of ['width', 'height']) expect(Math.abs(fallback.popup[key] - sweet.popup[key]), key).toBeLessThanOrEqual(2);
  for (const key of ['centerX', 'centerY', 'gap']) expect(Math.abs(fallback[key] - sweet[key]), key).toBeLessThanOrEqual(2);
  expect(fallback.titleSize).toBe(sweet.titleSize);
  expect(fallback.spinnerColor).toBe(sweet.spinnerColor);
  console.log(`First-paint/SweetAlert geometry ${width}px`, JSON.stringify({ fallback, sweet }));
  holdMe.release();
  await expect(page.locator('#appView')).toBeVisible();
  expect(network.consoleWarnings).toEqual([]);
});

test('temporary resume failure retains token but never reveals dashboard', async ({ page }) => {
  const network = await installIsolatedTechnician(page, managementMocks({ 'auth.me': failure('READ_UNAVAILABLE', 'Synthetic temporary failure') }));
  await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
  await page.goto(`${origin}/technician/`);
  await expect(page.locator('#retryResumeButton')).toBeVisible();
  await expect(page.locator('#loginView')).toBeHidden();
  await expect(page.locator('#appView')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('vws_management_token_v2'))).toBe(token);
  expect(network.calls.map(call => call.action)).toEqual(['auth.me']);
});

test('logout prevents authenticated resume on refresh', async ({ page }) => {
  const network = await openManagement(page);
  await page.locator('#logoutButton').click();
  await expect(page.locator('#loginView')).toBeVisible();
  await page.reload();
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#bootView')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'auth.me')).toEqual([]);
});

test('touched then restored array remains pristine; invalid untouched JSON is preserved', async ({ page }) => {
  const network = await openManagement(page);
  await openEditFromTable(page);
  const domestic = page.locator('input[name="usage_types_json"][value="DOMESTIC"]');
  await domestic.uncheck();
  await domestic.check();
  await page.locator('#editDialog .modal-footer [data-dismiss-dialog]').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toEqual([]);
  await page.locator('#editSystemButton').click();
  await page.locator('#edit_service_agency').fill('Synthetic Agency');
  await page.locator('#saveEditButton').click();
  const patch = network.calls.find(call => call.action === 'data.updateWaterSystem').payload.request.patch;
  expect(patch).toEqual({ service_agency: 'Synthetic Agency' });
});

test('explicit account create and password change each dispatch once', async ({ page }) => {
  const network = await openManagement(page);
  await openToolSection(page, 'technicians');
  await expect(page.locator('#techniciansTableBody')).toContainText('synthetic-account');
  await page.locator('#createTechnicianButton').click();
  await page.locator('#techUsername').fill('new-synthetic');
  await page.locator('#techDisplayName').fill('New Synthetic');
  await page.locator('#techPassword').fill('synthetic-secret');
  await page.locator('#technicianForm button[type="submit"]').click();
  await expect(page.locator('#technicianDialog')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'technicians.create')).toHaveLength(1);
  await page.locator('#changePasswordButton').click();
  await page.locator('#currentPassword').fill('synthetic-old');
  await page.locator('#newPassword').fill('synthetic-new');
  await page.locator('#confirmNewPassword').fill('synthetic-new');
  await page.locator('#passwordChangeSubmit').click();
  await expect(page.locator('#passwordDialog')).toBeHidden();
  expect(network.calls.filter(call => call.action === 'auth.changePassword')).toHaveLength(1);
});

test('second edit submission is ignored while first mutation is pending', async ({ page }) => {
  let release; const hold = new Promise(resolve => { release = resolve; });
  const network = await openManagement(page, {
    'data.updateWaterSystem': async () => { await hold; return success({ system: editableSystem }); }
  });
  await openEditFromTable(page);
  await page.locator('#edit_service_agency').fill('Synthetic Agency');
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#saveEditButton')).toBeDisabled();
  await page.locator('#editForm').evaluate(form => form.requestSubmit());
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toHaveLength(1);
  release();
  await expect(page.locator('#editDialog')).toBeHidden();
});

test('mocked forbidden update leaves edit open with error and no local record change', async ({ page }) => {
  const network = await openManagement(page, {
    'data.updateWaterSystem': failure('FORBIDDEN', 'Synthetic permission denied')
  });
  await openEditFromTable(page);
  await page.locator('#edit_system_name').fill('Unauthorized synthetic name');
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#editError')).toHaveText('Synthetic permission denied');
  await expect(page.locator('#editDialog')).toBeVisible();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toHaveLength(1);
  await page.locator('#editDialog .modal-footer [data-dismiss-dialog]').click();
  await page.locator('#confirmDiscardButton').click();
  await expect(page.locator('#systemDialogTitle')).toHaveText(system.system_name);
});

test('temporary resume failure can retry validation without another login', async ({ page }) => {
  let attempt = 0;
  const network = await installIsolatedTechnician(page, managementMocks({
    'auth.me': () => ++attempt === 1 ? failure('READ_UNAVAILABLE', 'Synthetic temporary failure') : success({ user: managementUser })
  }));
  await page.addInitScript(value => sessionStorage.setItem('vws_management_token_v2', value), token);
  await page.goto(`${origin}/technician/`);
  await expect(page.locator('#retryResumeButton')).toBeVisible();
  await page.locator('#retryResumeButton').click();
  await expect(page.locator('#appView')).toBeVisible();
  expect(network.calls.map(call => call.action)).toEqual(['auth.me', 'auth.me', 'data.bootstrap', 'data.dashboard']);
});

test('Enter in a field does not submit; tablet dialogs remain within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const network = await openManagement(page);
  await openEditFromTable(page);
  await page.locator('#edit_system_name').fill('Synthetic changed name');
  await page.locator('#edit_system_name').press('Enter');
  await expect(page.locator('#editDialog')).toBeVisible();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toEqual([]);
  const bounds = await page.locator('#editDialog').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(768);
  await page.locator('#editDialog .modal-header [data-dismiss-dialog]').click();
  await expect(page.locator('#discardDialog')).toBeVisible();
  await page.locator('#confirmDiscardButton').click();
});

test('Phase B renders every supported field with visible controls and associated names', async ({ page }) => {
  const network = await openManagement(page);
  await openEditFromTable(page);
  await expect(page.locator('.edit-section')).toHaveCount(7);
  await expect(page.locator('#editFields [data-field]')).toHaveCount(39);
  for (const key of ['beneficiaries', 'monthly_production_cost', 'monthly_service_revenue', 'water_tariff', 'service_agency']) {
    const field = page.locator(`#edit_${key}`);
    await expect(field).toBeVisible();
    expect(await field.evaluate(el => el.labels?.[0]?.textContent?.trim())).toBeTruthy();
    const styles = await field.evaluate(el => ({ border: getComputedStyle(el).borderTopWidth, height: el.getBoundingClientRect().height, font: parseFloat(getComputedStyle(el).fontSize) }));
    expect(parseFloat(styles.border)).toBeGreaterThanOrEqual(1);
    expect(styles.height).toBeGreaterThanOrEqual(44);
    expect(styles.font).toBeGreaterThanOrEqual(14);
  }
  await expect(page.locator('#edit_usage_type')).toHaveValue('');
  await expect(page.locator('#edit_shared_villages_json input:checked')).toHaveCount(1);
  await expect(page.locator('[data-field="quality_failure_categories_json"]')).toContainText('ข้อมูลเดิมอ่านไม่ได้');
  expect(mutations(network)).toEqual([]);
});

test('Phase B service values serialize exactly and shared villages support touch selection', async ({ page }) => {
  const network = await openManagement(page);
  await openEditFromTable(page);
  for (const [key, value] of Object.entries({ beneficiaries: '125', monthly_production_cost: '1300.5', monthly_service_revenue: '900', water_tariff: '9.25', service_agency: 'หน่วยงานใหม่' })) await page.locator(`#edit_${key}`).fill(value);
  await page.locator('#edit_shared_villages_json input').uncheck();
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const updates = network.calls.filter(call => call.action === 'data.updateWaterSystem');
  expect(updates).toHaveLength(1);
  expect(updates[0].payload.request.patch).toEqual({ beneficiaries: 125, monthly_production_cost: 1300.5, monthly_service_revenue: 900, water_tariff: 9.25, service_agency: 'หน่วยงานใหม่', shared_villages_json: [] });
});

test('Phase B rejects invalid numeric values and preserves unknown array values', async ({ page }) => {
  const unknownSystem = { ...editableSystem, usage_types_json: '["DOMESTIC","LEGACY_CODE"]', quality_failure_categories_json: '["LEGACY_QUALITY"]' };
  const network = await openManagement(page, { 'data.waterSystem': success({ system: unknownSystem }) });
  await openEditFromTable(page);
  await expect(page.locator('input[name="usage_types_json"][value="LEGACY_CODE"]')).toBeChecked();
  await expect(page.locator('input[name="quality_failure_categories_json"][value="LEGACY_QUALITY"]')).toBeChecked();
  await page.locator('#edit_beneficiaries').fill('-1');
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#editDialog')).toBeVisible();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toEqual([]);
  await page.locator('#edit_beneficiaries').fill('12');
  await page.locator('input[name="usage_types_json"][value="AGRICULTURE"]').check();
  await page.locator('#saveEditButton').click();
  const patch = network.calls.find(call => call.action === 'data.updateWaterSystem').payload.request.patch;
  expect(JSON.parse(patch.usage_types_json).sort()).toEqual(['AGRICULTURE', 'DOMESTIC', 'LEGACY_CODE']);
  expect(patch).not.toHaveProperty('quality_failure_categories_json');
});

test('Phase B mobile account actions and responsive layout are accessible without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const network = await openManagement(page);
  await openToolSection(page, 'technicians');
  await expect(page.locator('#techniciansMobileList')).toBeVisible();
  await page.locator('#techniciansMobileList [data-tech-action="edit"]').click();
  await expect(page.locator('#technicianDialog')).toBeVisible();
  await page.locator('#technicianDialog [data-dismiss-dialog]').first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(network.calls.filter(call => call.action.startsWith('technicians.') && call.action !== 'technicians.list')).toEqual([]);
});

test('Phase B preserves current values and keyboard focus across a nested discard decision', async ({ page }) => {
  const network = await openManagement(page, { 'data.waterSystem': success({ system: { ...editableSystem, water_source_detail: 'รายละเอียดเดิม', transfer_document_url: 'https://example.test/document', available_months_json: '["JAN","FEB"]' } }) });
  await openEditFromTable(page);
  await expect(page.locator('#edit_water_source_detail')).toHaveValue('รายละเอียดเดิม');
  await expect(page.locator('#edit_transfer_document_url')).toHaveValue('https://example.test/document');
  await expect(page.locator('input[name="available_months_json"][value="JAN"]')).toBeChecked();
  await page.locator('#edit_system_name').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('#editDialog') !== null)).toBe(true);
  const village = page.locator('input[name="shared_villages_json"][value="QA-VILLAGE-2"]');
  await village.focus();
  await page.keyboard.press('Space');
  await expect(village).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(village).toBeChecked();
  await page.locator('#edit_system_name').fill('เปลี่ยนชื่อเพื่อทดสอบ');
  await page.keyboard.press('Escape');
  await expect(page.locator('#discardDialog')).toBeVisible();
  await page.locator('#continueEditingButton').click();
  await expect(page.locator('#edit_system_name')).toHaveValue('เปลี่ยนชื่อเพื่อทดสอบ');
  await page.locator('#editDialog [data-dismiss-dialog]').first().click();
  await page.locator('#confirmDiscardButton').click();
  await expect(page.locator('#systemDialog')).toBeVisible();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toEqual([]);
});

test('Phase B displays every rendered field from a synthetic existing record without mutating it', async ({ page }) => {
  const scalar = {
    system_name: 'ระบบเดิม', owner_type: 'LEGACY_OWNER', responsible_agency: 'หน่วยงานเดิม', system_type: 'LEGACY_SYSTEM',
    water_source_type: 'LEGACY_SOURCE', capacity_m3_hr: '12.5', households_served: '45', construction_year_be: '2560',
    operational_status: 'LEGACY_STATUS', utility_water_quality: 'LEGACY_UTILITY', drinking_water_quality: 'LEGACY_DRINKING',
    quality_failure_detail: 'รายละเอียดคุณภาพเดิม', water_quantity: 'LEGACY_QUANTITY', water_pressure: 'LEGACY_PRESSURE',
    year_round_status: 'LEGACY_YEAR', usage_type: 'LEGACY_USAGE', beneficiaries: '88', monthly_production_cost: '100.5',
    monthly_service_revenue: '75.5', water_tariff: '8.25', service_agency: 'ผู้ให้บริการเดิม',
    shared_with_other_village: 'LEGACY_SHARED', establishment_type: 'LEGACY_ESTABLISHMENT', establishment_agency: 'หน่วยงานจัดตั้งเดิม',
    transfer_year_be: '2562', transfer_agency: 'หน่วยงานถ่ายโอนเดิม', transfer_other: 'รายละเอียดถ่ายโอนเดิม',
    transfer_document_status: 'LEGACY_DOCUMENT', transfer_document_url: 'https://example.test/old.pdf',
    water_source_detail: 'แหล่งน้ำเดิม', surface_water_type: 'ประเภทน้ำเดิม', surface_water_agency: 'หน่วยงานน้ำผิวดินเดิม'
  };
  const existing = { ...editableSystem, ...scalar, usage_types_json: '["DOMESTIC","LEGACY_USE"]', quality_failure_categories_json: '["LEGACY_QUALITY"]', available_months_json: '["JAN","MAR"]', shared_villages_json: '[{"village_id":"LEGACY-VILLAGE"}]' };
  const network = await openManagement(page, { 'data.waterSystem': success({ system: existing }) });
  await openEditFromTable(page);
  for (const [key, value] of Object.entries(scalar)) await expect(page.locator(`#edit_${key}`), key).toHaveValue(value);
  for (const [key, selected] of Object.entries({ usage_types_json: ['DOMESTIC', 'LEGACY_USE'], quality_failure_categories_json: ['LEGACY_QUALITY'], available_months_json: ['JAN', 'MAR'], shared_villages_json: ['LEGACY-VILLAGE'] })) {
    for (const value of selected) await expect(page.locator(`input[name="${key}"][value="${value}"]`), `${key}:${value}`).toBeChecked();
  }
  await page.locator('#saveEditButton').click();
  await expect(page.locator('#editError')).not.toBeEmpty();
  expect(network.calls.filter(call => call.action === 'data.updateWaterSystem')).toEqual([]);
});

for (const width of [1440, 768, 390]) {
  test(`Phase B axe audit at ${width}px for login, dashboard, edit, delete, account and password states`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 });
    const network = await installIsolatedTechnician(page, managementMocks());
    await openLogin(page);
    const scan = async state => {
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations, `${state}: ${result.violations.map(v => `${v.id} ${v.nodes.map(n => n.target.join(',')).join(';')}`).join(' | ')}`).toEqual([]);
    };
    await scan('login');
    await submitSyntheticLogin(page);
    await expect(page.locator('#appView')).toBeVisible();
    await scan('dashboard');
    await openEditFromTable(page, width === 390);
    await scan('edit');
    await page.locator('#saveEditButton').click();
    await expect(page.locator('#editError')).not.toBeEmpty();
    await scan('edit validation error');
    await page.locator('#editDialog [data-dismiss-dialog]').first().click();
    await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
    await page.locator(`${width === 390 ? '#systemsMobileList' : '#systemsTableBody'} [data-action="delete"]`).first().click();
    await scan('delete');
    await page.locator('#deleteDialog [data-dismiss-dialog]').first().click();
    await page.locator('#systemDialog [data-dismiss-dialog]').first().click();
    await openToolSection(page, 'technicians');
    await page.locator('#createTechnicianButton').click();
    await scan('account');
    await page.locator('#technicianDialog [data-dismiss-dialog]').first().click();
    await page.locator(`${width === 390 ? '#techniciansMobileList' : '#techniciansTableBody'} [data-tech-action="delete"]`).first().click();
    await scan('account action');
    await page.locator('#actionDialog [data-dismiss-dialog]').first().click();
    if (width <= 900) { await page.locator('#mobileAccountButton').click(); await page.locator('#mobileChangePasswordButton').click(); }
    else await page.locator('#changePasswordButton').click();
    await scan('password');
    expect(mutations(network).filter(call => call.action !== 'technicians.list')).toEqual([]);
  });
}
