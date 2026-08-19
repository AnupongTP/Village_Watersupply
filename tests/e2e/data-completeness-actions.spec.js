import { test, expect } from '@playwright/test';
import { installMockData, openDashboard } from './helpers.js';

function buildFixture(systemCount = 21, { firstCoordinateAt = 20 } = {}) {
  const villages = [
    {
      village_id: 'PY-V-9001', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน',
      village_name: 'บ้านทดสอบระบบ', has_village_waterworks: true
    },
    {
      village_id: 'PY-V-9002', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน',
      village_name: 'บ้านไม่มีรายละเอียดระบบ', has_village_waterworks: true, village_no: 9
    }
  ];

  const waterSystems = Array.from({ length: systemCount }, (_, index) => {
    const number = index + 1;
    const hasCoordinate = number >= firstCoordinateAt;
    return {
      system_id: `PY-W-${String(900000 + number).padStart(6, '0')}`,
      village_id: 'PY-V-9001',
      system_name: `ระบบประปาทดสอบ ${number}`,
      latitude: hasCoordinate ? 19.31 + number / 10000 : '',
      longitude: hasCoordinate ? 100.16 + number / 10000 : '',
      operational_status: 'WORKING',
      drinking_water_quality: 'PASS',
      water_quantity: 'SUFFICIENT',
      households_served: 50,
      owner_type: 'LOCAL_AUTHORITY',
      responsible_agency: 'เทศบาลตำบลจุน',
      system_type: 'GROUNDWATER_SMALL',
      water_source_type: 'GROUNDWATER',
      capacity_m3_hr: 250 + number,
      usage_type: 'DOMESTIC',
      construction_year_be: 2560,
      utility_water_quality: 'USABLE',
      shared_with_other_village: 'NO',
      establishment_type: 'LOCAL_CREATED',
      transfer_document_status: 'NO_DATA'
    };
  });

  return { villages, waterSystems, waterSources: [] };
}

async function openIssues(page) {
  await page.locator('#btnOpenDataIssues').click();
  await expect(page.locator('.swal2-title')).toHaveText('รายละเอียดความครบถ้วนของข้อมูล');

  // Real SweetAlert2 animates the popup with a scale transform. Geometry captured
  // during that animation is intentionally smaller/moving, so wait for the popup's
  // own animations before asserting its final responsive layout.
  await page.locator('.data-completeness-popup').evaluate(async element => {
    const animations = element.getAnimations();
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
  });
}

test('each issue section shows at most 20 rows and only sections above 20 expose show-more', async ({ page }) => {
  await installMockData(page, buildFixture());
  await openDashboard(page);
  await openIssues(page);

  const missing = page.locator('[data-issue-section="coordMissing"]');
  await expect(missing).toHaveAttribute('data-visible-count', '19');
  await expect(missing.locator('[data-issue-list] .issue-modal-row')).toHaveCount(19);
  await expect(missing.locator('[data-issue-more]')).toHaveCount(0);
  await expect(missing.locator('.issue-modal-footer')).toHaveCount(0);

  const outlier = page.locator('[data-issue-section="capacityOutlier"]');
  await expect(outlier).toHaveAttribute('data-visible-count', '20');
  await expect(outlier.locator('[data-issue-list] .issue-modal-row')).toHaveCount(20);
  await expect(outlier.locator('[data-issue-status]')).toHaveText('แสดง 20 จาก 21 รายการ');
  await expect(outlier.locator('[data-issue-more]')).toContainText('แสดงเพิ่มเติม');

  await outlier.locator('[data-issue-more]').click();
  await expect(outlier).toHaveAttribute('data-visible-count', '21');
  await expect(outlier.locator('[data-issue-list] .issue-modal-row')).toHaveCount(21);
  await expect(outlier.locator('[data-issue-status]')).toHaveText('แสดง 21 จาก 21 รายการ');
  await expect(outlier.locator('[data-issue-more]')).toHaveCount(0);
});


test('exactly 20 rows does not render show-more', async ({ page }) => {
  await installMockData(page, buildFixture(21, { firstCoordinateAt: 21 }));
  await openDashboard(page);
  await openIssues(page);

  const exactlyTwenty = page.locator('[data-issue-section="coordMissing"]');
  await expect(exactlyTwenty.locator('[data-issue-list] .issue-modal-row')).toHaveCount(20);
  await expect(exactlyTwenty.locator('[data-issue-status]')).toHaveCount(0);
  await expect(exactlyTwenty.locator('[data-issue-more]')).toHaveCount(0);
  await expect(exactlyTwenty.locator('.issue-modal-footer')).toHaveCount(0);
});

