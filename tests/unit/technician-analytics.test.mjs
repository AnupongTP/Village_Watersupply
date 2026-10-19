import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = { window: { VWSTechnicianMap: { coordinates(row) {
  return Number.isFinite(row.latitude) && Number.isFinite(row.longitude) ? [row.latitude, row.longitude] : null;
} } } };
vm.runInNewContext(readFileSync(resolve('technician/assets/technician-analytics.js'), 'utf8'), context);
const { summarize } = context.window.VWSTechnicianAnalytics;

test('authenticated analytics counts villages once and keeps missing quality separate', () => {
  const dataset = { villages: [{ village_id: 'V1' }, { village_id: 'V2' }], waterSources: [{ source_id: 'S1' }], waterSystems: [
    { village_id: 'V1', latitude: 19, longitude: 100, village: { district: 'จุน' }, drinking_water_quality: 'PASS', publicVisible: true },
    { village_id: 'V1', latitude: 19, longitude: 100, village: { district: 'จุน' }, drinking_water_quality: 'FAIL', water_quantity: 'INSUFFICIENT', publicVisible: false },
    { village_id: 'V2', latitude: '', longitude: '', village: { district: 'เมือง' }, drinking_water_quality: 'NO_DATA', utility_water_quality: 'FAIL' },
    { village_id: 'V2', latitude: 19, longitude: 100, village: { district: 'เมือง' }, drinking_water_quality: '' }
  ] };
  const summary = summarize(dataset);
  assert.equal(summary.villages, 2);
  assert.equal(summary.linkedVillages, 2);
  assert.equal(summary.sources, 1);
  assert.equal(summary.systems, 4);
  assert.equal(summary.drinking.PASS, 1);
  assert.equal(summary.drinking.FAIL, 1);
  assert.equal(summary.drinking.NO_DATA, 1);
  assert.equal(summary.drinking.UNKNOWN, 1);
  assert.equal(summary.insufficient, 1);
  assert.equal(summary.missingCoordinates, 1);
  assert.equal(summary.hidden, 1);
  assert.equal(summary.monitoring.length, 2);
  assert.equal(summary.byDistrict['จุน'], 2);
  assert.equal(summary.byDistrict['เมือง'], 2);
  assert.equal(summary.byDistrictVillages['ไม่ระบุ'], 2);
});
