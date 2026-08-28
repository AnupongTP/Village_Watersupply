import { test, expect } from '@playwright/test';
import { openDashboard } from './helpers.js';

async function optionValues(page, selectId) {
  return page.locator(`#${selectId} option`).evaluateAll(options =>
    options.map(option => option.value)
  );
}

async function installFixture(page, fixture) {
  await page.route('**/data/mock/villages.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture.villages)
  }));

  await page.route('**/data/mock/water_systems.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture.waterSystems)
  }));

  await page.route('**/data/mock/village_water_sources.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([])
  }));
}

function makeFixture() {
  return {
    villages: [
      {
        village_id: 'PY-V-F001',
        province: 'พะเยา',
        district: 'เชียงคำ',
        local_authority: 'เทศบาลตำบลฝายกวาง',
        village_name: 'บ้านฝายกวางหนึ่ง',
        has_village_waterworks: true
      },
      {
        village_id: 'PY-V-F002',
        province: 'พะเยา',
        district: 'เชียงคำ',
        local_authority: 'เทศบาลตำบลเชียงคำ',
        village_name: 'บ้านเชียงคำหนึ่ง',
        has_village_waterworks: true
      },
      {
        village_id: 'PY-V-F003',
        province: 'พะเยา',
        district: 'จุน',
        local_authority: 'เทศบาลตำบลจุน',
        village_name: 'บ้านจุนหนึ่ง',
        has_village_waterworks: true
      }
    ],
    waterSystems: [
      {
        system_id: 'PY-W-F001',
        village_id: 'PY-V-F001',
        system_name: 'ระบบฝายกวางผิวดิน',
        latitude: 19.52,
        longitude: 100.28,
        system_type: 'SURFACE_SMALL',
        operational_status: 'WORKING',
        drinking_water_quality: 'PASS',
        water_quantity: 'SUFFICIENT'
      },
      {
        system_id: 'PY-W-F002',
        village_id: 'PY-V-F001',
        system_name: 'ระบบฝายกวางบาดาลกลาง',
        latitude: 19.53,
        longitude: 100.29,
        system_type: 'GROUNDWATER_MEDIUM',
        operational_status: 'NOT_WORKING',
        drinking_water_quality: 'FAIL',
        water_quantity: 'INSUFFICIENT'
      },
      {
        system_id: 'PY-W-F003',
        village_id: 'PY-V-F002',
        system_name: 'ระบบเชียงคำบาดาลเล็ก',
        latitude: 19.50,
        longitude: 100.31,
        system_type: 'GROUNDWATER_SMALL',
        operational_status: 'WORKING',
        drinking_water_quality: 'PASS',
        water_quantity: 'SUFFICIENT'
      },
      {
        system_id: 'PY-W-F004',
        village_id: 'PY-V-F003',
        system_name: 'ระบบจุนบาดาลใหญ่',
        latitude: 19.17,
        longitude: 99.88,
        system_type: 'GROUNDWATER_LARGE',
        operational_status: 'WORKING',
        drinking_water_quality: 'PASS',
        water_quantity: 'SUFFICIENT'
      }
    ]
  };
}

test('selected District + Local Authority removes unavailable system types before they can be chosen', async ({ page }) => {
  const fixture = makeFixture();
  await installFixture(page, fixture);
  await openDashboard(page);

  await page.locator('#filterDistrict').selectOption('เชียงคำ');
  await page.locator('#filterLocalAuthority').selectOption('เทศบาลตำบลฝายกวาง');

  const types = await optionValues(page, 'filterSystemType');
  expect(types).toContain('');
  expect(types).toContain('SURFACE_SMALL');
  expect(types).toContain('GROUNDWATER_MEDIUM');

  // This is the exact regression represented by the user's screenshot:
  // GROUNDWATER_SMALL exists elsewhere in Chiang Kham, but not in ฝายกวาง.
  expect(types).not.toContain('GROUNDWATER_SMALL');
  expect(types).not.toContain('GROUNDWATER_LARGE');

  await expect(page.locator('#filterSystemType option[value="GROUNDWATER_SMALL"]')).toHaveCount(0);
});