test('show-more advances by 20 rows per click until the section is complete', async ({ page }) => {
  await installMockData(page, buildFixture(41));
  await openDashboard(page);
  await openIssues(page);

  const fortyOne = page.locator('[data-issue-section="capacityOutlier"]');
  await expect(fortyOne.locator('[data-issue-list] .issue-modal-row')).toHaveCount(20);
  await fortyOne.locator('[data-issue-more]').click();
  await expect(fortyOne.locator('[data-issue-list] .issue-modal-row')).toHaveCount(40);
  await expect(fortyOne.locator('[data-issue-status]')).toHaveText('แสดง 40 จาก 41 รายการ');
  await expect(fortyOne.locator('[data-issue-more]')).toBeVisible();
  await fortyOne.locator('[data-issue-more]').click();
  await expect(fortyOne.locator('[data-issue-list] .issue-modal-row')).toHaveCount(41);
  await expect(fortyOne.locator('[data-issue-status]')).toHaveText('แสดง 41 จาก 41 รายการ');
  await expect(fortyOne.locator('[data-issue-more]')).toHaveCount(0);
});

test('system issue rows expose shared detail and map only when a usable coordinate exists', async ({ page }) => {
  await installMockData(page, buildFixture());
  await openDashboard(page);
  await openIssues(page);

  const missingSection = page.locator('[data-issue-section="coordMissing"]');
  const missingDetail = missingSection.locator('[data-issue-action="detail"][data-system-id="PY-W-900001"]');
  await expect(missingDetail).toBeVisible();
  await expect(missingSection.locator('[data-issue-action="map"][data-system-id="PY-W-900001"]')).toHaveCount(0);

  await missingDetail.click();
  await expect(page.locator('#systemDrawer')).toHaveClass(/open/);
  await expect(page.locator('#drawerContent')).toContainText('ระบบประปาทดสอบ 1');
  await page.locator('#btnCloseDrawer').click();
  await expect(page.locator('.swal2-title')).toHaveText('รายละเอียดความครบถ้วนของข้อมูล');

  const mappedSection = page.locator('[data-issue-section="capacityOutlier"]');
  const mappedButton = mappedSection.locator('[data-issue-action="map"][data-system-id="PY-W-900020"]');
  await expect(mappedButton).toBeVisible();
  await mappedButton.click();
  await expect(page.locator('.swal2-container')).toHaveCount(0);
  await expect(page.locator('.leaflet-popup')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('.leaflet-popup')).toContainText('ระบบประปาทดสอบ 20');
  await expect.poll(() => page.evaluate(() => {
    const map = document.getElementById('map-section')?.getBoundingClientRect();
    const header = document.getElementById('appHeader')?.getBoundingClientRect();
    return Boolean(map && header && map.top >= header.bottom - 2 && map.top < window.innerHeight);
  }), { timeout: 5_000 }).toBe(true);
});

test('village-only source issue has a read-only area detail action without inventing a system map action', async ({ page }) => {
  await installMockData(page, buildFixture());
  await openDashboard(page);
  await openIssues(page);

  const villageSection = page.locator('[data-issue-section="villagesWithoutSystem"]');
  await expect(villageSection).toContainText('บ้านไม่มีรายละเอียดระบบ');
  await expect(villageSection.locator('[data-issue-village-detail]')).toBeVisible();
  await expect(villageSection.locator('[data-issue-action="map"]')).toHaveCount(0);

  await villageSection.locator('[data-issue-village-detail]').click();
  await expect(page.locator('#systemDrawer')).toHaveClass(/open/);
  await expect(page.locator('#drawerTitle')).toHaveText('รายละเอียดพื้นที่');
  await expect(page.locator('#drawerContent')).toContainText('บ้านไม่มีรายละเอียดระบบ');
  await page.locator('#btnCloseDrawer').click();
  await expect(page.locator('.swal2-title')).toHaveText('รายละเอียดความครบถ้วนของข้อมูล');
});

