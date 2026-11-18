import { test, expect } from '@playwright/test';
import {
  chartLabelIndex,
  clickChartElement,
  installMockData,
  openDashboard
} from './helpers.js';

const CHART_FIXTURE = {
  villages: [
    { village_id: 'PY-V-0001', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านจุน', has_village_waterworks: true, pwa_households: 10, mwa_households: 0, commercial_households: 0, other_village_pipe_households: 0, waterbank_households: 0, self_source_households: 5, natural_source_households: 0 },
    { village_id: 'PY-V-0002', district: 'เมืองพะเยา', local_authority: 'เทศบาลเมืองพะเยา', village_name: 'บ้านเมือง', has_village_waterworks: true, pwa_households: 12, mwa_households: 0, commercial_households: 0, other_village_pipe_households: 0, waterbank_households: 0, self_source_households: 3, natural_source_households: 0 }
  ],
  waterSystems: [
    { system_id: 'PY-W-000001', village_id: 'PY-V-0001', system_name: 'ระบบจุน', latitude: 19.32, longitude: 100.17, system_type: 'GROUNDWATER_SMALL', operational_status: 'WORKING', drinking_water_quality: 'FAIL', water_quantity: 'SUFFICIENT' },
    { system_id: 'PY-W-000002', village_id: 'PY-V-0002', system_name: 'ระบบเมือง', latitude: 19.17, longitude: 99.9, system_type: 'SURFACE_SMALL', operational_status: 'NOT_WORKING', drinking_water_quality: 'NO_DATA', water_quantity: 'INSUFFICIENT' }
  ],
  waterSources: []
};

async function expectFilterChip(page, text) {
  await expect(page.locator('#gfChips')).toBeVisible();
  await expect(page.locator('#gfChips')).toContainText(text);
}

test('global search filters the whole dashboard and clear-all restores province scope', async ({ page }) => {
  await openDashboard(page);
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');

  await page.locator('#fq').fill('เทศบาลเมืองพะเยา');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  await expectFilterChip(page, 'ค้นหา: เทศบาลเมืองพะเยา');
  await expect(page.locator('#map .dvicon')).toHaveCount(1);

  await page.locator('#efReset').click();
  await expect(page.locator('#fq')).toHaveValue('');
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await expect(page.locator('#map .dvicon')).toHaveCount(2);
  await expect(page.locator('#gfChips')).toBeEmpty();
  await expect(page.locator('#efReset')).toBeHidden();
});

test('district chart cross-filters without discarding independent filters', async ({ page }) => {
  await installMockData(page, CHART_FIXTURE);
  await openDashboard(page);

  await page.locator('#fst').selectOption('GROUNDWATER_SMALL');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');

  const index = await chartLabelIndex(page, 'c_hhmix', 'จุน');
  expect(index).toBeGreaterThanOrEqual(0);
  await clickChartElement(page, 'c_hhmix', 0, index);

  await expect(page.locator('#fd')).toHaveValue('จุน');
  await expect(page.locator('#fst')).toHaveValue('GROUNDWATER_SMALL');
  await expectFilterChip(page, 'อำเภอ: จุน');
  await expectFilterChip(page, 'ประเภทระบบ: บาดาลขนาดเล็ก');

  await page.locator('#gfChips button[aria-label="ล้าง"]').first().click();
  await expect(page.locator('#fd')).toHaveValue('');
  await expect(page.locator('#fst')).toHaveValue('GROUNDWATER_SMALL');
});

test('operational doughnut toggles the shared rule filter and individual chip clears only that dimension', async ({ page }) => {
  await openDashboard(page);

  await clickChartElement(page, 'c_ops', 0, 1); // NOT_WORKING -> rule='ops'
  await expect(page.locator('#frule')).toHaveValue('ops');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  await expectFilterChip(page, 'สถานะ/ปัญหา: ใช้การไม่ได้');

  await page.locator('#gfChips button[aria-label="ล้าง"]').click();
  await expect(page.locator('#frule')).toHaveValue('');
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
});

test('type status bar rows and rule dropdown synchronize across executive and detail views', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#frule').selectOption('qty');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  await expectFilterChip(page, 'สถานะ/ปัญหา: น้ำไม่เพียงพอ');

  await page.locator('[data-view="detail"]').click();
  await page.locator('[data-tab="table"]').click();
  await expect(page.locator('#tblBody tr')).toHaveCount(1);
  await expect(page.locator('#tblBody')).toContainText('PY-W-000002');

  await page.locator('#efReset').click();
  await expect(page.locator('#tblBody tr')).toHaveCount(2);
});