test('changing upstream area clears a previously selected system type when it no longer exists there', async ({ page }) => {
  const fixture = makeFixture();
  await installFixture(page, fixture);
  await openDashboard(page);

  // Select a type that exists elsewhere first.
  await page.locator('#filterSystemType').selectOption('GROUNDWATER_SMALL');
  await expect(page.locator('#filterSystemType')).toHaveValue('GROUNDWATER_SMALL');

  await page.locator('#filterDistrict').selectOption('เชียงคำ');
  await page.locator('#filterLocalAuthority').selectOption('เทศบาลตำบลฝายกวาง');

  await expect(page.locator('#filterSystemType')).toHaveValue('');
  await expect(page.locator('[data-filter-remove="systemType"]')).toHaveCount(0);
  await expect(page.locator('#filterSystemType option[value="GROUNDWATER_SMALL"]')).toHaveCount(0);

  // The dashboard must recover to the selected area instead of being left at zero
  // by a stale hidden type filter.
  await expect(page.locator('#kpiSystems')).toHaveText('2');
});

test('system dimensions self-exclude themselves while honoring the other active dimensions', async ({ page }) => {
  const fixture = makeFixture();
  await installFixture(page, fixture);
  await openDashboard(page);

  await page.locator('#filterDistrict').selectOption('เชียงคำ');
  await page.locator('#filterLocalAuthority').selectOption('เทศบาลตำบลฝายกวาง');

  await page.locator('#filterSystemType').selectOption('SURFACE_SMALL');

  // Type self-exclusion keeps the other type in this area switchable.
  const typeValues = await optionValues(page, 'filterSystemType');
  expect(typeValues).toContain('SURFACE_SMALL');
  expect(typeValues).toContain('GROUNDWATER_MEDIUM');

  // Other dimensions honor the selected type.
  await expect.poll(() => optionValues(page, 'filterOperationalStatus'))
    .toEqual(['', 'WORKING']);
  await expect.poll(() => optionValues(page, 'filterDrinkingWaterQuality'))
    .toEqual(['', 'PASS']);
  await expect.poll(() => optionValues(page, 'filterWaterQuantity'))
    .toEqual(['', 'SUFFICIENT']);
});

test('future collected value appears automatically after successful refresh in the current area', async ({ page }) => {
  const fixture = makeFixture();
  await installFixture(page, fixture);
  await openDashboard(page);

  await page.locator('#filterDistrict').selectOption('เชียงคำ');
  await page.locator('#filterLocalAuthority').selectOption('เทศบาลตำบลฝายกวาง');

  await expect(page.locator('#filterSystemType option[value="GROUNDWATER_SMALL"]')).toHaveCount(0);

  fixture.waterSystems.push({
    system_id: 'PY-W-F005',
    village_id: 'PY-V-F001',
    system_name: 'ระบบใหม่หลังเก็บข้อมูล',
    latitude: 19.54,
    longitude: 100.30,
    system_type: 'GROUNDWATER_SMALL',
    operational_status: 'WORKING',
    drinking_water_quality: 'PASS',
    water_quantity: 'SUFFICIENT'
  });

  await page.locator('#btnRefresh').click();
  await expect(page.locator('#btnRefresh')).toHaveAttribute('aria-busy', 'false');

  await expect(page.locator('#filterDistrict')).toHaveValue('เชียงคำ');
  await expect(page.locator('#filterLocalAuthority')).toHaveValue('เทศบาลตำบลฝายกวาง');
  await expect(page.locator('#filterSystemType option[value="GROUNDWATER_SMALL"]')).toHaveCount(1);
});

test('active AND filters remain visible even when their combination is zero', async ({ page }) => {
  const fixture = makeFixture();
  await installFixture(page, fixture);
  await openDashboard(page);

  await page.locator('#filterDistrict').selectOption('เชียงคำ');
  await page.locator('#filterLocalAuthority').selectOption('เทศบาลตำบลฝายกวาง');

  await page.locator('#filterSystemType').selectOption('SURFACE_SMALL');

  // Monitoring quick filters are allowed to preserve independent AND semantics.
  // NOT_WORKING exists in the selected area, but not on the SURFACE_SMALL record.
  await page.locator('[data-monitoring-filter="not-working"]').click();

  await expect(page.locator('#filterSystemType')).toHaveValue('SURFACE_SMALL');
  await expect(page.locator('#filterOperationalStatus')).toHaveValue('NOT_WORKING');
  await expect(page.locator('#kpiSystems')).toHaveText('0');

  // No hidden filter: both active values remain representable in their own selects.
  await expect(page.locator('#filterSystemType option[value="SURFACE_SMALL"]')).toHaveCount(1);
  await expect(page.locator('#filterOperationalStatus option[value="NOT_WORKING"]')).toHaveCount(1);
});