test('detail drawer returns to the same expanded completeness context', async ({ page }) => {
  await installMockData(page, buildFixture(41));
  await openDashboard(page);
  await openIssues(page);

  const outlier = page.locator('[data-issue-section="capacityOutlier"]');
  await outlier.locator('[data-issue-more]').click();
  await expect(outlier).toHaveAttribute('data-visible-count', '40');

  await page.locator('.swal-data-issues').evaluate(element => { element.scrollTop = 140; });
  const detail = outlier.locator('[data-issue-action="detail"]').nth(25);
  await detail.click();
  await expect(page.locator('#systemDrawer')).toHaveClass(/open/);
  await page.locator('#btnCloseDrawer').click();

  await expect(page.locator('.swal2-title')).toHaveText('รายละเอียดความครบถ้วนของข้อมูล');
  const restored = page.locator('[data-issue-section="capacityOutlier"]');
  await expect(restored).toHaveAttribute('data-visible-count', '40');
  await expect(restored.locator('[data-issue-list] .issue-modal-row')).toHaveCount(40);
  await expect(restored.locator('[data-issue-status]')).toHaveText('แสดง 40 จาก 41 รายการ');
  await expect.poll(() => page.locator('.swal-data-issues').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});


test('data completeness modal keeps title and close actions outside the scrolling issue list', async ({ page }) => {
  await installMockData(page, buildFixture(41));
  await openDashboard(page);
  await openIssues(page);

  const popup = page.locator('.data-completeness-popup');
  const title = page.locator('.data-completeness-title');
  const scroller = page.locator('.swal-data-issues');
  const actions = page.locator('.data-completeness-actions');
  const topClose = page.locator('.data-completeness-x');

  await expect(popup).toBeVisible();
  await expect(topClose).toBeVisible();
  await expect(actions.getByRole('button', { name: 'ปิด' })).toBeVisible();

  const before = await Promise.all([title.boundingBox(), scroller.boundingBox(), actions.boundingBox()]);
  expect(before.every(Boolean)).toBe(true);
  expect(before[0].y + before[0].height).toBeLessThanOrEqual(before[1].y + 2);
  expect(before[1].y + before[1].height).toBeLessThanOrEqual(before[2].y + 2);

  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const after = await Promise.all([title.boundingBox(), actions.boundingBox()]);
  expect(after[0].y).toBeCloseTo(before[0].y, 0);
  expect(after[1].y).toBeCloseTo(before[2].y, 0);
});

test('desktop completeness rows use compact three-column information density', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await installMockData(page, buildFixture(21));
  await openDashboard(page);
  await openIssues(page);

  const section = page.locator('[data-issue-section="capacityOutlier"]');
  await expect(section.locator('.issue-modal-columns')).toBeVisible();

  const row = section.locator('.issue-modal-row').first();
  const main = row.locator('.issue-modal-row-main');
  const problem = row.locator('.issue-modal-row-problem');
  const actions = row.locator('.issue-modal-actions');
  const [rowBox, mainBox, problemBox, actionsBox] = await Promise.all([
    row.boundingBox(), main.boundingBox(), problem.boundingBox(), actions.boundingBox()
  ]);

  expect(rowBox.height).toBeLessThanOrEqual(82);
  expect(mainBox.x).toBeLessThan(problemBox.x);
  expect(problemBox.x).toBeLessThan(actionsBox.x);
});

test('mobile completeness rows keep actions beside content and avoid horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockData(page, buildFixture(21));
  await openDashboard(page);
  await openIssues(page);

  const popup = page.locator('.data-completeness-popup');
  const popupBox = await popup.boundingBox();
  expect(popupBox.width).toBeGreaterThanOrEqual(368);
  expect(popupBox.width).toBeLessThanOrEqual(390);

  const row = page.locator('[data-issue-section="coordMissing"] .issue-modal-row').first();
  const mainBox = await row.locator('.issue-modal-row-main').boundingBox();
  const actionBox = await row.locator('.issue-modal-actions').boundingBox();
  const rowBox = await row.boundingBox();

  expect(actionBox.x).toBeGreaterThan(mainBox.x);
  expect(rowBox.height).toBeLessThanOrEqual(92);

  const overflow = await popup.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('360px modal preserves icon-only action accessibility without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await installMockData(page, buildFixture(21));
  await openDashboard(page);
  await openIssues(page);

  const detail = page.locator('[data-issue-section="capacityOutlier"] [data-issue-action="detail"]').first();
  const map = page.locator('[data-issue-section="capacityOutlier"] [data-issue-action="map"]').last();
  await expect(detail).toBeVisible();
  await expect(detail).toHaveAttribute('aria-label', /ดูรายละเอียด/);
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('aria-label', /ดูตำแหน่งบนแผนที่/);

  const popupOverflow = await page.locator('.data-completeness-popup').evaluate(element => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(popupOverflow.scrollWidth).toBeLessThanOrEqual(popupOverflow.clientWidth + 1);
});
