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
}

test('each issue section shows at most 20 rows and only sections above 20 expose show-more', async ({ page }) => {
  await installMockData(page, buildFixture());
  await openDashboard(page);
  await openIssues(page);

  const missing = page.locator('[data-issue-section="coordMissing"]');
  await expect(missing).toHaveAttribute('data-visible-count', '19');
  await expect(missing.locator('[data-issue-list] .issue-modal-row')).toHaveCount(19);
  await expect(missing.locator('[data-issue-more]')).toHaveCount(0);

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
  await expect(exactlyTwenty.locator('[data-issue-status]')).toHaveText('แสดง 20 จาก 20 รายการ');
  await expect(exactlyTwenty.locator('[data-issue-more]')).toHaveCount(0);
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

  await openIssues(page);
  const mappedSection = page.locator('[data-issue-section="capacityOutlier"]');
  const mappedButton = mappedSection.locator('[data-issue-action="map"][data-system-id="PY-W-900020"]');
  await expect(mappedButton).toBeVisible();
  await mappedButton.click();
  await expect(page.locator('.leaflet-popup')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('.leaflet-popup')).toContainText('ระบบประปาทดสอบ 20');
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
});
