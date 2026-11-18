import {test,expect} from '@playwright/test';
import {openReference,fixture} from '../support/reference-ux-fixture.mjs';
import {resolveUiSourcePath} from '../support/source-root.mjs';

test('C-01: map popup escapes HTML payload in village_no and href attributes without executing script', async ({page}) => {
  const data = structuredClone(fixture);
  data.villages[0].village_no = '1<img src=x onerror="window.__c01_xss=1">';
  const evidence = await openReference(page, {dataset: data});
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await page.locator('#fq').fill('s1');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  const marker = page.locator('#map .dvicon-wrap').first();
  await marker.waitFor({state: 'visible'});
  await marker.click();
  const popup = page.locator('#map .leaflet-popup-content');
  await expect(popup).toBeVisible();
  expect(await page.evaluate(() => window.__c01_xss)).toBeUndefined();
  await expect(popup.locator('img')).toHaveCount(0);
  await expect(popup).toContainText('ม.1<img src=x onerror="window.__c01_xss=1">');
  expect(evidence.errors).toEqual([]);
});

test('I-01 + I-03: topbar actions work in history/technicians panels, and logout or SESSION_REVOKED clears history DOM, Swal, hash, and stale responses across users', async ({page}) => {
  let currentUser = {user_id: 'tech-a', username: 'tech-jun', displayName: 'ช่างจุน', role: 'TECHNICIAN', district: 'จุน', mustChangePassword: false};
  let resolveRevokedDash = null;
  let holdNextDashboard = false;
  let resolveDelayedHistory = null;

  const evidence = await openReference(page, {
    technician: true,
    respond: (env) => {
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: currentUser}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user: currentUser, permissions: ['UPDATE_SYSTEM', 'DELETE_SYSTEM', ...(currentUser.role === 'ADMIN' ? ['MANAGE_TECHNICIANS'] : [])], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      }
      if (env.action === 'data.dashboard') {
        if (holdNextDashboard) {
          holdNextDashboard = false;
          return new Promise(resolve => {
            resolveRevokedDash = () => resolve({success: false, error: {code: 'SESSION_REVOKED', message: 'Revoked while Swal open'}});
          });
        }
        const scoped = currentUser.role === 'ADMIN'
          ? fixture
          : {
              villages: fixture.villages.filter(v => v.district === currentUser.district),
              waterSystems: fixture.waterSystems.filter(s => s.village_id === (currentUser.district === 'จุน' ? 'v1' : 'v2')),
              waterSources: []
            };
        return {success: true, data: {...scoped, generatedAt: '2026-11-16T00:00:00Z'}};
      }
      if (env.action === 'data.waterSystem') {
        const sid = env.payload?.request?.systemId || env.payload?.systemId || 's1';
        const sys = fixture.waterSystems.find(s => s.system_id === sid) || fixture.waterSystems[0];
        const vil = fixture.villages.find(v => v.village_id === sys.village_id) || fixture.villages[0];
        return {success: true, data: {system: {...sys, managementMutable: true, recordVersion: 'b'.repeat(64), processingGuard: {mutable: true}, recordStatus: 'ACTIVE', publicVisible: true, village: vil}}};
      }
      if (env.action === 'data.entityHistory') {
        if (env.payload?.request?.entityId === 'DELAYED-REVOKED') {
          return new Promise(resolve => {
            resolveDelayedHistory = () => resolve({success: true, data: {history: [{action: 'SYSTEM_UPDATE', username: 'tech-jun', role: 'TECHNICIAN', timestamp: '2026-11-16T01:00:00Z', status: 'COMMITTED', reason: 'ข้อมูลค้างจาก async เก่า'}]}});
          });
        }
        return {success: true, data: {history: [{action: 'SYSTEM_UPDATE', username: 'tech-jun', role: 'TECHNICIAN', timestamp: '2026-11-16T01:00:00Z', status: 'COMMITTED', reason: 'บันทึกเฉพาะอำเภอจุน'}]}};
      }
      if (env.action === 'technicians.list') return {success: true, data: {technicians: []}};
    }
  });

  // 1. Tech A (จุน) logs in, opens history for s1
  await page.locator('#loginUsername').fill('tech-jun');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');

  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="table"]').click();
  await page.locator('#tblBody tr').first().click();
  await page.locator('#referenceHistoryButton').click();
  await expect(page.locator('#historyPanel')).toBeVisible();
  await expect(page.locator('#historyList')).toContainText('บันทึกเฉพาะอำเภอจุน');

  // I-03: refresh & account menu must stay visible inside #historyPanel
  await expect(page.locator('#refreshButton')).toBeVisible();
  await expect(page.locator('#mobileAccountButton')).toBeVisible();

  // Trigger logout directly from #historyPanel while hash is #historyPanel
  await page.locator('#mobileAccountButton').click();
  await page.getByRole('button', {name: 'ออกจากระบบ', exact: true}).click();
  await expect(page.locator('#loginView')).toBeVisible();

  // 2. Tech B (เชียงคำ) logs in on the same browser session
  currentUser = {user_id: 'tech-b', username: 'tech-chiangkham', displayName: 'ช่างเชียงคำ', role: 'TECHNICIAN', district: 'เชียงคำ', mustChangePassword: false};
  await page.locator('#loginUsername').fill('tech-chiangkham');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#referenceDashboard')).toContainText('ช่างอำเภอเชียงคำ');
  await expect(page.locator('#historyPanel')).toBeHidden();
  expect(await page.locator('#historyList').textContent()).not.toContain('บันทึกเฉพาะอำเภอจุน');
  expect(await page.locator('#historySystemId').inputValue()).toBe('');

  // Trigger a pending refresh that will return SESSION_REVOKED while Village Swal is open
  resolveRevokedDash = null;
  holdNextDashboard = true;
  await page.locator('#refreshButton').click();
  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="vtable"]').click();
  await page.locator('#vtblBody tr').first().click();
  await expect(page.locator('.swal2-popup')).toBeVisible();

  await expect.poll(() => resolveRevokedDash !== null).toBe(true);
  resolveRevokedDash();
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('.swal2-popup')).toBeHidden();

  // Log back in as Tech B, start a delayed history request alongside a SESSION_REVOKED dashboard refresh
  await page.locator('#loginUsername').fill('tech-chiangkham');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="table"]').click();
  await page.locator('#tblBody tr').first().click();
  await page.locator('#referenceHistoryButton').click();
  await expect(page.locator('#historyPanel')).toBeVisible();

  resolveRevokedDash = null;
  resolveDelayedHistory = null;
  holdNextDashboard = true;
  await page.locator('#refreshButton').click();
  await expect.poll(() => resolveRevokedDash !== null).toBe(true);
  await page.locator('#historySystemId').fill('DELAYED-REVOKED');
  await page.locator('#historySearchButton').click();
  await expect.poll(() => resolveDelayedHistory !== null).toBe(true);

  resolveRevokedDash();
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#busyOverlay')).toBeHidden();
  resolveDelayedHistory();
  await page.waitForTimeout(100);
  expect(await page.locator('#historyList').textContent()).not.toContain('ข้อมูลค้างจาก async เก่า');

  // 3. Admin logs in -> should start on dashboard (not #historyPanel) and see topbar actions inside #techniciansPanel
  currentUser = {user_id: 'admin', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  // Spec decision 4: account access moved from the account menu to the manage view tab.
  await page.locator('#mobileAccountButton').click();
  await expect(page.locator('#techniciansAccountButton')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('.main-nav [data-view="manage"]').click();
  await page.locator('.manage-tab[data-manage-tab="techniciansPanel"]').click();
  await expect(page.locator('#techniciansPanel')).toBeVisible();
  await expect(page.locator('#mobileAccountButton')).toBeVisible();
  expect(evidence.errors).toEqual([]);
});

test('I-02 + I-06: map popups and coordinate-less problem rows open system detail, keyboard works on problem chips/rows and map fullscreen Space, and dialog close restores focus', async ({page}) => {
  // Public checks: Hero Map popup detail button, Problem tab keyboard chips, Map fullscreen Spacebar
  const pubEv = await openReference(page, {dataset: fixture});
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await page.locator('#fq').fill('s1');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  await page.locator('#map .dvicon-wrap').first().click();
  const detailBtn = page.locator('#map .leaflet-popup-content [data-open-system="s1"]');
  await expect(detailBtn).toBeVisible();
  await detailBtn.click();
  await expect(page.locator('#referenceDetail')).toBeVisible();
  await expect(page.locator('#referenceDetail')).toContainText('ระบบทดสอบหนึ่ง');
  await page.keyboard.press('Escape');
  await expect(page.locator('#referenceDetail')).toBeHidden();

  await page.locator('#efReset').click();
  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="problem"]').click();
  const chip = page.locator('#dfProblemChips .df-chip').first();
  await expect(chip).toBeVisible();
  await chip.focus();
  await page.keyboard.press('Space');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toHaveClass(/active/);

  const probExpand = page.locator('#probMapStage .map-expand-ctrl a');
  await probExpand.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#probMapStage')).toHaveClass(/map-fullscreen/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#probMapStage')).not.toHaveClass(/map-fullscreen/);
  expect(pubEv.errors).toEqual([]);

  // Technician checks: Hero Map popup -> systemDialog; Problem tab no-XY row Enter & button -> systemDialog -> Escape focus restore
  const techData = structuredClone(fixture);
  techData.waterSystems[0] = {
    ...techData.waterSystems[0],
    system_id: 's1',
    system_name: 'ระบบจุนมีพิกัดมีปัญหา',
    operational_status: 'NOT_WORKING'
  };
  techData.waterSystems.push({
    ...techData.waterSystems[0],
    system_id: 's3-noxy',
    system_name: 'ระบบจุนไม่มีพิกัด',
    latitude: null,
    longitude: null,
    operational_status: 'NOT_WORKING',
    drinking_water_quality: 'FAIL'
  });
  const techEv = await openReference(page, {
    dataset: techData,
    technician: true,
    respond: (env) => {
      if (env.action === 'data.dashboard') {
        return {
          success: true,
          data: {
            villages: techData.villages.filter(v => v.village_id === 'v1'),
            waterSystems: techData.waterSystems.filter(s => s.village_id === 'v1'),
            waterSources: [],
            generatedAt: '2026-11-16T00:00:00Z'
          }
        };
      }
      if (env.action === 'data.waterSystem') {
        const sid = env.payload?.request?.systemId || env.payload?.systemId;
        const sys = techData.waterSystems.find(s => s.system_id === sid) || techData.waterSystems[0];
        return {
          success: true,
          data: {system: {...sys, managementMutable: true, recordVersion: 'b'.repeat(64), processingGuard: {mutable: true}, recordStatus: 'ACTIVE', publicVisible: true, village: techData.villages[0]}}
        };
      }
    }
  });
  await page.locator('#loginUsername').fill('synthetic-tech');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');

  // Hero map popup -> systemDialog
  await page.locator('#map .dvicon-wrap').first().click();
  const techPopupBtn = page.locator('#map .leaflet-popup-content [data-open-system="s1"]');
  await expect(techPopupBtn).toBeVisible();
  await techPopupBtn.click();
  await expect(page.locator('#systemDialog')).toBeVisible();
  await expect(page.locator('#systemDialogTitle')).toContainText('ระบบจุนมีพิกัดมีปัญหา');
  await page.keyboard.press('Escape');
  await expect(page.locator('#systemDialog')).toBeHidden();

  // Problem tab: coordinate-less row via keyboard Enter + detail button & focus restore
  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="problem"]').click();
  const noXyRow = page.locator('#probBody tr.dmg-row[data-id="s3-noxy"]');
  await expect(noXyRow).toBeVisible();
  await noXyRow.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#systemDialog')).toBeVisible();
  await expect(page.locator('#systemDialogTitle')).toContainText('ระบบจุนไม่มีพิกัด');
  await page.keyboard.press('Escape');
  await expect(page.locator('#systemDialog')).toBeHidden();
  await expect(noXyRow).toBeFocused();

  const noXyDetailBtn = noXyRow.locator('[data-open-system="s3-noxy"]');
  await expect(noXyDetailBtn).toBeVisible();
  await noXyDetailBtn.click();
  await expect(page.locator('#systemDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#systemDialog')).toBeHidden();
  await expect(noXyDetailBtn).toBeFocused();
  expect(techEv.errors).toEqual([]);
});

