import { test, expect } from '@playwright/test';
import { installMockData, openDashboard, expectNoHorizontalPageOverflow } from './helpers.js';

function buildR51Fixture() {
  return {
    villages: [
      { village_id: 'PY-V-9001', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านระบบสาธารณะ', has_village_waterworks: true },
      { village_id: 'PY-V-9002', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านระบบไม่มีพิกัด', has_village_waterworks: true },
      { village_id: 'PY-V-9003', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านไม่เชื่อมระบบสาธารณะ', has_village_waterworks: true },
      { village_id: 'PY-V-9004', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านไม่มีประปา', has_village_waterworks: false }
    ],
    waterSystems: [
      {
        system_id: 'PY-W-900001', village_id: 'PY-V-9001', system_name: 'ระบบสาธารณะ',
        latitude: 19.31, longitude: 100.16, operational_status: 'WORKING',
        drinking_water_quality: 'PASS', water_quantity: 'SUFFICIENT', system_type: 'GROUNDWATER_SMALL'
      },
      {
        // Hidden from Public by missing-coordinate rule, while its linked village stays in Public scope.
        system_id: 'PY-W-900002', village_id: 'PY-V-9002', system_name: 'ระบบถูกซ่อนเพราะไม่มีพิกัด',
        latitude: '', longitude: '', operational_status: 'NOT_WORKING',
        drinking_water_quality: 'FAIL', water_quantity: 'INSUFFICIENT', system_type: 'GROUNDWATER_SMALL'
      }
    ],
    waterSources: [
      { source_id: 'SRC-9001', village_id: 'PY-V-9001', source_type: 'GROUNDWATER' },
      { source_id: 'SRC-9002', village_id: 'PY-V-9002', source_type: 'GROUNDWATER' },
      { source_id: 'SRC-9003', village_id: 'PY-V-9003', source_type: 'GROUNDWATER' }
    ]
  };
}

test('R5.1 public projection suppresses exactly by the two temporary rules without cascading', async ({ page }) => {
  await installMockData(page, buildR51Fixture());
  await openDashboard(page);

  await expect(page.locator('#efCount')).toContainText('แสดง 1 ระบบ จาก 1 · 3 หมู่บ้าน จาก 3');
  await expect(page.locator('body')).not.toContainText('ระบบถูกซ่อนเพราะไม่มีพิกัด');
  await expect(page.locator('#map .dvicon')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('บ้านไม่เชื่อมระบบสาธารณะ');

  // Check tables & detail tabs also exclude hidden system and unlinked village
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="table"]').click();
  await expect(page.locator('#tblBody tr')).toHaveCount(1);
  await page.locator('.tab-btn[data-tab="problem"]').click();
  await expect(page.locator('#probBody')).not.toContainText('ระบบถูกซ่อนเพราะไม่มีพิกัด');

  // Village whose only original system lacked coordinates remains searchable in Public scope
  await page.locator('#fq').fill('บ้านระบบไม่มีพิกัด');
  await expect(page.locator('#efCount')).toContainText('แสดง 0 ระบบ จาก 1 · 1 หมู่บ้าน จาก 3');
});

test('Public Dashboard keeps allowlisted #dqaBox without exposing private technician controls', async ({ page }) => {
  await installMockData(page, buildR51Fixture());
  await openDashboard(page);

  await expect(page.locator('#dqaBox')).toBeVisible();
  await expect(page.locator('#referenceVisibility')).toHaveCount(0);
  await expect(page.locator('#editSystemButton')).toHaveCount(0);
  await expect(page.locator('#deleteSystemButton')).toHaveCount(0);
});

test('R5.1 public layout remains overflow-safe at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await installMockData(page, buildR51Fixture());
  await openDashboard(page);
  await expectNoHorizontalPageOverflow(page);
  await page.locator('.main-nav button[data-view="detail"]').click();
  await expect(page.locator('#panel-compare')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
});
