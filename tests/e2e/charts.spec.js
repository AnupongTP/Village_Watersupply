import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

const CHART_IDS = ['districtChart', 'qualityChart', 'quantityChart', 'systemTypeChart'];

async function chartSnapshot(page) {
  return page.evaluate(ids => ids.map(id => {
    const chart = window.Chart?.getChart?.(id);
    return {
      id,
      exists: Boolean(chart),
      labels: chart?.data?.labels || [],
      datasets: (chart?.data?.datasets || []).map(dataset => dataset.data || [])
    };
  }), CHART_IDS);
}

function expectFiniteChartData(snapshot) {
  for (const chart of snapshot) {
    expect(chart.exists, `${chart.id} instance missing`).toBe(true);
    expect(chart.labels.length, `${chart.id} labels empty`).toBeGreaterThan(0);
    for (const dataset of chart.datasets) {
      for (const value of dataset) expect(Number.isFinite(Number(value)), `${chart.id} non-finite value`).toBe(true);
    }
  }
}

test('all charts render finite data and react to the global filter', async ({ page }) => {
  await openDashboard(page);
  for (const id of CHART_IDS) await expect(page.locator(`#${id}`)).toBeVisible();

  const provinceSnapshot = await chartSnapshot(page);
  expectFiniteChartData(provinceSnapshot);

  await page.locator('#filterDistrict').selectOption({ label: 'จุน' });
  await expect(page.locator('#kpiSystems')).toHaveText('1');

  await expect.poll(async () => {
    const quality = (await chartSnapshot(page)).find(chart => chart.id === 'qualityChart');
    return quality.datasets[0].reduce((sum, value) => sum + Number(value), 0);
  }).toBe(1);

  const filteredSnapshot = await chartSnapshot(page);
  expectFiniteChartData(filteredSnapshot);
});