test('I-04 + I-05: public detail suppresses invalid/outside coords and future years, technician warns outside Phayao, missing values stay neutral and missing capacities are counted', async ({page}) => {
  // 1. Public checks: #referenceDetail consistency + compare null coloring & denominator + missing capacity + incomplete noWwTop
  const pubData = {
    villages: [
      {village_id: 'v1', village_name: 'บ้านจุน', district: 'จุน', local_authority: 'ทต.จุน', has_village_waterworks: 'มีประปาหมู่บ้าน', pwa_households: null, mwa_households: 0, commercial_households: 0, other_village_pipe_households: 0, waterbank_households: 0, self_source_households: 10, natural_source_households: null},
      {village_id: 'v2', village_name: 'บ้านเชียงคำ', district: 'เชียงคำ', local_authority: 'ทต.เชียงคำ', has_village_waterworks: null},
      {village_id: 'v3', village_name: 'บ้านดอกคำใต้', district: 'ดอกคำใต้', local_authority: 'ทต.ดอกคำใต้', has_village_waterworks: false, self_source_households: 12, natural_source_households: null}
    ],
    waterSystems: [
      {system_id: 's1', village_id: 'v1', system_name: 'ระบบนอกพะเยาปีอนาคต', latitude: 13.75, longitude: 100.5, system_type: 'SURFACE_SMALL', operational_status: 'WORKING', drinking_water_quality: 'NO_DATA', water_quantity: 'NO_DATA', utility_water_quality: 'UNKNOWN', capacity_m3_hr: null, construction_year_be: 2600},
      {system_id: 's2', village_id: 'v2', system_name: 'ระบบปกติ', latitude: 19.4, longitude: 100.2, system_type: 'SURFACE_SMALL', operational_status: 'WORKING', drinking_water_quality: 'FAIL', water_quantity: 'SUFFICIENT', utility_water_quality: 'USABLE', capacity_m3_hr: 1500, construction_year_be: 2560}
    ],
    waterSources: []
  };

  await openReference(page, {dataset: pubData});
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await expect(page.locator('#noWwTop')).not.toContainText('บ้านดอกคำใต้');

  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="table"]').click();
  await page.locator('#tblBody tr').filter({hasText: 's1'}).click();
  const detail = page.locator('#referenceDetail');
  await expect(detail).toBeVisible();
  const detailText = await detail.textContent();
  expect(detailText).not.toContain('13.750000');
  expect(detailText).not.toContain('2600');
  await page.keyboard.press('Escape');

  await page.locator('[data-tab="compare"]').click();
  const junRow = page.locator('#districtCompare tbody tr').filter({hasText: 'จุน'});
  const junDqCell = junRow.locator('td').nth(5);
  await expect(junDqCell).toHaveText('–');
  const dqColor = await junDqCell.evaluate(el => getComputedStyle(el).color);
  expect(dqColor).toBe('rgb(154, 165, 177)');

  const footerRow = page.locator('#districtCompare tbody tr').last();
  await expect(footerRow.locator('td').nth(2)).toHaveText('50.0%');
  await expect(footerRow.locator('td').last()).toHaveText('–');

  await page.locator('[data-tab="insight"]').click();
  await expect(page.locator('#ixBody')).toContainText('1,500');
  await expect(page.locator('#ixBody')).toContainText('ค่าที่ไม่พร้อมคำนวณ 1 ระบบ');

  // 2. Technician check: out-of-Phayao coordinate stays on map AND triggers outside-area warning in #mapNote
  const techData = {
    villages: [pubData.villages[0]],
    waterSystems: [{...pubData.waterSystems[0], construction_year_be: 2560}],
    waterSources: []
  };
  await openReference(page, {
    dataset: techData,
    technician: true,
    respond: (env) => {
      if (env.action === 'data.dashboard') return {success: true, data: {...techData, generatedAt: '2026-11-16T00:00:00Z'}};
    }
  });
  await page.locator('#loginUsername').fill('synthetic-tech');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  await expect(page.locator('#n-map')).toContainText('1 จุดที่มีพิกัด');
  await expect(page.locator('#mapNote')).toContainText('รวมพิกัดผิดพื้นที่ 1 ระบบ');
});

test('I-07 + I-08: public detail modal styles badges and doc cards, refresh keeps active view/tab, #problemList opens problem tab, and technician #overview returns to exec view', async ({page}) => {
  // I-07: Public detail badges & document card styles
  const data = structuredClone(fixture);
  data.waterSystems[0].establishment_type = 'TRANSFERRED';
  data.waterSystems[0].transfer_document_status = 'AVAILABLE';
  data.waterSystems[0].transfer_document_url = 'https://example.com/transfer.pdf';
  await openReference(page, {dataset: data});
  await page.goto('https://reference.test/#overview');
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="table"]').click();
  await page.locator('#tblBody tr').first().click();

  const detail = page.locator('#referenceDetail');
  await expect(detail).toBeVisible();
  const styles = await detail.evaluate(el => {
    const stack = el.querySelector('.detail-stack');
    const row = el.querySelector('.detail-status-row');
    const badge = el.querySelector('.badge-success');
    return {
      stackDisplay: stack ? getComputedStyle(stack).display : '',
      stackGap: stack ? parseFloat(getComputedStyle(stack).gap || '0') : 0,
      rowDisplay: row ? getComputedStyle(row).display : '',
      rowGap: row ? parseFloat(getComputedStyle(row).gap || '0') : 0,
      badgeBg: badge ? getComputedStyle(badge).backgroundColor : '',
      badgePadLeft: badge ? parseFloat(getComputedStyle(badge).paddingLeft || '0') : 0,
      hasDocCard: el.querySelectorAll('.detail-document-card').length,
      text: el.textContent || ''
    };
  });
  expect(styles.stackDisplay).toBe('flex');
  expect(styles.stackGap).toBeGreaterThan(0);
  expect(styles.rowDisplay).toBe('flex');
  expect(styles.rowGap).toBeGreaterThan(0);
  expect(styles.badgeBg).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.badgePadLeft).toBeGreaterThanOrEqual(6);
  // Restricted transfer_document_url remains excluded from Public projection
  expect(styles.hasDocCard).toBe(0);
  expect(styles.text).not.toContain('example.com/transfer.pdf');
  await page.keyboard.press('Escape');

  // I-08 (Public): refresh must preserve active view/tab (#panel-vtable) even when URL hash is #overview
  await page.locator('[data-tab="vtable"]').click();
  await expect(page.locator('#panel-vtable')).toHaveClass(/active/);
  await page.locator('#btnRefresh').click();
  await expect(page.locator('#btnRefresh')).toBeEnabled();
  await expect(page.locator('#view-detail')).toHaveClass(/active/);
  await expect(page.locator('#panel-vtable')).toHaveClass(/active/);

  // Deep-link #problemList must open problem tab (not table) & hashchange must navigate
  await page.goto('https://reference.test/#problemList');
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await expect(page.locator('#view-detail')).toHaveClass(/active/);
  await expect(page.locator('#panel-problem')).toHaveClass(/active/);
  await page.evaluate(() => { location.hash = '#compare'; });
  await expect(page.locator('#panel-compare')).toHaveClass(/active/);

  // I-08 (Technician): navigating to #overview switches from detail back to exec view
  await openReference(page, {technician: true});
  await page.locator('#loginUsername').fill('synthetic-tech');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  await page.locator('#referenceDashboard [data-view="detail"]').click();
  await expect(page.locator('#referenceDashboard #view-detail')).toHaveClass(/active/);
  await page.evaluate(() => { location.hash = '#overview'; });
  await expect(page.locator('#referenceDashboard #view-exec')).toHaveClass(/active/);
});

