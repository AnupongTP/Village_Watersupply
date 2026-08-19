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

test('monitoring summary cards toggle the shared filter state and update the whole dashboard', async ({ page }) => {
  await openDashboard(page);

  const card = page.locator('[data-monitoring-filter="not-working"]');
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#alertNotWorking')).toHaveText('1');

  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('NOT_WORKING');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
  await expect(page.locator('.water-system-marker')).toHaveCount(1);
  await expect(page.locator('#dataCompletenessSummary')).toContainText('1 / 1 ระบบ');
  await expect(page.locator('#watchlistTotal')).toHaveText('1');
  await expectFilterChip(page, 'สถานะ: ใช้การไม่ได้');
  await expect.poll(async () => page.evaluate(() => {
    const chart = window.Chart?.getChart?.(document.getElementById('qualityChart'));
    return (chart?.data?.datasets?.[0]?.data || []).reduce((sum, value) => sum + Number(value), 0);
  })).toBe(1);

  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('');
  await expect(page.locator('#kpiSystems')).toHaveText('2');
  await expect(page.locator('.water-system-marker')).toHaveCount(2);
});


test('monitoring quick filters preserve independent area and system-type scope', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#filterDistrict').selectOption({ label: 'เมืองพะเยา' });
  await page.locator('#filterSystemType').selectOption('SURFACE_SMALL');
  await expect(page.locator('#kpiSystems')).toHaveText('1');

  const card = page.locator('[data-monitoring-filter="not-working"]');
  await card.click();

  await expect(page.locator('#filterDistrict')).toHaveValue('เมืองพะเยา');
  await expect(page.locator('#filterSystemType')).toHaveValue('SURFACE_SMALL');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('NOT_WORKING');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expectFilterChip(page, 'อำเภอ: เมืองพะเยา');
  await expectFilterChip(page, 'ประเภทระบบ: ประปาผิวดินขนาดเล็ก');
  await expectFilterChip(page, 'สถานะ: ใช้การไม่ได้');

  await card.click();
  await expect(page.locator('#filterDistrict')).toHaveValue('เมืองพะเยา');
  await expect(page.locator('#filterSystemType')).toHaveValue('SURFACE_SMALL');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('');
  await expect(page.locator('#kpiSystems')).toHaveText('1');
});

test('monitoring quick filters combine with AND semantics and clear independently', async ({ page }) => {
  await openDashboard(page);

  const notWorking = page.locator('[data-monitoring-filter="not-working"]');
  const insufficient = page.locator('[data-monitoring-filter="insufficient"]');
  const qualityFail = page.locator('[data-monitoring-filter="quality-fail"]');

  await notWorking.click();
  await insufficient.click();
  await expect(notWorking).toHaveAttribute('aria-pressed', 'true');
  await expect(insufficient).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('NOT_WORKING');
  await expect(page.locator('#filterWaterQuantity')).toHaveValue('INSUFFICIENT');
  await expect(page.locator('#kpiSystems')).toHaveText('1');

  await qualityFail.click();
  await expect(qualityFail).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#filterDrinkingWaterQuality')).toHaveValue('FAIL');
  await expect(page.locator('#kpiSystems')).toHaveText('0');
  await expect(page.locator('.water-system-marker')).toHaveCount(0);

  await notWorking.click();
  await expect(notWorking).toHaveAttribute('aria-pressed', 'false');
  await expect(insufficient).toHaveAttribute('aria-pressed', 'true');
  await expect(qualityFail).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('');
  await expect(page.locator('#filterWaterQuantity')).toHaveValue('INSUFFICIENT');
  await expect(page.locator('#filterDrinkingWaterQuality')).toHaveValue('FAIL');
  await expect(page.locator('#kpiSystems')).toHaveText('0');

  await page.locator('#btnClearFilters').click();
  for (const quickFilter of [notWorking, insufficient, qualityFail]) {
    await expect(quickFilter).toHaveAttribute('aria-pressed', 'false');
  }
  await expect(page.locator('#kpiSystems')).toHaveText('2');
});

test('dropdowns, chips and chart cross-filters keep monitoring cards synchronized', async ({ page }) => {
  await openDashboard(page);

  const notWorking = page.locator('[data-monitoring-filter="not-working"]');
  const insufficient = page.locator('[data-monitoring-filter="insufficient"]');
  const qualityFail = page.locator('[data-monitoring-filter="quality-fail"]');

  await page.locator('#filterOperationalStatus').selectOption('WORKING');
  await expect(notWorking).toHaveAttribute('aria-pressed', 'false');
  // Faceted count self-excludes Operational Status, so the alternative remains discoverable.
  await expect(page.locator('#alertNotWorking')).toHaveText('1');

  await page.locator('#filterOperationalStatus').selectOption('NOT_WORKING');
  await expect(notWorking).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-filter-remove="operationalStatus"]').click();
  await expect(notWorking).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#filterWaterQuantity').selectOption('INSUFFICIENT');
  await expect(insufficient).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-filter-remove="waterQuantity"]').click();
  await expect(insufficient).toHaveAttribute('aria-pressed', 'false');

  await clickChartElement(page, 'qualityChart', 0, 1); // FAIL
  await expect(qualityFail).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#filterDrinkingWaterQuality')).toHaveValue('FAIL');
  await page.locator('[data-filter-remove="drinkingWaterQuality"]').click();
  await expect(qualityFail).toHaveAttribute('aria-pressed', 'false');
});

test('monitoring quick-filter buttons preserve native keyboard toggle behavior', async ({ page }) => {
  await openDashboard(page);

  const card = page.locator('[data-monitoring-filter="not-working"]');
  await card.focus();
  await expect(card).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('NOT_WORKING');
  await expect(card).toBeFocused();

  await page.keyboard.press('Space');
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('');
  await expect(card).toBeFocused();
});

for (const viewport of [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 800 }
]) {
  test(`monitoring quick-filter selected state stays compact at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openDashboard(page);

    const card = page.locator('[data-monitoring-filter="insufficient"]');
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#filterWaterQuantity')).toHaveValue('INSUFFICIENT');

    const geometry = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cards: [...document.querySelectorAll('.watch-mini')].map(element => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth
      }))
    }));
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
    expect(geometry.cards.every(cardBox => cardBox.scrollWidth <= cardBox.clientWidth + 2)).toBe(true);

    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}-monitoring-selected.png`),
      fullPage: false
    });
  });
}

