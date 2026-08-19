import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppState } from '../../assets/js/state.js';
import { getMonitoringIssueCounts } from '../../assets/js/dashboard.js';
import {
  buildFilteredSnapshot,
  normalizeSearchTerm,
  setFilterValue
} from '../../assets/js/filters.js';

const villages = [
  { village_id: 'PY-V-0001', province: 'พะเยา', district: 'จุน', local_authority: 'เทศบาลตำบลจุน', village_name: 'บ้านจุนหลวง' },
  { village_id: 'PY-V-0002', province: 'พะเยา', district: 'เมืองพะเยา', local_authority: 'เทศบาลเมืองพะเยา', village_name: 'บ้านแม่กา' },
  { village_id: 'PY-V-0003', province: 'พะเยา', district: 'เชียงคำ', local_authority: 'อบต.น้ำแวน', village_name: 'บ้านน้ำแวน' }
];

const systems = [
  {
    system_id: 'PY-W-000001', village_id: 'PY-V-0001', system_name: 'ประปาบ้านจุน',
    system_type: 'GROUNDWATER_SMALL', operational_status: 'WORKING',
    drinking_water_quality: 'PASS', water_quantity: 'SUFFICIENT',
    responsible_agency: 'เทศบาลตำบลจุน'
  },
  {
    system_id: 'PY-W-000002', village_id: 'PY-V-0002', system_name: 'ประปาแม่กา',
    system_type: 'SURFACE_SMALL', operational_status: 'NOT_WORKING',
    drinking_water_quality: 'FAIL', water_quantity: 'INSUFFICIENT',
    responsible_agency: 'กองช่าง เทศบาลเมืองพะเยา'
  },
  {
    system_id: 'PY-W-000003', village_id: 'PY-V-0003', system_name: 'ประปาน้ำแวน',
    system_type: 'GROUNDWATER_SMALL', operational_status: 'WORKING',
    drinking_water_quality: 'NO_DATA', water_quantity: 'INSUFFICIENT',
    responsible_agency: 'อบต.น้ำแวน'
  }
];

beforeEach(() => {
  AppState.data.villages = structuredClone(villages);
  AppState.data.waterSystems = structuredClone(systems);
  AppState.data.waterSources = [];
  Object.assign(AppState.filters, {
    search: '', district: '', localAuthority: '', systemType: '',
    operationalStatus: '', drinkingWaterQuality: '', waterQuantity: ''
  });
});

test('global search matches user-facing village/system/agency text', () => {
  AppState.filters.search = 'กองช่าง';
  const result = buildFilteredSnapshot();
  assert.deepEqual(result.waterSystems.map(row => row.system_id), ['PY-W-000002']);
  assert.deepEqual(result.villages.map(row => row.village_id), ['PY-V-0002']);

  AppState.filters.search = 'บ้านน้ำแวน';
  const villageMatch = buildFilteredSnapshot();
  assert.deepEqual(villageMatch.waterSystems.map(row => row.system_id), ['PY-W-000003']);
});

test('global search deliberately does not search generated internal IDs', () => {
  AppState.filters.search = 'PY-W-000001';
  assert.equal(buildFilteredSnapshot().waterSystems.length, 0);

  AppState.filters.search = 'PY-V-0001';
  assert.equal(buildFilteredSnapshot().villages.length, 0);
});

test('search and system filters combine with AND semantics', () => {
  AppState.filters.search = 'ประปา';
  AppState.filters.systemType = 'GROUNDWATER_SMALL';
  AppState.filters.waterQuantity = 'INSUFFICIENT';
  const result = buildFilteredSnapshot();
  assert.deepEqual(result.waterSystems.map(row => row.system_id), ['PY-W-000003']);
});

test('chart self-exclusion keeps the full selected dimension switchable', () => {
  AppState.filters.systemType = 'GROUNDWATER_SMALL';
  const fullyFiltered = buildFilteredSnapshot();
  assert.equal(fullyFiltered.waterSystems.length, 2);

  const chartSnapshot = buildFilteredSnapshot({ excludeKeys: ['systemType'] });
  assert.equal(chartSnapshot.waterSystems.length, 3);
  assert.deepEqual(new Set(chartSnapshot.waterSystems.map(row => row.system_type)), new Set(['GROUNDWATER_SMALL', 'SURFACE_SMALL']));
});

test('district mutation clears only dependent Local Authority and preserves independent filters', () => {
  AppState.filters.localAuthority = 'เทศบาลตำบลจุน';
  AppState.filters.systemType = 'GROUNDWATER_SMALL';
  AppState.filters.drinkingWaterQuality = 'PASS';

  setFilterValue('district', 'เมืองพะเยา');

  assert.equal(AppState.filters.district, 'เมืองพะเยา');
  assert.equal(AppState.filters.localAuthority, '');
  assert.equal(AppState.filters.systemType, 'GROUNDWATER_SMALL');
  assert.equal(AppState.filters.drinkingWaterQuality, 'PASS');
});


test('quality and quantity UNKNOWN normalize into the same no-data filter bucket shown in the UI', () => {
  AppState.data.waterSystems[0].drinking_water_quality = 'UNKNOWN';
  AppState.data.waterSystems[0].water_quantity = 'UNKNOWN';
  AppState.filters.drinkingWaterQuality = 'NO_DATA';
  AppState.filters.waterQuantity = 'NO_DATA';

  const result = buildFilteredSnapshot();
  assert.deepEqual(result.waterSystems.map(row => row.system_id), ['PY-W-000001']);
});

test('normalizes Thai search whitespace and case-compatible text deterministically', () => {
  assert.equal(normalizeSearchTerm('  บ้านจุน   หลวง  '), 'บ้านจุน หลวง');
  assert.equal(normalizeSearchTerm('LOCAL Authority'), 'local authority');
});

test('toggle mutation clears only the selected monitoring dimension on a repeated value', () => {
  AppState.filters.district = 'เมืองพะเยา';
  AppState.filters.waterQuantity = 'INSUFFICIENT';

  const selected = setFilterValue('operationalStatus', 'NOT_WORKING', { toggle: true });
  assert.equal(selected, 'NOT_WORKING');
  assert.equal(AppState.filters.district, 'เมืองพะเยา');
  assert.equal(AppState.filters.waterQuantity, 'INSUFFICIENT');

  const cleared = setFilterValue('operationalStatus', 'NOT_WORKING', { toggle: true });
  assert.equal(cleared, '');
  assert.equal(AppState.filters.district, 'เมืองพะเยา');
  assert.equal(AppState.filters.waterQuantity, 'INSUFFICIENT');
});

test('monitoring quick-filter counts self-exclude only their own dimension', () => {
  AppState.filters.operationalStatus = 'WORKING';

  let counts = getMonitoringIssueCounts();
  assert.deepEqual(counts, {
    notWorking: 1,
    insufficient: 1,
    qualityFail: 0
  });

  AppState.filters.waterQuantity = 'INSUFFICIENT';
  counts = getMonitoringIssueCounts();
  assert.deepEqual(counts, {
    notWorking: 1,
    insufficient: 1,
    qualityFail: 0
  });
});