test('M-01: age-20 marker aligns with 11-20 legend while KPI >=20 keeps age 20, dynamic year updates, scoped CSS classes stay valid, vtable filtered count differs from DQA original count, and getSelection includes visibility', async ({page}) => {
  // Check CSS files do not contain broken .:scope-section or .lb-:scope selectors
  const fs = await import('node:fs');
  const techCss = fs.readFileSync(resolveUiSourcePath('assets/css/reference-technician.css'), 'utf8');
  expect(techCss).not.toContain('.:scope-section');
  expect(techCss).not.toContain('.lb-:scope');
  expect(techCss).toContain('.body-section');
  expect(techCss).toContain('.lb-body');

  // Shift wall clock +60 days so Asia/Bangkok B.E. year becomes 2570 (vs hardcoded 2569)
  await page.addInitScript(() => {
    const OrigDate = Date;
    const shift = 60 * 86400 * 1000;
    function ShiftedDate(...args) {
      if (!new.target) return new OrigDate(OrigDate.now() + shift).toString();
      return args.length ? new OrigDate(...args) : new OrigDate(OrigDate.now() + shift);
    }
    ShiftedDate.now = () => OrigDate.now() + shift;
    ShiftedDate.parse = OrigDate.parse;
    ShiftedDate.UTC = OrigDate.UTC;
    ShiftedDate.prototype = OrigDate.prototype;
    window.Date = ShiftedDate;
  });

  // Systems at exact age band boundaries relative to 2570 B.E. (0,5,6,10,11,20,21,30,31) plus 2 systems in v1
  const years = [2570, 2565, 2564, 2560, 2559, 2550, 2549, 2540, 2539]; // ages 0,5,6,10,11,20,21,30,31
  const dataset = {
    villages: [
      {village_id: 'v1', village_name: 'บ้านจุนหนึ่ง', district: 'จุน', has_village_waterworks: true},
      {village_id: 'v2', village_name: 'บ้านเชียงคำสอง', district: 'เชียงคำ', has_village_waterworks: true}
    ],
    waterSystems: years.map((yr, idx) => ({
      system_id: 'age-' + (2570 - yr),
      village_id: idx < 2 ? 'v1' : 'v2',
      system_name: 'ระบบอายุ-' + (2570 - yr),
      latitude: 19.3 + idx * 0.001,
      longitude: 100.1 + idx * 0.001,
      system_type: idx === 0 ? 'SURFACE_SMALL' : 'GROUNDWATER_SMALL',
      operational_status: 'WORKING',
      drinking_water_quality: 'PASS',
      water_quantity: 'SUFFICIENT',
      construction_year_be: yr
    })),
    waterSources: []
  };

  await openReference(page, {dataset});
  await expect(page.locator('#efCount')).toContainText('9 ระบบ');

  // Dynamic year on Section 4 subtitle must reflect 2570 instead of hardcoded 2569
  await expect(page.locator('#ageFormulaSub')).toContainText('2570');

  // KPI "ระบบอายุตั้งแต่ 20 ปี" must count ages 20, 21, 30, 31 => 4 / 9 = 44.4%
  await expect(page.locator('#execKpi')).toContainText('4 จาก 9 ระบบ');

  // Chart c_age age bands: [<=5: 2 (0,5), 6-10: 2 (6,10), 11-20: 2 (11,20), 21-30: 2 (21,30), >30: 1 (31)]
  const chartCounts = await page.evaluate(() => Chart.getChart('c_age')?.data?.datasets?.[0]?.data || []);
  expect(chartCounts).toEqual([2, 2, 2, 2, 1]);

  // Switch hero map color to "age" and filter to single systems age=20 and age=21 to check marker color
  await page.locator('#mlcToggle').click();
  await page.locator('input[name="mlcColor"][value="age"]').check();
  await page.locator('#fq').fill('age-20');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  const col20 = await page.locator('#map .dvicon').first().evaluate(el => getComputedStyle(el).backgroundColor);
  expect(col20).toBe('rgb(249, 168, 37)'); // #f9a825 yellow for 11-20

  await page.locator('#fqClear').click();
  await expect(page.locator('#efCount')).toContainText('9 ระบบ');
  await page.locator('#fq').fill('age-21');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  const col21 = await page.locator('#map .dvicon').first().evaluate(el => getComputedStyle(el).backgroundColor);
  expect(col21).toBe('rgb(198, 40, 40)'); // #c62828 red for >20

  // Filtered village table system count vs preserved original DQA linked count
  await page.locator('#efReset').click();
  await expect(page.locator('#efCount')).toContainText('9 ระบบ');
  await page.locator('#fst').selectOption('SURFACE_SMALL');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  // v1 has 2 total linked systems (age-0 is SURFACE_SMALL, age-5 is GROUNDWATER_SMALL); filtered count in vtable is 1, while DQA original linked missing count stays 0
  await expect(page.locator('#dqaBox')).toContainText('0 หมู่บ้าน');
  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="vtable"]').click();
  const v1Row = page.locator('#vtblBody tr').filter({hasText: 'v1'});
  await expect(v1Row.locator('td').nth(5)).toHaveText('1');

  // Technician: getSelection() must reflect publicVisibility filter
  const techSource = structuredClone(fixture);
  techSource.waterSystems[0].publicVisible = true;
  techSource.waterSystems[1].publicVisible = false;
  await openReference(page, {dataset: techSource, technician: true, user: {username: 'admin', role: 'ADMIN', district: ''}});
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('synthetic-password');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await page.locator('#referenceVisibility').selectOption('HIDDEN');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  const selectedIds = await page.evaluate(() => window.VWSReferenceTechnician.getSelection().waterSystems.map(s => s.system_id));
  expect(selectedIds).toEqual(['s2']);
});

test('CANDIDATE-BUG-01: clicking Reference chart cross-filter must not throw synchronous Chart.destroy() afterEvent TypeError', async ({page}) => {
  const evidence = await openReference(page, {dataset: fixture});
  const chartCanvas = page.locator('#c_ops');
  await chartCanvas.scrollIntoViewIfNeeded();
  const box = await chartCanvas.boundingBox();
  expect(box).toBeTruthy();
  const pt = await page.evaluate(() => {
    const canvas = document.getElementById('c_ops');
    const chart = window.Chart?.getChart?.(canvas);
    const elem = chart?.getDatasetMeta?.(0)?.data?.[0];
    return elem ? elem.getCenterPoint() : null;
  });
  expect(pt).toBeTruthy();
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-BUG-02: reference-technician retains systems whose village metadata arrives on system.village when raw.villages lists other villages', async ({page}) => {
  const adminUser = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  await openReference(page, {
    technician: true,
    respond: (env) => {
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: adminUser}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user: adminUser, permissions: ['UPDATE_SYSTEM'], featureFlags: {managementRead: true}, enumCatalog: {}}};
      }
      if (env.action === 'data.dashboard') {
        return {
          success: true,
          data: {
            generatedAt: '2026-11-16T00:00:00Z',
            villages: [{village_id: 'v-other', village_name: 'บ้านอื่น', district: 'จุน'}],
            waterSystems: [{system_id: 's-nested', village_id: 'v-nested', system_name: 'ระบบอ้างอิงซ้อน', operational_status: 'WORKING', publicVisible: true, village: {village_name: 'บ้านซ้อน', district: 'จุน'}}],
            waterSources: []
          }
        };
      }
      return {success: true, data: {}};
    }
  });
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ จาก 1');
});

function contrastReport(violations) {
  return violations.flatMap(v => v.nodes.map(n => `${n.target.join(',')} :: ${n.any.map(a => a.message).join(' ')}`)).join(' | ');
}

test('CANDIDATE-BUG-03: Public Reference dashboard meets WCAG AA color-contrast on primary text and controls', async ({page}) => {
  const evidence = await openReference(page, {dataset: fixture});
  await expect(page.locator('body > .app-header')).toBeVisible();
  await expect(page.locator('#view-exec')).toBeVisible();
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('body').withRules(['color-contrast']).analyze();
  expect(result.violations, contrastReport(result.violations)).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-BUG-03: Technician Reference dashboard meets WCAG AA color-contrast on primary text and controls', async ({page}) => {
  const adminUser = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  const evidence = await openReference(page, {technician: true, user: adminUser});
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#referenceDashboard').withRules(['color-contrast']).analyze();
  expect(result.violations, contrastReport(result.violations)).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-BUG-04: Reference detail view maintains sequential heading levels without skipping from h1 to h3', async ({page}) => {
  await openReference(page, {dataset: fixture});
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="compare"]').click();
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#view-detail').withRules(['heading-order']).analyze();
  expect(result.violations, result.violations.map(v => v.nodes.map(n => n.target.join(',')).join(';')).join(' | ')).toEqual([]);
});

test('CANDIDATE-BUG-05: Technician detail dialog body provides keyboard access when scrollable', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 640});
  const adminUser = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  await openReference(page, {
    technician: true,
    respond: (env) => {
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: adminUser}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user: adminUser, permissions: ['UPDATE_SYSTEM'], featureFlags: {managementRead: true}, enumCatalog: {}}};
      }
      if (env.action === 'data.dashboard') return {success: true, data: {...fixture, generatedAt: '2026-11-16T00:00:00Z'}};
      if (env.action === 'data.waterSystem') return {success: true, data: {system: fixture.waterSystems[0]}};
      return {success: true, data: {}};
    }
  });
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="table"]').click();
  await page.locator('#tblBody tr').first().click();
  await expect(page.locator('#systemDialog')).toBeVisible();
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#systemDialog').withRules(['scrollable-region-focusable']).analyze();
  expect(result.violations, result.violations.map(v => v.nodes.map(n => n.target.join(',')).join(';')).join(' | ')).toEqual([]);
});

test('CANDIDATE-BUG-06: problem filter dropdowns #dfDist and #dfType have accessible labels', async ({page}) => {
  await openReference(page, {dataset: fixture});
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="problem"]').click();
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#panel-problem').withRules(['select-name']).analyze();
  expect(result.violations, result.violations.map(v => v.nodes.map(n => n.target.join(',')).join(';')).join(' | ')).toEqual([]);
});

test('CANDIDATE-BUG-07: problem table rows do not nest buttons or links inside role=button rows', async ({page}) => {
  await openReference(page, {dataset: fixture});
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="problem"]').click();
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#panel-problem').withRules(['nested-interactive']).analyze();
  expect(result.violations, result.violations.map(v => v.nodes.map(n => n.target.join(',')).join(';')).join(' | ')).toEqual([]);
});

