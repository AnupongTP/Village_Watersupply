import { test, expect } from '@playwright/test';
import { installMockData, openDashboard } from './helpers.js';

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

test('selecting District + Local Authority clears invalid local authority cleanly when District changes', async ({ page }) => {
  const fixture = makeFixture();
  await installMockData(page, fixture);
  await openDashboard(page);

  await page.locator('#fd').selectOption('เชียงคำ');
  await page.locator('#fla').selectOption('เทศบาลตำบลฝายกวาง');
  await expect(page.locator('#efCount')).toContainText('2 ระบบ');
  await expect(page.locator('#fla option')).toHaveCount(3);

  await page.locator('#fd').selectOption('จุน');
  await expect(page.locator('#fla')).toHaveValue('');
  await expect(page.locator('#fla option[value="เทศบาลตำบลฝายกวาง"]')).toHaveCount(0);
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
});

test('zero-result combination with area and system filters preserves active filters and clear recovers', async ({ page }) => {
  const fixture = makeFixture();
  await installMockData(page, fixture);
  await openDashboard(page);

  await page.locator('#fd').selectOption('จุน');
  await page.locator('#fst').selectOption('SURFACE_SMALL');
  await expect(page.locator('#efCount')).toContainText('แสดง 0 ระบบ จาก 4 · 0 หมู่บ้าน จาก 3');
  await expect(page.locator('#gfEmpty')).toBeVisible();
  await expect(page.locator('#fd')).toHaveValue('จุน');
  await expect(page.locator('#fst')).toHaveValue('SURFACE_SMALL');

  await page.locator('#fst').selectOption('');
  await expect(page.locator('#efCount')).toContainText('1 ระบบ');
  await expect(page.locator('#gfEmpty')).toBeHidden();
});

test('refresh updates Local Authority choices and newly collected systems inside active area', async ({ page }) => {
  const fixture = makeFixture();
  await installMockData(page, fixture);
  await openDashboard(page);

  await page.locator('#fd').selectOption('เชียงคำ');
  await expect(page.locator('#efCount')).toContainText('3 ระบบ');

  fixture.villages.push({
    village_id: 'PY-V-F004',
    province: 'พะเยา',
    district: 'เชียงคำ',
    local_authority: 'อบต.อ่างทอง',
    village_name: 'บ้านอ่างทอง',
    has_village_waterworks: true
  });
  fixture.waterSystems.push({
    system_id: 'PY-W-F005',
    village_id: 'PY-V-F004',
    system_name: 'ระบบใหม่อ่างทอง',
    latitude: 19.54,
    longitude: 100.30,
    system_type: 'GROUNDWATER_SMALL',
    operational_status: 'WORKING',
    drinking_water_quality: 'PASS',
    water_quantity: 'SUFFICIENT'
  });

  await page.locator('#btnRefresh').click();
  await expect(page.locator('#referenceStatus')).toHaveText('โหลดข้อมูลล่าสุดแล้ว');
  await expect(page.locator('#fd')).toHaveValue('เชียงคำ');
  await expect(page.locator('#efCount')).toContainText('4 ระบบ');
  await expect(page.locator('#fla option[value="อบต.อ่างทอง"]')).toHaveCount(1);
});
