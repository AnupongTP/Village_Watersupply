import { test, expect } from '@playwright/test';
import { installMockData, openDashboard, expectNoHorizontalPageOverflow } from './helpers.js';

function buildR51Fixture() {
  return {
    villages: [
      { village_id: 'PY-V-9001', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านระบบสาธารณะ', has_village_waterworks: true },
      { village_id: 'PY-V-9002', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านระบบไม่มีพิกัด', has_village_waterworks: true },
      { village_id: 'PY-V-9003', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านมีประปาแต่ไม่มีระบบ', has_village_waterworks: true },
      { village_id: 'PY-V-9004', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านไม่มีประปา', has_village_waterworks: false }
    ],
    waterSystems: [
      {
        system_id: 'PY-W-900001', village_id: 'PY-V-9001', system_name: 'ระบบสาธารณะ',
        latitude: 19.31, longitude: 100.16, operational_status: 'WORKING',
        drinking_water_quality: 'PASS', water_quantity: 'SUFFICIENT', system_type: 'GROUNDWATER_SMALL'
      },
      {
        // This system is hidden, but its village must remain because the village
        // had a linked system in the ORIGINAL dataset.
        system_id: 'PY-W-900002', village_id: 'PY-V-9002', system_name: 'ระบบถูกซ่อนเพราะไม่มีพิกัด',
        latitude: '', longitude: '', operational_status: 'NOT_WORKING',
        drinking_water_quality: 'FAIL', water_quantity: 'INSUFFICIENT', system_type: 'GROUNDWATER_SMALL'
      }
    ],
    waterSources: [
      { village_id: 'PY-V-9001', source_type: 'GROUNDWATER' },
      { village_id: 'PY-V-9002', source_type: 'GROUNDWATER' },
      { village_id: 'PY-V-9003', source_type: 'GROUNDWATER' }
    ]
  };
}

test('R5.1 public projection suppresses exactly by the two temporary rules without cascading', async ({ page }) => {
  await installMockData(page, buildR51Fixture());
  await openDashboard(page);

  await expect(page.locator('#kpiVillages')).toHaveText('3');
  await expect(page.locator('#kpiSystems')).toHaveText('1');

  // Missing-coordinate system is absent from every visible surface.
  await expect(page.locator('body')).not.toContainText('ระบบถูกซ่อนเพราะไม่มีพิกัด');
  await expect(page.locator('.water-system-marker')).toHaveCount(1);
  await expect(page.locator('#watchlistTotal')).toHaveText('0');

  // Village with no linked system in the original payload is removed.
  await expect(page.locator('body')).not.toContainText('บ้านมีประปาแต่ไม่มีระบบ');

  // Village whose only original system lacked coordinates remains in the public
  // village scope. Search by that village must still return the village KPI.
  await page.locator('#filterSearch').fill('บ้านระบบไม่มีพิกัด');
  await expect(page.locator('#kpiVillages')).toHaveText('1');
  await expect(page.locator('#kpiSystems')).toHaveText('0');
});

test('Public Dashboard does not expose Data Completeness or source-quality inspection UI', async ({ page }) => {
  await installMockData(page, buildR51Fixture());
  await openDashboard(page);

  await expect(page.locator('a[href="#data-completeness"]')).toHaveCount(0);
  await expect(page.locator('#data-completeness')).toHaveCount(0);
  await expect(page.locator('#dataCompletenessSummary')).toHaveCount(0);
  await expect(page.locator('#btnOpenDataIssues')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('ข้อมูลประกอบ Dashboard');
  await expect(page.locator('body')).not.toContainText('ความครบถ้วนของข้อมูล');
});

test('R5.1 public layout remains overflow-safe at 360px after removing completeness section', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await installMockData(page, buildR51Fixture());
  await openDashboard(page);
  await expectNoHorizontalPageOverflow(page);
  await expect(page.locator('#watchlist')).toBeVisible();
});
