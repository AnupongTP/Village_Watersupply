import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolveUiSourcePath } from '../support/source-root.mjs';

const file = resolveUiSourcePath('assets/js/reference-model.js');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const model = context.VWSReferenceModel;

test('I-04: toReferenceDataset flags outside-Phayao coordinates for TECHNICIAN while keeping valid global coordinates and suppressing them for PUBLIC', () => {
  const raw = {
    villages: [{village_id: 'v1', village_name: 'บ้านทดสอบ', district: 'จุน', has_village_waterworks: true}],
    waterSystems: [{system_id: 's1', village_id: 'v1', system_name: 'ระบบนอกพื้นที่', latitude: 13.75, longitude: 100.5, construction_year_be: 2560, capacity_m3_hr: 50}],
    waterSources: []
  };

  const pubRef = model.toReferenceDataset(model.adaptDataset(raw, {audience: 'PUBLIC'}), {referenceYearBE: 2569});
  assert.equal(pubRef.S[0].lat, null);
  assert.equal(pubRef.S[0].lng, null);
  assert.equal(pubRef.S[0].co, true);

  const techRef = model.toReferenceDataset(model.adaptDataset(raw, {audience: 'TECHNICIAN'}), {referenceYearBE: 2569});
  assert.equal(techRef.S[0].lat, 13.75);
  assert.equal(techRef.S[0].lng, 100.5);
  assert.equal(techRef.S[0].co, true);
});

test('I-05: Thai has_village_waterworks strings and capacity missing flag (capx) match policy contract', () => {
  const raw = {
    villages: [
      {village_id: 'v1', village_name: 'ก', district: 'จุน', has_village_waterworks: 'มีประปาหมู่บ้าน'},
      {village_id: 'v2', village_name: 'ข', district: 'จุน', has_village_waterworks: 'ไม่มีประปาหมู่บ้าน'}
    ],
    waterSystems: [
      {system_id: 's1', village_id: 'v1', capacity_m3_hr: null},
      {system_id: 's2', village_id: 'v1', capacity_m3_hr: 'bad-value'},
      {system_id: 's3', village_id: 'v1', capacity_m3_hr: 1500}
    ],
    waterSources: []
  };

  const adapted = model.adaptDataset(raw, {audience: 'PUBLIC'});
  const summary = model.summarizeSelection(model.selectDataset(adapted, {}), {referenceYearBE: 2569});
  assert.equal(summary.coverage.count, 1);
  assert.equal(summary.coverage.denominator, 2);

  const ref = model.toReferenceDataset(adapted, {referenceYearBE: 2569});
  assert.equal(ref.V[0].ww, true);
  assert.equal(ref.V[1].ww, false);
  assert.equal(ref.S[0].capx, true);
  assert.equal(ref.S[1].capx, true);
  assert.equal(ref.S[2].cap, 1500);
  assert.equal(ref.S[2].capx, false);
});

test('M-01: age >=20 boundary counts 20 while <=19 stays under 20, and unique deduplication trims whitespace IDs', () => {
  const raw = {
    villages: [
      {village_id: 'v1 ', village_name: 'แรก', district: 'จุน'},
      {village_id: ' v1', village_name: 'ซ้ำมีช่องว่าง', district: 'จุน'}
    ],
    waterSystems: [
      {system_id: 's0 ', village_id: 'v1', construction_year_be: 2569}, // age 0
      {system_id: 's5', village_id: 'v1', construction_year_be: 2564},  // age 5
      {system_id: 's6', village_id: 'v1', construction_year_be: 2563},  // age 6
      {system_id: 's10', village_id: 'v1', construction_year_be: 2559}, // age 10
      {system_id: 's11', village_id: 'v1', construction_year_be: 2558}, // age 11
      {system_id: 's19', village_id: 'v1', construction_year_be: 2550}, // age 19
      {system_id: 's20', village_id: 'v1', construction_year_be: 2549}, // age 20
      {system_id: 's21', village_id: 'v1', construction_year_be: 2548}, // age 21
      {system_id: 's30', village_id: 'v1', construction_year_be: 2539}, // age 30
      {system_id: 's31', village_id: 'v1', construction_year_be: 2538}, // age 31
      {system_id: ' s31 ', village_id: ' v1 ', construction_year_be: 2538} // whitespace duplicate
    ],
    waterSources: []
  };

  const adapted = model.adaptDataset(raw, {audience: 'PUBLIC'});
  assert.equal(adapted.villages.length, 1);
  assert.equal(adapted.waterSystems.length, 10);
  const s = model.summarizeSelection(model.selectDataset(adapted, {}), {referenceYearBE: 2569});
  assert.equal(s.age.atLeast20.count, 4); // ages 20, 21, 30, 31
  assert.equal(s.age.atLeast20.denominator, 10);
});

test('selectDataset global search positively matches canonical system_id and village_id', () => {
  const adapted = model.adaptDataset({
    villages: [
      {village_id: 'PY-V-0001', village_name: 'บ้านจุน', district: 'จุน', has_village_waterworks: true},
      {village_id: 'PY-V-0002', village_name: 'บ้านเชียงคำ', district: 'เชียงคำ', has_village_waterworks: true}
    ],
    waterSystems: [
      {system_id: 'PY-W-000001', village_id: 'PY-V-0001', system_name: 'ประปาจุน'},
      {system_id: 'PY-W-000002', village_id: 'PY-V-0002', system_name: 'ประปาเชียงคำ'}
    ],
    waterSources: []
  }, {audience: 'PUBLIC'});

  const bySystemId = model.selectDataset(adapted, {search: 'PY-W-000001'});
  assert.deepEqual([...bySystemId.waterSystems.map(s => s.system_id)], ['PY-W-000001']);
  assert.deepEqual([...bySystemId.villages.map(v => v.village_id)], ['PY-V-0001']);

  const byVillageId = model.selectDataset(adapted, {search: 'PY-V-0002'});
  assert.deepEqual([...byVillageId.waterSystems.map(s => s.system_id)], ['PY-W-000002']);
  assert.deepEqual([...byVillageId.villages.map(v => v.village_id)], ['PY-V-0002']);
});