test('CANDIDATE-BUG-07: problem rows keep keyboard row action and inner detail button fires only its own action', async ({page}) => {
  const evidence = await openReference(page, {dataset: fixture});
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="problem"]').click();
  const row = page.locator('#probBody tr.dmg-row[data-id="s2"]');
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAttribute('role', 'button');
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveClass(/\bhot\b/);
  await page.evaluate(() => document.querySelectorAll('#probBody tr.hot').forEach(x => x.classList.remove('hot')));
  const detail = row.locator('[data-open-system]');
  await detail.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#referenceDetail')).toBeVisible();
  await expect(row).not.toHaveClass(/\bhot\b/);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-UX-08: selected problem chip keeps white text while hovered', async ({page}) => {
  const evidence = await openReference(page, {dataset: fixture});
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="problem"]').click();
  const chip = page.locator('.df-chip').first();
  await chip.click();
  await expect(chip).toHaveClass(/\bactive\b/);
  await chip.hover();
  await expect(chip).toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-BUG-01: repeated chart clicks apply the latest filter state on both cross-filter charts without errors', async ({page}) => {
  const evidence = await openReference(page, {dataset: fixture});
  const clickFirst = async (id, index = 0) => {
    const canvas = page.locator('#' + id);
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    const pt = await page.evaluate(({id, index}) => {
      const chart = window.Chart.getChart(document.getElementById(id));
      const meta = chart.getDatasetMeta(0);
      return meta.data[index].getCenterPoint();
    }, {id, index});
    await page.mouse.click(box.x + pt.x, box.y + pt.y);
  };
  await clickFirst('c_ops');
  await clickFirst('c_ops');
  await expect(page.locator('#efCount')).toContainText('แสดง 2 ระบบ');
  await clickFirst('c_ops');
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ');
  await clickFirst('c_ops');
  await expect(page.locator('#efCount')).toContainText('แสดง 2 ระบบ');
  await clickFirst('c_hhmix');
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ');
  const charts = await page.evaluate(() => [...document.querySelectorAll('canvas')].filter(c => window.Chart.getChart(c)).length);
  const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
  expect(charts).toBeLessThanOrEqual(canvases);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-BUG-02: nested village metadata never overrides canonical villages or widens technician district scope', async ({page}) => {
  const techUser = {user_id: 'tech-a', username: 'tech-jun', displayName: 'ช่างจุน', role: 'TECHNICIAN', district: 'จุน', mustChangePassword: false};
  await openReference(page, {
    technician: true,
    respond: (env) => {
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: techUser}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user: techUser, permissions: ['UPDATE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      }
      if (env.action === 'data.dashboard') {
        return {success: true, data: {
          generatedAt: '2026-11-16T00:00:00Z',
          villages: [{village_id: 'v-canon', village_name: 'บ้านหลักจุน', district: 'จุน'}],
          waterSystems: [
            {system_id: 's-canon', village_id: 'v-canon', system_name: 'ระบบหลัก', operational_status: 'WORKING', publicVisible: true, village: {village_name: 'ชื่อซ้อนผิด', district: 'เชียงคำ'}},
            {system_id: 's-nested-jun', village_id: 'v-nested-jun', system_name: 'ระบบซ้อนจุน', operational_status: 'WORKING', publicVisible: true, village: {village_name: 'บ้านซ้อนจุน', district: 'จุน'}},
            {system_id: 's-nested-dup', village_id: 'v-nested-jun', system_name: 'ระบบซ้อนจุนสอง', operational_status: 'WORKING', publicVisible: true, village: {village_name: 'บ้านซ้อนจุน', district: 'จุน'}},
            {system_id: 's-other', village_id: 'v-other', system_name: 'ระบบอำเภออื่น', operational_status: 'WORKING', publicVisible: true, village: {village_name: 'บ้านเชียงคำ', district: 'เชียงคำ'}}
          ],
          waterSources: []
        }};
      }
      return {success: true, data: {}};
    }
  });
  await page.locator('#loginUsername').fill('tech-jun');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#efCount')).toContainText('แสดง 3 ระบบ จาก 3');
  await expect(page.locator('#efCount')).toContainText('2 หมู่บ้าน');
  const selection = await page.evaluate(() => window.VWSReferenceTechnician.getSelection());
  expect(selection.waterSystems.map(s => s.system_id).sort()).toEqual(['s-canon', 's-nested-dup', 's-nested-jun']);
  expect(selection.villages.find(v => v.village_id === 'v-canon').village_name).toBe('บ้านหลักจุน');
});

async function loginManagement(page, user, permissions, mutableFor = () => true) {
  const evidence = await openReference(page, {
    technician: true,
    user,
    respond: (env, def) => {
      if (env.action === 'data.dashboard') return {success: true, data: {...def.data, waterSystems: def.data.waterSystems.map(w => ({...w, managementMutable: mutableFor(w)}))}};
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user, permissions, featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      }
      if (env.action === 'accounts.list' || env.action === 'technicians.list') return {success: true, data: {items: []}};
      return undefined;
    }
  });
  await page.locator('#loginUsername').fill(user.username);
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  return evidence;
}

