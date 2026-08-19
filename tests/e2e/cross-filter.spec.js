import { test, expect } from '@playwright/test';
import {
  chartLabelIndex,
  clickChartElement,
  openDashboard
} from './helpers.js';

async function expectFilterChip(page, text) {
  await expect(page.locator('#activeFilterChips')).toBeVisible();
  await expect(page.locator('#activeFilterChips')).toContainText(text);
}

test('global search filters the whole dashboard and clear-all restores province scope', async ({ page }) => {
  await openDashboard(page);
  await expect(page.locator('#kpiSystems')).toHaveText('2');

  await page.locator('#filterSearch').fill('เทศบาลเมืองพะเยา');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expectFilterChip(page, 'ค้นหา: “เทศบาลเมืองพะเยา”');
  await expect(page.locator('#dataCompletenessSummary')).toContainText('1 / 1 ระบบ');

  await page.locator('#btnClearFilters').click();
  await expect(page.locator('#filterSearch')).toHaveValue('');
  await expect(page.locator('#kpiSystems')).toHaveText('2');
  await expect(page.locator('#activeFilterChips')).toBeHidden();
  await expect(page.locator('#scopeLabel')).toHaveText('จังหวัดพะเยา');
});

test('district chart toggles a district cross-filter without discarding independent filters', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#filterSystemType').selectOption('GROUNDWATER_SMALL');
  await expect(page.locator('#kpiSystems')).toHaveText('1');

  let index = await chartLabelIndex(page, 'districtChart', 'จุน');
  expect(index).toBeGreaterThanOrEqual(0);
  await clickChartElement(page, 'districtChart', 1, index);

  await expect(page.locator('#filterDistrict')).toHaveValue('จุน');
  await expect(page.locator('#filterSystemType')).toHaveValue('GROUNDWATER_SMALL');
  await expectFilterChip(page, 'อำเภอ: จุน');
  await expectFilterChip(page, 'ประเภทระบบ: ประปาบาดาลขนาดเล็ก');

  index = await chartLabelIndex(page, 'districtChart', 'จุน');
  await clickChartElement(page, 'districtChart', 1, index);
  await expect(page.locator('#filterDistrict')).toHaveValue('');
  await expect(page.locator('#filterSystemType')).toHaveValue('GROUNDWATER_SMALL');
});

test('system type chart toggles the shared system-type filter', async ({ page }) => {
  await openDashboard(page);

  let index = await chartLabelIndex(page, 'systemTypeChart', 'ประปาบาดาลขนาดเล็ก');
  expect(index).toBeGreaterThanOrEqual(0);
  await clickChartElement(page, 'systemTypeChart', 0, index);

  await expect(page.locator('#filterSystemType')).toHaveValue('GROUNDWATER_SMALL');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expectFilterChip(page, 'ประเภทระบบ: ประปาบาดาลขนาดเล็ก');

  index = await chartLabelIndex(page, 'systemTypeChart', 'ประปาบาดาลขนาดเล็ก');
  await clickChartElement(page, 'systemTypeChart', 0, index);
  await expect(page.locator('#filterSystemType')).toHaveValue('');
  await expect(page.locator('#kpiSystems')).toHaveText('2');
});

test('quality doughnut toggles drinking-water quality and keeps alternate segments available', async ({ page }) => {
  await openDashboard(page);

  await clickChartElement(page, 'qualityChart', 0, 1); // FAIL
  await expect(page.locator('#filterDrinkingWaterQuality')).toHaveValue('FAIL');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expectFilterChip(page, 'คุณภาพน้ำดื่ม: ไม่ผ่านเกณฑ์');

  // Self-exclusion means the chart still contains the NO_DATA segment, allowing
  // a direct switch instead of requiring a reset first.
  await clickChartElement(page, 'qualityChart', 0, 2);
  await expect(page.locator('#filterDrinkingWaterQuality')).toHaveValue('NO_DATA');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
});

test('quantity doughnut toggles the shared water-quantity filter and chip can clear only that dimension', async ({ page }) => {
  await openDashboard(page);

  await clickChartElement(page, 'quantityChart', 0, 0); // SUFFICIENT
  await expect(page.locator('#filterWaterQuantity')).toHaveValue('SUFFICIENT');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expectFilterChip(page, 'ความเพียงพอของน้ำ: เพียงพอ');

  await page.locator('[data-filter-remove="waterQuantity"]').click();
  await expect(page.locator('#filterWaterQuantity')).toHaveValue('');
  await expect(page.locator('#kpiSystems')).toHaveText('2');
});
