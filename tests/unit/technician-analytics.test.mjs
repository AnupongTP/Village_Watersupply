import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const context = { window: {} };
vm.runInNewContext(readFileSync(resolve('technician/assets/technician-analytics.js'), 'utf8'), context);
const { summarize } = context.window.VWSTechnicianAnalytics;

test('canonical authenticated metrics count unique watchlist systems and require explicit village status', () => {
  const systems = [
    { system_id: 'S1', village_id: 'V1', operational_status: 'NOT_WORKING', drinking_water_quality: 'FAIL', water_quantity: 'INSUFFICIENT' },
    { system_id: 'S2', village_id: 'V1', operational_status: 'WORKING', drinking_water_quality: 'PASS', water_quantity: 'SUFFICIENT' },
    { system_id: 'S3', village_id: 'V2', operational_status: 'WORKING', drinking_water_quality: '', water_quantity: '' }
  ];
  const verified = summarize({ villages: [
    { village_id: 'V1', has_village_waterworks: true },
    { village_id: 'V2', has_village_waterworks: false }
  ], waterSystems: systems });
  assert.equal(verified.villages, 2);
  assert.equal(verified.withWaterworks, 1);
  assert.equal(verified.withoutWaterworks, 1);
  assert.equal(verified.systems, 3);
  assert.equal(verified.notWorking, 1);
  assert.equal(verified.insufficient, 1);
  assert.equal(verified.qualityFail, 1);
  assert.equal(verified.watchlist, 1);
  const unavailable = summarize({ villages: [{ village_id: 'V1' }], waterSystems: systems });
  assert.equal(unavailable.withWaterworks, null);
  assert.equal(unavailable.withoutWaterworks, null);
});
