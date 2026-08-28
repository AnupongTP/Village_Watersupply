import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFacetedFilterOptions,
  reconcileAreaInvalidFilters
} from '../../assets/js/filters.js';

function sorted(values) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b), 'en'));
}

const data = {
  villages: [
    { village_id: 'V1', district: 'เชียงคำ', local_authority: 'เทศบาลตำบลฝายกวาง' },
    { village_id: 'V2', district: 'เชียงคำ', local_authority: 'เทศบาลตำบลเชียงคำ' },
    { village_id: 'V3', district: 'จุน', local_authority: 'เทศบาลตำบลจุน' }
  ],
  waterSystems: [
    {
      system_id: 'S1',
      village_id: 'V1',
      system_type: 'SURFACE_SMALL',
      operational_status: 'WORKING',
      drinking_water_quality: 'PASS',
      water_quantity: 'SUFFICIENT'
    },
    {
      system_id: 'S2',
      village_id: 'V1',
      system_type: 'GROUNDWATER_MEDIUM',
      operational_status: 'NOT_WORKING',
      drinking_water_quality: 'FAIL',
      water_quantity: 'INSUFFICIENT'
    },
    {
      system_id: 'S3',
      village_id: 'V2',
      system_type: 'GROUNDWATER_SMALL',
      operational_status: 'WORKING',
      drinking_water_quality: 'PASS',
      water_quantity: 'SUFFICIENT'
    },
    {
      system_id: 'S4',
      village_id: 'V3',
      system_type: 'GROUNDWATER_LARGE',
      operational_status: '',
      drinking_water_quality: '',
      water_quantity: 'UNKNOWN'
    }
  ],
  waterSources: []
};

const blankFilters = {
  search: '',
  district: '',
  localAuthority: '',
  systemType: '',
  operationalStatus: '',
  drinkingWaterQuality: '',
  waterQuantity: ''
};

test('area context hides a system type that exists elsewhere but not in the selected local authority', () => {
  const filters = {
    ...blankFilters,
    district: 'เชียงคำ',
    localAuthority: 'เทศบาลตำบลฝายกวาง'
  };

  const options = deriveFacetedFilterOptions(data, filters);

  assert.deepEqual(
    sorted(options.systemTypes),
    sorted(['SURFACE_SMALL', 'GROUNDWATER_MEDIUM'])
  );
  assert.equal(options.systemTypes.includes('GROUNDWATER_SMALL'), false);
  assert.equal(options.systemTypes.includes('GROUNDWATER_LARGE'), false);
});

test('each system dropdown self-excludes its own dimension and honors the others', () => {
  const filters = {
    ...blankFilters,
    district: 'เชียงคำ',
    localAuthority: 'เทศบาลตำบลฝายกวาง',
    systemType: 'SURFACE_SMALL'
  };

  const options = deriveFacetedFilterOptions(data, filters);

  // System Type self-excludes itself, so the alternative type in the same area remains switchable.
  assert.deepEqual(
    sorted(options.systemTypes),
    sorted(['SURFACE_SMALL', 'GROUNDWATER_MEDIUM'])
  );

  // Other dimensions honor the active System Type.
  assert.deepEqual(options.operationalStatuses, ['WORKING']);
  assert.deepEqual(options.drinkingWaterQualities, ['PASS']);
  assert.deepEqual(options.waterQuantities, ['SUFFICIENT']);
});

test('active zero-by-AND value stays visible when it exists in the area, preserving explicit state', () => {
  const filters = {
    ...blankFilters,
    district: 'เชียงคำ',
    localAuthority: 'เทศบาลตำบลฝายกวาง',
    systemType: 'SURFACE_SMALL',
    operationalStatus: 'NOT_WORKING'
  };

  const options = deriveFacetedFilterOptions(data, filters);

  // NOT_WORKING exists in the area (S2) but not together with SURFACE_SMALL.
  // Keep the active value visible instead of creating a hidden filter.
  assert.equal(options.operationalStatuses.includes('NOT_WORKING'), true);
  assert.equal(options.systemTypes.includes('SURFACE_SMALL'), true);
});

test('upstream area reconciliation clears a system filter that has no records in the new area', () => {
  const filters = {
    ...blankFilters,
    district: 'เชียงคำ',
    localAuthority: 'เทศบาลตำบลฝายกวาง',
    systemType: 'GROUNDWATER_SMALL'
  };

  const next = reconcileAreaInvalidFilters(data, filters);
  assert.equal(next.district, 'เชียงคำ');
  assert.equal(next.localAuthority, 'เทศบาลตำบลฝายกวาง');
  assert.equal(next.systemType, '');
});

test('reconciliation preserves independent AND filters when each value exists somewhere in the selected area', () => {
  const filters = {
    ...blankFilters,
    district: 'เชียงคำ',
    localAuthority: 'เทศบาลตำบลฝายกวาง',
    systemType: 'SURFACE_SMALL',
    operationalStatus: 'NOT_WORKING'
  };

  const next = reconcileAreaInvalidFilters(data, filters);
  assert.equal(next.systemType, 'SURFACE_SMALL');
  assert.equal(next.operationalStatus, 'NOT_WORKING');
});

test('a future collected value appears automatically when added inside the current area', () => {
  const filters = {
    ...blankFilters,
    district: 'เชียงคำ',
    localAuthority: 'เทศบาลตำบลฝายกวาง'
  };

  const before = deriveFacetedFilterOptions(data, filters);
  assert.equal(before.systemTypes.includes('GROUNDWATER_SMALL'), false);

  const nextData = {
    ...data,
    waterSystems: [
      ...data.waterSystems,
      {
        system_id: 'S5',
        village_id: 'V1',
        system_type: 'GROUNDWATER_SMALL',
        operational_status: 'WORKING',
        drinking_water_quality: 'PASS',
        water_quantity: 'SUFFICIENT'
      }
    ]
  };

  const after = deriveFacetedFilterOptions(nextData, filters);
  assert.equal(after.systemTypes.includes('GROUNDWATER_SMALL'), true);
});
