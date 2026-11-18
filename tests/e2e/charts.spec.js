import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

const CHART_IDS = ['c_ops', 'c_hh', 'c_hhmix', 'c_age'];

async function chartSnapshot(page) {
  return page.evaluate(ids => ids.map(id => {
    const chart = window.Chart?.getChart?.(document.getElementById(id));
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
      for (const value of dataset) {
        if (value !== null) {
          expect(Number.isFinite(Number(value)), `${chart.id} non-finite value`).toBe(true);
        }
      }
    }
  }
}

test('all charts render finite data and react to the global filter', async ({ page }) => {
  await openDashboard(page);
  for (const id of CHART_IDS) await expect(page.locator(`#${id}`)).toBeVisible();

  const provinceSnapshot = await chartSnapshot(page);
  expectFiniteChartData(provinceSnapshot);

  await page.locator('#fd').selectOption('จุน');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');

  await expect.poll(async () => {
    const ops = (await chartSnapshot(page)).find(chart => chart.id === 'c_ops');
    return ops.datasets[0].reduce((sum, value) => sum + Number(value || 0), 0);
  }).toBe(1);

  const filteredSnapshot = await chartSnapshot(page);
  expectFiniteChartData(filteredSnapshot);
});
