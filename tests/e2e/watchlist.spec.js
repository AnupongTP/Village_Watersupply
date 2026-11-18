import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { resolveUiSourcePath } from '../support/source-root.mjs';
import { openDashboard, installBasePublicRoutes } from './helpers.js';

const SYSTEM_COUNT = 105;

async function installLargeProblemFixture(page) {
  await installBasePublicRoutes(page);
  const villages = JSON.parse(fs.readFileSync(resolveUiSourcePath('data/mock/villages.json'), 'utf8'));
  const systems = JSON.parse(fs.readFileSync(resolveUiSourcePath('data/mock/water_systems.json'), 'utf8'));
  const template = systems[0];
  const generated = Array.from({ length: SYSTEM_COUNT }, (_, index) => ({
    ...template,
    system_id: `QA-W-${String(index + 1).padStart(6, '0')}`,
    village_id: villages[0].village_id,
    system_name: `ระบบประปาทดสอบรายการที่ ${index + 1}`,
    latitude: 19.20 + (index % 5) * 0.005,
    longitude: 99.80 + Math.floor(index / 5) * 0.005,
    operational_status: 'WORKING',
    drinking_water_quality: 'FAIL',
    water_quantity: 'SUFFICIENT',
    transfer_document_status: 'NO_DATA',
    transfer_document_url: ''
  }));
  await page.route('**/data/mock/water_systems.json', route => route.fulfill({ json: generated }));
}

test('detail systems table batches 100 rows with #loadMoreBtn and problem view tracks matching problem rows', async ({ page }) => {
  await installLargeProblemFixture(page);
  await openDashboard(page);

  await expect(page.locator('#efCount')).toContainText(`แสดง ${SYSTEM_COUNT} ระบบ จาก ${SYSTEM_COUNT}`);
  await page.locator('.main-nav button[data-view="detail"]').click();
  await page.locator('.tab-btn[data-tab="table"]').click();

  await expect(page.locator('#tblBody tr')).toHaveCount(100);
  await expect(page.locator('#loadMoreBtn')).toBeVisible();
  const firstBatchIds = await page.locator('#tblBody tr').evaluateAll(rows => rows.map(row => row.cells[0]?.textContent));

  await page.locator('#loadMoreBtn').click();
  await expect(page.locator('#tblBody tr')).toHaveCount(SYSTEM_COUNT);
  await expect(page.locator('#loadMoreBtn')).toBeHidden();
  const allIds = await page.locator('#tblBody tr').evaluateAll(rows => rows.map(row => row.cells[0]?.textContent));
  expect(new Set(allIds).size).toBe(SYSTEM_COUNT);
  expect(allIds.slice(0, 100)).toEqual(firstBatchIds);

  await page.locator('.tab-btn[data-tab="problem"]').click();
  await expect(page.locator('#n-prob')).toContainText(`${SYSTEM_COUNT} ระบบ`);
  await expect(page.locator('#probBody tr.dmg-row')).toHaveCount(SYSTEM_COUNT);
  const tableScroll = await page.locator('#panel-problem .tbl-wrap').evaluate(el => getComputedStyle(el).overflowX);
  expect(['auto', 'scroll']).toContain(tableScroll);
});