test('CANDIDATE-UX-09: admin manage button opens systems list, history and technician accounts inside the Reference header', async ({page}) => {
  const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  const evidence = await loginManagement(page, admin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
  const manage = page.locator('#referenceDashboard .main-nav button[data-view="manage"]');
  await expect(manage).toBeVisible();
  await manage.click();
  await expect(page.locator('#view-manage')).toBeVisible();
  await expect(page.locator('#referenceDashboard .app-header')).toBeVisible();
  await expect(page.locator('#referenceDashboard .gf')).toBeHidden();
  await expect(page.locator('#view-manage #systemsTableBody tr')).toHaveCount(2);
  const tabs = page.locator('#view-manage .manage-tab');
  await expect(tabs).toHaveCount(2); // history tab removed (UX-13)
  await page.evaluate(() => { location.hash = 'historyPanel'; }); // history tab removed (UX-13); same route as the dialog/menu history action
  await expect(page.locator('#view-manage #historyPanel')).toBeVisible();
  await expect(page.locator('#view-manage #systemsTableBody')).toBeHidden();
  await expect(page.locator('#referenceDashboard .app-header')).toBeVisible();
  await page.locator('#view-manage .manage-tab[data-manage-tab="techniciansPanel"]').click();
  await expect(page.locator('#view-manage #techniciansPanel')).toBeVisible();
  await expect(page.locator('#view-manage #historyPanel')).toBeHidden();
  await page.locator('#view-manage .manage-tab[data-manage-tab="list"]').click();
  await expect(page.locator('#view-manage #systemsTableBody tr').first()).toBeVisible();
  await page.locator('#referenceDashboard .main-nav button[data-view="exec"]').click();
  await expect(page.locator('#view-exec')).toBeVisible();
  await expect(page.locator('#view-manage')).toBeHidden();
  await expect(page.locator('#techniciansAccountButton')).toBeHidden();
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-UX-09: district technician manage view hides technician accounts and shows readable scope badge', async ({page}) => {
  const tech = {user_id: 'tech-a', username: 'tech-jun', displayName: 'ช่างจุน', role: 'TECHNICIAN', district: 'จุน', mustChangePassword: false};
  const evidence = await loginManagement(page, tech, ['UPDATE_SYSTEM']);
  await expect(page.locator('.reference-account-scope')).toHaveText('ช่างอำเภอจุน');
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage .manage-tab[data-manage-tab="techniciansPanel"]')).toBeHidden();
  await expect(page.locator('#view-manage #systemsTableBody tr')).toHaveCount(1);
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#referenceDashboard .app-header').withRules(['color-contrast']).analyze();
  expect(result.violations, contrastReport(result.violations)).toEqual([]);
  await page.goto('https://reference.test/technician/#techniciansPanel');
  await expect(page.locator('#techniciansPanel')).toBeHidden();
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-UX-10: session resume screen uses the Reference purple header and KwanKukkeb title', async ({page}) => {
  const user = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.addInitScript(() => sessionStorage.setItem('vws_management_token_v2', 'MGT-' + 'a'.repeat(64)));
  const evidence = await openReference(page, {
    technician: true,
    user,
    respond: async (env) => {
      if (env.action === 'data.bootstrap') {
        await gate;
        return {success: true, data: {user, permissions: ['UPDATE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      }
      return undefined;
    }
  });
  await expect(page.locator('#bootView')).toBeVisible();
  const header = page.locator('#bootView .resume-header');
  await expect(header).toContainText('KwanKukkeb');
  expect(await header.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  await expect(page.locator('#bootTitle')).toHaveText('กำลังโหลดข้อมูล...');
  await expect(page.locator('#bootView .resume-nav')).toHaveCount(0);
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#bootView').withRules(['color-contrast']).analyze();
  expect(result.violations, contrastReport(result.violations)).toEqual([]);
  release();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#bootView')).toBeHidden();
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-UX-10: login keeps a red border on invalid fields', async ({page}) => {
  const user = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  await openReference(page, {technician: true, user});
  await page.locator('#loginSubmit').click();
  const input = page.locator('#loginUsername');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const color = await input.evaluate(el => getComputedStyle(el).borderTopColor);
  const [r, g, b] = color.match(/\d+/g).map(Number);
  expect(r).toBeGreaterThan(g + 60);
  expect(r).toBeGreaterThan(b + 60);
});

test('CANDIDATE-UX-09: logout restores moved management sections so the next login still works', async ({page}) => {
  const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  const evidence = await loginManagement(page, admin, ['UPDATE_SYSTEM', 'MANAGE_TECHNICIANS']);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage #systemsTableBody tr')).toHaveCount(2);
  await page.locator('#mobileAccountButton').click();
  await page.locator('#logoutButton').click();
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#watchlist')).toHaveCount(1);
  await expect(page.locator('#historyPanel')).toHaveCount(1);
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage #systemsTableBody tr')).toHaveCount(2);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-UX-09: logout then login as district technician hides account tab and shows only district systems', async ({page}) => {
  const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  const tech = {user_id: 'tech-a', username: 'tech-jun', displayName: 'ช่างจุน', role: 'TECHNICIAN', district: 'จุน', mustChangePassword: false};
  let current = admin;
  await openReference(page, {
    technician: true,
    user: admin,
    respond: (env, def) => {
      if (env.action === 'auth.login') { current = env.payload?.username === 'tech-jun' ? tech : admin; return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: current}}; }
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user: current, permissions: current === admin ? ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS'] : ['UPDATE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      }
      if (env.action === 'data.dashboard' && current === tech) return {success: true, data: {...def.data, villages: def.data.villages.slice(0, 1), waterSystems: def.data.waterSystems.slice(0, 1)}};
      if (env.action === 'data.entityHistory') return {success: true, data: {history: [{auditId: 'A1', action: 'SYSTEM_UPDATE', username: 'ADMINONLYAUDIT', role: 'ADMIN', timestamp: '2026-01-01T00:00:00Z', status: 'COMMITTED', changes: []}]}};
      if (env.action === 'accounts.list' || env.action === 'technicians.list') return {success: true, data: {items: []}};
      return undefined;
    }
  });
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage .manage-tab[data-manage-tab="techniciansPanel"]')).toBeVisible();
  await page.evaluate(() => { location.hash = 'historyPanel'; }); // history tab removed (UX-13); same route as the dialog/menu history action
  await page.locator('#historySystemId').fill('s1');
  await page.locator('#historySearchButton').click();
  await expect(page.locator('#historyList')).toContainText('ADMINONLYAUDIT');
  await page.locator('#view-manage .manage-tab[data-manage-tab="techniciansPanel"]').click();
  await expect(page.locator('#techniciansPanel')).toBeVisible();
  await page.locator('#mobileAccountButton').click();
  await page.locator('#logoutButton').click();
  await expect(page.locator('#loginView')).toBeVisible();
  await page.locator('#loginUsername').fill('tech-jun');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage')).toBeVisible();
  await expect(page.locator('#view-manage .manage-tab[data-manage-tab="techniciansPanel"]')).toBeHidden();
  await expect(page.locator('#techniciansPanel')).toBeHidden();
  await expect(page.locator('#view-manage #systemsTableBody tr')).toHaveCount(1);
  await expect(page.locator('#historyList')).not.toContainText('ADMINONLYAUDIT');
  await expect(page.locator('#historySystemId')).toHaveValue('');
});

test('CANDIDATE-UX-09: deep links restore manage tabs after session resume', async ({page}) => {
  const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  await page.addInitScript(() => sessionStorage.setItem('vws_management_token_v2', 'MGT-' + 'a'.repeat(64)));
  const evidence = await openReference(page, {
    technician: true,
    user: admin,
    respond: (env) => {
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') return {success: true, data: {user: admin, permissions: ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      if (env.action === 'accounts.list' || env.action === 'technicians.list') return {success: true, data: {items: []}};
      return undefined;
    }
  });
  await page.goto('https://reference.test/technician/#historyPanel');
  await page.reload();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#view-manage')).toBeVisible();
  await expect(page.locator('#historyPanel')).toBeVisible();
  await expect(page.locator('#appHeader')).toBeHidden();
  await expect(page.locator('#view-manage .manage-tab[aria-current="page"]')).toHaveCount(0); // history has no tab since UX-13
  await page.goto('https://reference.test/technician/#watchlist');
  await page.reload();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#view-manage')).toBeVisible();
  await expect(page.locator('#systemsModeMonitoring')).toHaveAttribute('aria-pressed', 'true');
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-UX-09: technician without account permission deep link falls back to overview', async ({page}) => {
  const tech = {user_id: 'tech-a', username: 'tech-jun', displayName: 'ช่างจุน', role: 'TECHNICIAN', district: 'จุน', mustChangePassword: false};
  await page.addInitScript(() => sessionStorage.setItem('vws_management_token_v2', 'MGT-' + 'a'.repeat(64)));
  await openReference(page, {technician: true, user: tech, respond: (env) => (env.action === 'auth.me' || env.action === 'data.bootstrap') ? {success: true, data: {user: tech, permissions: ['UPDATE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}} : undefined});
  await page.goto('https://reference.test/technician/#techniciansPanel');
  await page.reload();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#view-exec')).toBeVisible();
  await expect(page.locator('#techniciansPanel')).toBeHidden();
});

test('CANDIDATE-UX-09: row history action opens history tab under Reference header with system id', async ({page}) => {
  const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  const evidence = await loginManagement(page, admin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await page.locator('#view-manage #systemsTableBody tr').filter({hasText: 'ระบบทดสอบหนึ่ง'}).locator('[data-action-trigger]').click();
  await page.locator('#systemActionMenu button[data-action="history"]').click();
  await expect(page.locator('#historySystemId')).toHaveValue('s1');
  await expect(page.locator('#view-manage .manage-tab[aria-current="page"]')).toHaveCount(0); // history has no tab since UX-13
  await expect(page.locator('#view-manage #historyPanel')).toBeVisible();
  await expect(page.locator('#referenceDashboard .app-header')).toBeVisible();
  expect(evidence.calls.filter(c => c.action === 'data.entityHistory')).toHaveLength(1);
  expect(evidence.errors).toEqual([]);
});

for (const [width, height] of [[1440, 900], [768, 900], [390, 844]]) test(`CANDIDATE-UX-09: manage view keeps tabs and list search below the sticky Reference header at ${width}px`, async ({page}) => {
  const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  const {fixture} = await import('../support/reference-ux-fixture.mjs');
  const waterSystems = Array.from({length: 120}, (_, i) => ({...fixture.waterSystems[i % 2], system_id: 'bulk-' + i, system_name: 'ระบบจำลอง ' + i}));
  await page.setViewportSize({width, height});
  await openReference(page, {technician: true, user: admin, dataset: {...fixture, waterSystems}, respond: (env) => {
    if (env.action === 'auth.me' || env.action === 'data.bootstrap') return {success: true, data: {user: admin, permissions: ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
    return undefined;
  }});
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 1500));
  const manage = page.locator('#referenceDashboard .main-nav button[data-view="manage"]');
  if (width < 600) await page.evaluate(() => document.querySelector('#referenceDashboard .main-nav button[data-view="manage"]').click()); else await manage.click();
  await expect(page.locator('#view-manage .manage-tabs')).toBeVisible();
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const top = s => document.querySelector(s).getBoundingClientRect().top;
    return {header: document.querySelector('#referenceDashboard .app-header').getBoundingClientRect().bottom, tabs: top('#view-manage .manage-tabs'), search: top('#searchInput'), scrollY: window.scrollY};
  });
  expect(m.tabs, JSON.stringify(m)).toBeGreaterThanOrEqual(Math.max(m.header, 0) - 1);
  expect(m.search, JSON.stringify(m)).toBeGreaterThanOrEqual(Math.max(m.header, 0) - 1);
  // CANDIDATE-MINOR-2: scroll offset follows the real header height, not a fixed 150px.
  const h = await page.evaluate(() => ({var: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reference-header-height')), height: document.querySelector('#referenceDashboard .app-header').getBoundingClientRect().height, margin: parseFloat(getComputedStyle(document.querySelector('#view-manage #watchlist')).scrollMarginTop)}));
  expect(Math.abs(h.var - h.height), JSON.stringify(h)).toBeLessThanOrEqual(1);
  expect(Math.abs(h.margin - (h.height + 12)), JSON.stringify(h)).toBeLessThanOrEqual(1.5);
});


const uxAdmin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};

test('CANDIDATE-UX-11: edit button in manage list opens the existing edit dialog', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await page.locator('#systemsModeAll').click();
  const btn = page.locator('#systemsTableBody tr[data-system-id="s1"] .system-edit-button');
  await expect(btn).toHaveText('แก้ไข');
  await btn.click();
  await expect(page.locator('#editDialog')).toBeVisible();
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-UX-11: account without UPDATE_SYSTEM sees no edit button', async ({page}) => {
  await loginManagement(page, uxAdmin, []);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage #systemsTableBody tr').first()).toBeVisible();
  await expect(page.locator('.system-edit-button')).toHaveCount(0);
  await expect(page.locator('.system-edit-locked')).toHaveCount(0);
});

test('CANDIDATE-UX-11: immutable system shows locked label instead of edit', async ({page}) => {
  await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM'], w => w.system_id !== 's1');
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await page.locator('#systemsModeAll').click();
  const row = page.locator('#systemsTableBody tr[data-system-id="s1"]');
  await expect(row).toContainText('แก้ไขไม่ได้: ข้อมูลต้นทางมีปัญหา');
  await expect(row.locator('.system-edit-button')).toHaveCount(0);
  await expect(page.locator('#systemsTableBody tr[data-system-id="s2"] .system-edit-button')).toHaveCount(1);
});

test('CANDIDATE-UX-11: 390px card keeps a full-width edit button without horizontal overflow', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await page.evaluate(() => document.querySelector('#referenceDashboard .main-nav button[data-view="manage"]').click());
  const btn = page.locator('#systemsMobileList .system-edit-button').first();
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#view-manage').withRules(['color-contrast']).analyze();
  expect(result.violations, contrastReport(result.violations)).toEqual([]);
});

test('CANDIDATE-UX-11: Enter on the focused edit button opens the edit dialog exactly once', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await page.locator('#systemsModeAll').click();
  const btn = page.locator('#systemsTableBody tr[data-system-id="s1"] .system-edit-button');
  await expect(btn).toBeVisible();
  await page.evaluate(() => {
    window.__opens = 0;
    const d = document.getElementById('editDialog');
    const orig = d.showModal.bind(d);
    d.showModal = () => { window.__opens++; orig(); };
  });
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#editDialog')).toBeVisible();
  expect(await page.evaluate(() => window.__opens)).toBe(1);
  expect(evidence.errors).toEqual([]);
});


test('CANDIDATE-UX-12: leaving the history tab via detail nav restores dashboard workspace and dialog focus return', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await page.evaluate(() => { location.hash = 'historyPanel'; }); // history tab removed (UX-13); same route as the dialog/menu history action
  await expect(page.locator('#historyPanel')).toBeVisible();
  await page.locator('#referenceDashboard .main-nav button[data-view="detail"]').click();
  await expect(page.locator('#historyPanel')).toBeHidden();
  expect(await page.evaluate(() => document.getElementById('historyPanel').classList.contains('hidden'))).toBe(true);
  await page.locator('[data-tab="table"]').click();
  const row = page.locator('#tblBody tr').first();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#systemDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#systemDialog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('#tblBody tr') ? 'row' : document.activeElement?.tagName)).toBe('row');
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-UX-12: exec/detail nav from a manage tab leaves the manage hash and survives reload', async ({page}) => {
  await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
  const nav = v => page.locator(`#referenceDashboard .main-nav button[data-view="${v}"]`);
  await nav('manage').click();
  await page.locator('#view-manage .manage-tab[data-manage-tab="techniciansPanel"]').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#techniciansPanel');
  await nav('exec').click();
  await expect(page.locator('#view-exec')).toBeVisible();
  await expect(page.locator('#techniciansPanel')).toBeHidden();
  expect(await page.evaluate(() => location.hash)).toBe('#overview');
  await page.reload();
  await expect(page.locator('#view-exec')).toBeVisible();
  await expect(page.locator('#view-manage')).toBeHidden();
  // detail: back into history, then detail
  await nav('manage').click();
  await page.evaluate(() => { location.hash = 'historyPanel'; }); // history tab removed (UX-13); same route as the dialog/menu history action
  await nav('detail').click();
  await expect(page.locator('#view-detail')).toBeVisible();
  await expect(page.locator('#historyPanel')).toBeHidden();
  expect(await page.evaluate(() => /^#(historyPanel|techniciansPanel)$/.test(location.hash))).toBe(false);
  await page.reload();
  await expect(page.locator('#view-manage')).toBeHidden();
  await expect(page.locator('#historyPanel')).toBeHidden();
});

test('CANDIDATE-UX-12: leaving the manage list tab via exec/detail nav survives reload', async ({page}) => {
  await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
  const nav = v => page.locator(`#referenceDashboard .main-nav button[data-view="${v}"]`);
  for (const target of ['exec', 'detail']) {
    await nav('manage').click();
    await expect(page.locator('#view-manage #systemsTableBody tr').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#technicianManagementSection');
    await nav(target).click();
    await expect(page.locator(`#view-${target}`)).toBeVisible();
    expect(await page.evaluate(() => /^#(technicianManagementSection|watchlist)$/.test(location.hash))).toBe(false);
    await page.reload();
    await expect(page.locator('#referenceDashboard')).toBeVisible();
    await expect(page.locator('#view-manage')).toBeHidden();
  }
  await page.goto('https://reference.test/technician/#watchlist');
  await expect(page.locator('#view-manage')).toBeVisible();
  await nav('exec').click();
  await expect(page.locator('#view-exec')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('#overview');
});

test('CANDIDATE-UX-12: row history action moves focus to the history system id field', async ({page}) => {
  await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await page.locator('#view-manage #systemsTableBody tr').filter({hasText: 'ระบบทดสอบหนึ่ง'}).locator('[data-action-trigger]').click();
  await page.locator('#systemActionMenu button[data-action="history"]').click();
  await expect(page.locator('#historySystemId')).toHaveValue('s1');
  await expect(page.locator('#historySystemId')).toBeFocused();
});

test('CANDIDATE-UX-12: Enter on rows and row controls without UPDATE_SYSTEM never opens the edit dialog', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, []);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  const row = page.locator('#view-manage #systemsTableBody tr[data-system-id="s1"]');
  await expect(row).toBeVisible();
  for (const sel of ['[data-action-trigger]', 'button']) {
    await row.locator(sel).first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator('#editDialog')).not.toBeVisible();
  }
  await page.evaluate(() => document.querySelector('#referenceDashboard .main-nav button[data-view="detail"]').click());
  await page.locator('[data-tab="table"]').click();
  await page.locator('#tblBody tr').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#systemDialog')).toBeVisible();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  await expect(page.locator('#editSystemButton')).toBeDisabled();
  expect(evidence.errors).toEqual([]);
});

async function loginWithHistory(page, historyFor) {
  const user = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  const evidence = await openReference(page, {
    technician: true,
    user,
    respond: (env, def) => {
      if (env.action === 'data.dashboard') return {success: true, data: {...def.data, waterSystems: def.data.waterSystems.map(w => ({...w, managementMutable: true}))}};
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user, permissions: ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      }
      if (env.action === 'data.entityHistory') {
        const id = env.payload?.request?.entityId;
        return {success: true, data: {history: historyFor(id)}};
      }
      return undefined;
    }
  });
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  return evidence;
}
const syntheticHistory = [{auditId: 'A-1', action: 'SYSTEM_UPDATE', username: 'admin', role: 'ADMIN', timestamp: '2026-11-01T00:00:00Z', changedFields: ['system_name'], reason: ''}];

test('CANDIDATE-UX-13: manage view no longer shows an edit-history tab', async ({page}) => {
  await loginWithHistory(page, () => []);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage .manage-tab')).toHaveCount(2);
  await expect(page.locator('#view-manage .manage-tab[data-manage-tab="historyPanel"]')).toHaveCount(0);
});

test('CANDIDATE-UX-13: system dialog shows "ดูประวัติ" only when the system has history, and it opens the history panel', async ({page}) => {
  const evidence = await loginWithHistory(page, id => id === 's1' ? syntheticHistory : []);
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await page.locator('#view-manage #systemsTableBody tr').filter({hasText: 's2'}).locator('[data-action-trigger]').click();
  await page.locator('#systemActionMenu [data-action="view"]').click();
  await expect(page.locator('#systemDialog')).toBeVisible();
  await expect.poll(() => evidence.calls.filter(c => c.action === 'data.entityHistory' && c.payload?.request?.entityId === 's2').length).toBe(1);
  await expect(page.locator('#referenceHistoryButton')).toBeHidden();
  const probe = evidence.calls.find(c => c.action === 'data.entityHistory' && c.payload?.request?.entityId === 's2');
  expect(probe.payload.request.limit).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#systemDialog')).toBeHidden();
  await page.locator('#view-manage #systemsTableBody tr').filter({hasText: 's1'}).locator('[data-action-trigger]').click();
  await page.locator('#systemActionMenu [data-action="view"]').click();
  await expect(page.locator('#referenceHistoryButton')).toBeVisible();
  await page.locator('#referenceHistoryButton').click();
  await expect(page.locator('#view-manage #historyPanel')).toBeVisible();
  await expect(page.locator('#historySystemId')).toHaveValue('s1');
  await expect(page.locator('#historyList')).toContainText('admin');
  expect(evidence.errors).toEqual([]);
});

// ---- CANDIDATE-MINOR fixes ----
for (const tab of ['compare', 'insight', 'table', 'vtable', 'problem']) test(`CANDIDATE-MINOR-1: Public detail tab ${tab} meets WCAG AA color-contrast`, async ({page}) => {
  const evidence = await openReference(page, {dataset: fixture});
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
  await expect(page.locator(`#panel-${tab}`)).toBeVisible();
  await page.waitForTimeout(900); // let the tab fade-in finish so axe sees final colours
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('body').withRules(['color-contrast']).analyze();
  expect(result.violations, contrastReport(result.violations)).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-MINOR-1: Technician manage view and detail tabs meet WCAG AA color-contrast', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const failures = [];
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage .manage-tabs')).toBeVisible();
  for (const tab of ['list', 'techniciansPanel']) {
    await page.evaluate(t => document.querySelector(`#view-manage .manage-tab[data-manage-tab="${t}"]`)?.click(), tab);
    await page.waitForTimeout(900);
    const r = await new AxeBuilder({page}).include('#view-manage').withRules(['color-contrast']).analyze();
    if (r.violations.length) failures.push(tab + ': ' + contrastReport(r.violations));
  }
  await page.locator('#referenceDashboard .main-nav button[data-view="detail"]').click();
  for (const tab of ['compare', 'insight', 'table', 'vtable', 'problem']) {
    await page.locator(`.tab-btn[data-tab="${tab}"]`).click();
    await page.waitForTimeout(900);
    const r = await new AxeBuilder({page}).include('#referenceDashboard').withRules(['color-contrast']).analyze();
    if (r.violations.length) failures.push('detail ' + tab + ': ' + contrastReport(r.violations));
  }
  expect(failures.join(' || ')).toBe('');
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-MINOR-3: session resume title wraps to at most 2 lines at 375px without horizontal overflow', async ({page}) => {
  const user = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.setViewportSize({width: 375, height: 812});
  await page.addInitScript(() => sessionStorage.setItem('vws_management_token_v2', 'MGT-' + 'a'.repeat(64)));
  const evidence = await openReference(page, {technician: true, user, respond: async (env) => {
    if (env.action === 'data.bootstrap') {
      await gate;
      return {success: true, data: {user, permissions: ['UPDATE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
    }
    return undefined;
  }});
  await expect(page.locator('#bootView')).toBeVisible();
  const m = await page.locator('#bootView .resume-brand h1').evaluate(el => {
    const cs = getComputedStyle(el);
    return {lines: Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight)), fontSize: cs.fontSize, scrollWidth: document.documentElement.scrollWidth};
  });
  expect(m.lines, JSON.stringify(m)).toBeLessThanOrEqual(2);
  expect(m.scrollWidth, JSON.stringify(m)).toBeLessThanOrEqual(375);
  release();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-MINOR-5: technician scope matches village ids across number/string types without widening districts', async ({page}) => {
  const techUser = {user_id: 'tech-a', username: 'tech-jun', displayName: 'ช่างจุน', role: 'TECHNICIAN', district: 'จุน', mustChangePassword: false};
  await openReference(page, {
    technician: true,
    respond: (env) => {
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: techUser}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user: techUser, permissions: ['UPDATE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      }
      if (env.action === 'data.dashboard') {
        return {success: true, data: {
          generatedAt: '2026-11-16T00:00:00Z',
          villages: [{village_id: 101, village_name: 'บ้านเลขจุน', district: 'จุน'}, {village_id: 202, village_name: 'บ้านเลขเชียงคำ', district: 'เชียงคำ'}],
          waterSystems: [
            {system_id: 's-num', village_id: '101', system_name: 'ระบบเลขจุน', operational_status: 'WORKING', publicVisible: true},
            {system_id: 's-other', village_id: '202', system_name: 'ระบบเชียงคำ', operational_status: 'WORKING', publicVisible: true}
          ],
          waterSources: []
        }};
      }
      return {success: true, data: {}};
    }
  });
  await page.locator('#loginUsername').fill('tech-jun');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ จาก 1');
  const selection = await page.evaluate(() => window.VWSReferenceTechnician.getSelection());
  expect(selection.waterSystems.map(s => s.system_id)).toEqual(['s-num']);
});

test('CANDIDATE-MINOR-6: focusable problem rows announce their action via aria-describedby without an interactive role', async ({page}) => {
  const evidence = await openReference(page, {dataset: fixture});
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="problem"]').click();
  const row = page.locator('#probBody tr.dmg-row[tabindex]').first();
  await expect(row).toBeVisible();
  const info = await row.evaluate(el => {
    const id = el.getAttribute('aria-describedby');
    const target = id ? document.getElementById(id) : null;
    return {id, text: target?.textContent.trim() ?? null, inPanel: !!target?.closest('#panel-problem'), role: el.getAttribute('role')};
  });
  expect(info.text, JSON.stringify(info)).toBe('กด Enter เพื่อดูตำแหน่งบนแผนที่หรือรายละเอียดระบบ');
  expect(info.inPanel).toBe(true);
  expect(info.role).toBeNull();
  const {default: AxeBuilder} = await import('@axe-core/playwright');
  const result = await new AxeBuilder({page}).include('#panel-problem').withRules(['nested-interactive', 'aria-valid-attr-value', 'duplicate-id']).analyze();
  expect(result.violations.map(v => v.id)).toEqual([]);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-MINOR-5: empty village ids never widen technician scope', async ({page}) => {
  const techUser = {user_id: 'tech-a', username: 'tech-jun', displayName: 'ช่างจุน', role: 'TECHNICIAN', district: 'จุน', mustChangePassword: false};
  await openReference(page, {
    technician: true,
    respond: (env) => {
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: techUser}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') {
        return {success: true, data: {user: techUser, permissions: ['UPDATE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      }
      if (env.action === 'data.dashboard') {
        return {success: true, data: {
          generatedAt: '2026-11-16T00:00:00Z',
          villages: [{village_id: '', village_name: 'บ้านไม่มีรหัส', district: 'จุน'}, {village_id: 'v1', village_name: 'บ้านหนึ่ง', district: 'จุน'}],
          waterSystems: [
            {system_id: 's-v1', village_id: 'v1', system_name: 'ระบบจุน', operational_status: 'WORKING', publicVisible: true},
            {system_id: 's-empty', village_id: '', system_name: 'ระบบไม่มีรหัส', operational_status: 'WORKING', publicVisible: true, village: {village_name: 'บ้านเชียงคำ', district: 'เชียงคำ'}}
          ],
          waterSources: []
        }};
      }
      return {success: true, data: {}};
    }
  });
  await page.locator('#loginUsername').fill('tech-jun');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  const selection = await page.evaluate(() => window.VWSReferenceTechnician.getSelection());
  expect(selection.waterSystems.map(s => s.system_id)).toEqual(['s-v1']);
});

async function expectRefreshInHeaderRow(page, buttonSel, titleSel, width) {
  const btn = page.locator(buttonSel);
  await expect(btn).toBeVisible();
  const m = await page.evaluate(([b, t]) => {
    const el = document.querySelector(b), title = document.querySelector(t);
    const header = el.closest('.app-header'), nav = header.querySelector('.main-nav');
    const r = el.getBoundingClientRect(), tr = title.getBoundingClientRect();
    return {scroll: el.scrollWidth, client: el.clientWidth, top: r.top, bottom: r.bottom, titleTop: tr.top, titleHeight: tr.height,
      navBottom: nav.getBoundingClientRect().bottom, headerOverflow: header.scrollWidth - header.clientWidth,
      label: el.getAttribute('aria-label'), right: r.right,
      padL: parseFloat(getComputedStyle(el).paddingLeft), padR: parseFloat(getComputedStyle(el).paddingRight)};
  }, [buttonSel, titleSel]);
  expect(m.headerOverflow).toBeLessThanOrEqual(1);
  if (width >= 1000) {
    expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
    expect(m.padL).toBeGreaterThanOrEqual(8);
    expect(m.padR).toBeGreaterThanOrEqual(8);
  } else {
    expect(Math.abs(m.top - m.titleTop)).toBeLessThan(m.titleHeight);
    expect(m.top).toBeLessThan(m.navBottom);
    expect(m.right).toBeLessThanOrEqual(width);
    expect(m.label).toBe('รีเฟรชข้อมูล');
  }
}

for (const vp of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test(`CANDIDATE-POLISH-1: public refresh button sits in the header row without wrapping or clipping at ${vp.width}`, async ({page}) => {
    await page.setViewportSize(vp);
    let mockLoads = 0;
    page.on('request', r => { if (r.url().includes('/data/mock/')) mockLoads++; });
    const evidence = await openReference(page);
    await expect(page.locator('#efCount')).toContainText('2 ระบบ');
    await expectRefreshInHeaderRow(page, '#btnRefresh', '.app-header .header-brand .eyebrow', vp.width);
    const before = mockLoads;
    await page.locator('#btnRefresh').click();
    await expect.poll(() => mockLoads).toBeGreaterThan(before);
    expect(evidence.errors).toEqual([]);
  });

  test(`CANDIDATE-POLISH-1: technician refresh button sits in the header row without wrapping or clipping at ${vp.width}`, async ({page}) => {
    await page.setViewportSize(vp);
    const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
    const evidence = await loginManagement(page, admin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
    await expectRefreshInHeaderRow(page, '#referenceDashboard #refreshButton', '#referenceDashboard .app-header .header-brand h1', vp.width);
    const count = () => evidence.calls.filter(c => c.action === 'data.dashboard').length;
    const before = count();
    await page.locator('#referenceDashboard #refreshButton').click();
    await expect.poll(count).toBe(before + 1);
    expect(evidence.errors).toEqual([]);
  });
}

for (const vp of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test(`CANDIDATE-POLISH-2: manage view content sits inside Reference cards with inner padding at ${vp.width}`, async ({page}) => {
    await page.setViewportSize(vp);
    const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
    const evidence = await loginManagement(page, admin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
    await expect(page.locator('#view-exec .kpi-card').first()).toBeVisible();
    const execLeft = await page.evaluate(() => document.querySelector('#view-exec .kpi-card').getBoundingClientRect().left);
    await page.locator('.main-nav [data-view="manage"]').click();
    const measure = sel => page.evaluate(s => {
      const sec = document.querySelector(s), cs = getComputedStyle(sec), r = sec.getBoundingClientRect();
      const h = sec.querySelector('h2'), hr = h.getBoundingClientRect();
      return {bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius), left: r.left, headingGap: hr.left - r.left, padL: parseFloat(cs.paddingLeft), pageOverflow: document.documentElement.scrollWidth - innerWidth};
    }, sel);
    const check = (m, label) => {
      expect.soft(m.bg, `${label} background`).toBe('rgb(255, 255, 255)');
      expect.soft(m.radius, `${label} radius`).toBeGreaterThanOrEqual(12);
      expect.soft(m.headingGap, `${label} heading inset`).toBeGreaterThanOrEqual(14);
      expect.soft(Math.abs(m.left - execLeft), `${label} left vs exec card (${m.left} vs ${execLeft})`).toBeLessThanOrEqual(2);
      expect.soft(m.pageOverflow, `${label} page overflow`).toBeLessThanOrEqual(1);
    };
    await expect(page.locator('#watchlist')).toBeVisible();
    const audit = async label => {
      const r = await page.evaluate(() => {
        const vis = el => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden'; };
        const flush = [], offPalette = [];
        document.querySelectorAll('#view-manage button, #view-manage a[role="button"], #view-manage .btn').forEach(el => {
          if (!vis(el) || !el.textContent.trim() || el.matches('.system-action-trigger, .system-map-button, #manageMap .leaflet-control a')) return; // icon-only 44x44 buttons and Leaflet +/- map controls (POLISH-3) are exempt
          const cs = getComputedStyle(el);
          if (parseFloat(cs.paddingLeft) < 8 || parseFloat(cs.paddingRight) < 8) flush.push((el.id || el.className) + ' pad ' + cs.paddingLeft + '/' + cs.paddingRight);
        });
        document.querySelectorAll('#view-manage *').forEach(el => {
          if (!vis(el)) return;
          const cs = getComputedStyle(el);
          const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', {willReadFrequently: true});
          const norm = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return d[3] ? `rgb(${d[0]}, ${d[1]}, ${d[2]})` : 'rgba(0, 0, 0, 0)'; };
          const skyBlue = c0 => { const c = c0.includes('rgb(') || c0.includes('rgba(') ? c0 : norm(c0); const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/); if (!m || (m[4] !== undefined && +m[4] === 0)) return false; const [r, g, b] = [+m[1] / 255, +m[2] / 255, +m[3] / 255]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d || l > 0.45) return false; const sat = d / (1 - Math.abs(2 * l - 1)); const h = mx === r ? ((g - b) / d + 6) % 6 * 60 : mx === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60; return sat > 0.5 && h >= 185 && h <= 215; };
          const bad = ['color', 'backgroundColor', 'borderTopColor'].filter(k => cs[k] === 'rgb(3, 105, 161)' || skyBlue(cs[k]));
          if (bad.length) offPalette.push((el.id || el.className || el.tagName) + ' ' + bad.join());
        });
        return {flush, offPalette};
      });
      expect.soft(r.flush, label + ' text buttons need >=8px side padding').toEqual([]);
      expect.soft(r.offPalette, label + ' off-palette rgb(3,105,161)').toEqual([]);
    };
    await audit('list');
    check(await measure('#watchlist'), 'list #watchlist');
    await page.locator('.manage-tab[data-manage-tab="techniciansPanel"]').click();
    await expect(page.locator('#techniciansPanel')).toBeVisible();
    check(await measure('#techniciansPanel'), 'accounts #techniciansPanel');
    await audit('accounts');
    expect(evidence.errors).toEqual([]);
  });

  test(`CANDIDATE-POLISH-2: toasts are compact Reference-styled boxes at ${vp.width}`, async ({page}) => {
    await page.setViewportSize(vp);
    const admin = {user_id: 'admin-1', username: 'admin', displayName: 'ผู้ดูแล', role: 'ADMIN', district: '', mustChangePassword: false};
    const evidence = await loginManagement(page, admin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM', 'MANAGE_TECHNICIANS']);
    const {default: AxeBuilder} = await import('@axe-core/playwright');
    const maxW = vp.width >= 768 ? 360 : vp.width - 32;
    const box = async (sel, label) => {
      const loc = page.locator(sel).first();
      await expect(loc).toBeVisible();
      await page.waitForTimeout(500);
      const m = await loc.evaluate(el => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        const t = el.querySelector('.swal2-title') || el;
        return {w: r.width, h: r.height, fs: parseFloat(getComputedStyle(t).fontSize), right: r.right, bottom: r.bottom};
      });
      expect.soft(m.w, `${label} width`).toBeLessThanOrEqual(maxW + 0.5);
      expect.soft(m.h, `${label} height`).toBeLessThanOrEqual(96);
      expect.soft(m.fs, `${label} font-size`).toBe(14);
      expect.soft(m.right, `${label} right edge`).toBeLessThanOrEqual(vp.width);
      const result = await new AxeBuilder({page}).include(sel).withRules(['color-contrast']).analyze();
      expect.soft(result.violations, `${label} contrast ${contrastReport(result.violations)}`).toEqual([]);
    };
    await page.evaluate(() => window.VWSTechnicianUI.whenIdle());
    await page.waitForTimeout(600);
    // SweetAlert toast path
    await page.evaluate(() => window.VWSTechnicianUI.showWarning('ทดสอบการแจ้งเตือน'));
    await box('.technician-swal-toast', 'swal toast');
    await page.waitForTimeout(4600);
    // Inline toast path (while a busy operation is active)
    await page.evaluate(() => { window.__op = window.VWSTechnicianUI.showLoading('x'); window.VWSTechnicianUI.showWarning('ทดสอบการแจ้งเตือนแบบอินไลน์'); });
    await box('#toastRegion .toast', 'inline toast');
    await page.evaluate(() => window.VWSTechnicianUI.closeLoading(window.__op));
    expect(evidence.errors).toEqual([]);
  });
}

// ---------- CANDIDATE-POLISH-3: Leaflet map inside the manage view (A1) ----------
const polishTech = {user_id: 'tech-a', username: 'tech-jun', displayName: 'ช่างจุน', role: 'TECHNICIAN', district: 'จุน', mustChangePassword: false};
// Counts systems shown on the manage map: single markers plus the child count printed on cluster pins.
const manageMarkerCount = page => page.evaluate(() => {
  const m = document.querySelector('#manageMap');
  if (!m) return -1;
  const singles = m.querySelectorAll('.leaflet-marker-icon .dvicon-wrap').length;
  const clustered = [...m.querySelectorAll('.leaflet-marker-icon .mc-pin span')].reduce((a, s) => a + Number(s.textContent.replace(/\D/g, '') || 0), 0);
  return singles + clustered;
});
async function openManageList(page) {
  await page.locator('#referenceDashboard .main-nav button[data-view="manage"]').click();
  await expect(page.locator('#view-manage')).toBeVisible();
  await expect(page.locator('#manageMap')).toBeVisible();
}

test('CANDIDATE-POLISH-3: manage map shows one marker per filtered system with coordinates', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await openManageList(page);
  await expect(page.locator('#manageMap')).toHaveAttribute('role', 'region');
  await expect.poll(() => manageMarkerCount(page)).toBe(2);
  await page.locator('#searchInput').fill('s1');
  await expect(page.locator('#systemsTableBody tr')).toHaveCount(1);
  await expect.poll(() => manageMarkerCount(page)).toBe(1);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: row map button zooms on the manage map without leaving the manage view', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await openManageList(page);
  await expect.poll(() => manageMarkerCount(page)).toBe(2);
  await page.locator('#systemsTableBody tr[data-system-id="s1"] .system-map-button').click();
  await expect(page.locator('#manageMap .leaflet-popup-content')).toContainText('ระบบทดสอบหนึ่ง');
  await expect(page.locator('#view-manage')).toBeVisible();
  await expect(page.locator('#view-exec')).toBeHidden();
  await page.waitForTimeout(400);
  await expect(page.locator('.technician-swal-toast, #toastRegion .toast')).toHaveCount(0);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: popup actions open detail and edit dialogs per permission', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await openManageList(page);
  await expect.poll(() => manageMarkerCount(page)).toBe(2);
  const mapButton = page.locator('#systemsTableBody tr[data-system-id="s1"] .system-map-button');
  await mapButton.click();
  const popup = page.locator('#manageMap .leaflet-popup-content');
  await popup.getByRole('button', {name: 'รายละเอียด'}).click();
  await expect(page.locator('#systemDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#systemDialog')).toBeHidden();
  await mapButton.click();
  await popup.getByRole('button', {name: 'แก้ไข'}).click();
  await expect(page.locator('#editDialog')).toBeVisible();
  expect(evidence.errors).toEqual([]);

  const page2 = await page.context().newPage();
  const evidence2 = await loginManagement(page2, uxAdmin, []);
  await openManageList(page2);
  await expect.poll(() => manageMarkerCount(page2)).toBe(2);
  await page2.locator('#systemsTableBody tr[data-system-id="s1"] .system-map-button').click();
  const popup2 = page2.locator('#manageMap .leaflet-popup-content');
  await expect(popup2.getByRole('button', {name: 'รายละเอียด'})).toBeVisible();
  await expect(popup2.getByRole('button', {name: 'แก้ไข'})).toHaveCount(0);
  expect(evidence2.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: district technician map shows only own-district markers', async ({page}) => {
  const evidence = await loginManagement(page, polishTech, ['UPDATE_SYSTEM']);
  await openManageList(page);
  await expect(page.locator('#systemsTableBody tr')).toHaveCount(1);
  await expect.poll(() => manageMarkerCount(page)).toBe(1);
  await page.waitForTimeout(300);
  expect(await manageMarkerCount(page)).toBe(1);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: logout-switch leaves a single manage map with only the new user markers', async ({page}) => {
  let current = uxAdmin;
  const evidence = await openReference(page, {
    technician: true,
    user: uxAdmin,
    respond: (env, def) => {
      if (env.action === 'auth.login') { current = env.payload?.username === 'tech-jun' ? polishTech : uxAdmin; return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: current}}; }
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') return {success: true, data: {user: current, permissions: current === uxAdmin ? ['UPDATE_SYSTEM', 'DELETE_SYSTEM'] : ['UPDATE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      // Backend scopes the technician dataset to the own district (as in the UX-09 logout test).
      if (env.action === 'data.dashboard') { const own = current === polishTech; return {success: true, data: {...def.data, villages: own ? def.data.villages.slice(0, 1) : def.data.villages, waterSystems: (own ? def.data.waterSystems.slice(0, 1) : def.data.waterSystems).map(w => ({...w, managementMutable: true}))}}; }
      if (env.action === 'accounts.list' || env.action === 'technicians.list') return {success: true, data: {items: []}};
      return undefined;
    }
  });
  const login = async name => {
    await page.locator('#loginUsername').fill(name);
    await page.locator('#loginPassword').fill('pass');
    await page.locator('#loginSubmit').click();
    await expect(page.locator('#referenceDashboard')).toBeVisible();
  };
  await login('admin');
  await openManageList(page);
  await expect.poll(() => manageMarkerCount(page)).toBe(2);
  await page.locator('#mobileAccountButton').click();
  await page.locator('#logoutButton').click();
  await expect(page.locator('#loginView')).toBeVisible();
  await login('tech-jun');
  await openManageList(page);
  await expect(page.locator('#systemsTableBody tr')).toHaveCount(1);
  await expect.poll(() => manageMarkerCount(page)).toBe(1);
  await expect(page.locator('#manageMap .leaflet-container')).toHaveCount(1);
  await expect(page.locator('#view-manage .leaflet-container')).toHaveCount(1);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: empty-filter search leaves an empty map without errors and no row map buttons', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await openManageList(page);
  await expect.poll(() => manageMarkerCount(page)).toBe(2);
  await page.locator('#searchInput').fill('zzz');
  await expect(page.locator('#systemsTableBody .system-map-button')).toHaveCount(0);
  await expect.poll(() => manageMarkerCount(page)).toBe(0);
  await expect(page.locator('#manageMap .leaflet-container')).toHaveCount(1);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: filtered-out system focus returns false and warns without changing view', async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await openManageList(page);
  await expect.poll(() => manageMarkerCount(page)).toBe(2);
  await page.locator('#searchInput').fill('s1');
  await expect.poll(() => manageMarkerCount(page)).toBe(1);
  expect(await page.evaluate(() => window.VWSReferenceTechnician.focusManageMap('s2'))).toBe(false);
  expect(await page.evaluate(() => window.VWSReferenceTechnician.focusManageMap('s1'))).toBe(true);
  await expect(page.locator('#view-manage')).toBeVisible();
  // handleSystemAction path: the row is still listed but the map no longer holds its marker.
  await page.locator('#searchInput').fill('s2');
  await expect(page.locator('#systemsTableBody tr[data-system-id="s2"]')).toHaveCount(1);
  await page.evaluate(() => window.VWSReferenceTechnician.syncManageMap([]));
  await page.locator('#systemsTableBody tr[data-system-id="s2"] .system-map-button').click();
  await expect(page.getByText('ระบบนี้ถูกกรองออกจากรายการปัจจุบัน').first()).toBeVisible();
  await expect(page.locator('#view-manage')).toBeVisible();
  await expect(page.locator('#view-exec')).toBeHidden();
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: mobile-scroll wheel over the 390px manage map scrolls the page to the list', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await openManageList(page);
  await expect.poll(() => manageMarkerCount(page)).toBe(2);
  const height = await page.locator('#manageMap').evaluate(el => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(220);
  expect(height).toBeLessThanOrEqual(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await page.locator('#manageMap').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  expect(await page.evaluate(([px, py]) => Boolean(document.elementFromPoint(px, py)?.closest('#manageMap')), [x, y])).toBe(true);
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 100);
  await expect(page.locator('#searchInput')).toBeInViewport();
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: refresh-updates keeps one manage map and redraws the markers', async ({page}) => {
  // First data.dashboard returns 2 systems; every later one (the refresh) returns only s1, so the map must redraw to 1 marker.
  let dashboards = 0;
  const evidence = await openReference(page, {
    technician: true,
    user: uxAdmin,
    respond: (env, def) => {
      if (env.action === 'auth.login') return {success: true, data: {token: 'MGT-' + 'a'.repeat(64), user: uxAdmin}};
      if (env.action === 'auth.me' || env.action === 'data.bootstrap') return {success: true, data: {user: uxAdmin, permissions: ['UPDATE_SYSTEM', 'DELETE_SYSTEM'], featureFlags: {managementRead: true, technicianDistrictScope: true}, enumCatalog: {}}};
      if (env.action === 'data.dashboard') { dashboards++; const systems = dashboards === 1 ? def.data.waterSystems : def.data.waterSystems.slice(0, 1); return {success: true, data: {...def.data, waterSystems: systems.map(w => ({...w, managementMutable: true}))}}; }
      if (env.action === 'accounts.list' || env.action === 'technicians.list') return {success: true, data: {items: []}};
      return undefined;
    }
  });
  await page.locator('#loginUsername').fill('admin');
  await page.locator('#loginPassword').fill('pass');
  await page.locator('#loginSubmit').click();
  await expect(page.locator('#referenceDashboard')).toBeVisible();
  await openManageList(page);
  await expect.poll(() => manageMarkerCount(page)).toBe(2);
  const before = dashboards;
  await page.locator('#referenceDashboard #refreshButton').click();
  await expect.poll(() => dashboards).toBe(before + 1);
  await expect(page.locator('#view-manage')).toBeVisible();
  await expect(page.locator('#systemsTableBody tr')).toHaveCount(1);
  await expect.poll(() => manageMarkerCount(page)).toBe(1);
  await page.waitForTimeout(300);
  expect(await manageMarkerCount(page)).toBe(1);
  await expect(page.locator('#manageMap .leaflet-container')).toHaveCount(1);
  expect(evidence.errors).toEqual([]);
});

test('CANDIDATE-POLISH-3: compact popup buttons are fully visible and clickable inside the map at 390 and 1440', async ({page}) => {
  for (const vp of [{width: 390, height: 844}, {width: 1440, height: 900}]) {
    await page.setViewportSize(vp);
    if (vp.width === 390) await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
    else await page.locator('#manageMap .leaflet-popup-close-button').click();
    if (vp.width === 390) await openManageList(page);
    await expect.poll(() => manageMarkerCount(page)).toBe(2);
    const sel = vp.width < 768 ? '#systemsMobileList [data-system-id="s1"] .system-map-button' : '#systemsTableBody tr[data-system-id="s1"] .system-map-button';
    await page.locator(sel).click();
    await expect(page.locator('#manageMap .leaflet-popup-content [data-manage-action="edit"]')).toBeVisible();
    await page.waitForTimeout(900); // smooth scroll + popup autopan settle
    const m = await page.evaluate(() => {
      const map = document.querySelector('#manageMap').getBoundingClientRect();
      const popup = document.querySelector('#manageMap .leaflet-popup').getBoundingClientRect();
      const zoom = document.querySelector('#manageMap .leaflet-control-zoom').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('#manageMap .leaflet-popup-content [data-manage-action]')].map(b => {
        const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return {action: b.dataset.manageAction, hittable: document.elementFromPoint(x, y)?.closest('[data-manage-action]') === b,
          inside: r.left >= map.left - 0.5 && r.right <= map.right + 0.5 && r.top >= map.top - 0.5 && r.bottom <= map.bottom + 0.5};
      });
      const overlap = !(popup.right <= zoom.left || popup.left >= zoom.right || popup.bottom <= zoom.top || popup.top >= zoom.bottom);
      return {buttons, overlap};
    });
    expect(m.buttons.map(b => b.action), JSON.stringify(m)).toEqual(['detail', 'edit']);
    for (const b of m.buttons) {
      expect(b.hittable, `${vp.width} ${b.action} hittable ${JSON.stringify(m)}`).toBe(true);
      expect(b.inside, `${vp.width} ${b.action} inside map ${JSON.stringify(m)}`).toBe(true);
    }
    expect(m.overlap, `${vp.width} popup overlaps zoom control`).toBe(false);
    await expect(page.locator('#manageMap .leaflet-popup-content')).toContainText('ระบบทดสอบหนึ่ง');
  }
});

for (const key of ['Enter', 'Space']) test(`CANDIDATE-POLISH-3: keyboard ${key} on the detail nav from the manage view opens the detail view`, async ({page}) => {
  const evidence = await loginManagement(page, uxAdmin, ['UPDATE_SYSTEM', 'DELETE_SYSTEM']);
  await openManageList(page);
  await page.locator('#referenceDashboard .main-nav button[data-view="detail"]').focus();
  await page.keyboard.press(key);
  await expect(page.locator('#view-detail')).toBeVisible();
  await expect(page.locator('#view-manage')).toBeHidden();
  await page.waitForTimeout(300);
  await expect(page.locator('#view-detail')).toBeVisible();
  expect(await page.evaluate(() => /^#(technicianManagementSection|watchlist)$/.test(location.hash))).toBe(false);
  expect(evidence.errors).toEqual([]);
});
