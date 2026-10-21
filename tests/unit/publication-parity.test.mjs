import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemporaryPublicScope } from '../../assets/js/public-scope.js';
import { projectPublicDataset } from '../../tools/public-dataset/projection.mjs';
import { eligible, sourceFixture } from '../support/publication-fixture.mjs';
import { AppState } from '../../assets/js/state.js';
import { buildFilteredSnapshot } from '../../assets/js/filters.js';
import { getMonitoringIssueCounts } from '../../assets/js/dashboard.js';

const ids = (result, key, field) => new Set(result[key].map(row => row[field]));
const idSets = result => ({
  villages: ids(result, 'villages', 'village_id'),
  waterSystems: ids(result, 'waterSystems', 'system_id'),
  waterSources: ids(result, 'waterSources', 'source_id')
});

test('R5.1 exact public ID sets match browser baseline for coordinate and linkage matrix', () => {
  const cases = [
    () => {},
    data => { data.waterSystems[0].latitude = 19; data.waterSystems[0].longitude = ''; },
    data => { data.waterSystems[0].longitude = ''; },
    data => { data.waterSystems[0].latitude = 19; },
    data => data.waterSystems.push({ system_id: 's3', village_id: 'v1', latitude: 19, longitude: 100 }),
    data => data.waterSystems.splice(0, 1),
    data => { data.villages.reverse(); data.waterSystems.reverse(); data.waterSources.reverse(); },
    data => { data.villages = []; data.waterSystems = []; data.waterSources = []; }
  ];
  for (const change of cases) {
    const data = sourceFixture(); change(data);
    const set = eligible(data);
    const actual = projectPublicDataset(set.payload, set.manifest);
    const baseline = buildTemporaryPublicScope(set.payload);
    assert.deepEqual(idSets(actual), idSets(baseline));
    assert.deepEqual(actual.suppression, baseline.suppression);
    assert.deepEqual(actual.villages.map(row => row.village_id), actual.villages.map(row => row.village_id).sort());
  }
});

test('ineligible system exclusion is intentional publication policy before R5.1', () => {
  const data = sourceFixture();
  const set = eligible(data, 1, ['s1']);
  const projected = projectPublicDataset(set.payload, set.manifest);
  assert.deepEqual(idSets(projected), idSets(buildTemporaryPublicScope(set.payload)));
  assert.notDeepEqual(idSets(projected).villages, idSets(buildTemporaryPublicScope(data)).villages);
  assert.equal(projected.suppression.hiddenWaterworksVillagesWithoutSystem, 2);
});

test('already projected output is rejected by the local projection owner contract', () => {
  const set = eligible();
  const projected = projectPublicDataset(set.payload, set.manifest);
  assert.throws(() => projectPublicDataset(projected, {
    complete: true, counts: {
      villages: projected.villages.length, waterSystems: projected.waterSystems.length,
      waterSources: projected.waterSources.length
    }
  }), /Already-projected/);
});

test('scoped filter IDs and monitoring counts remain equal on the eligible source', () => {
  const data = sourceFixture();
  data.villages[0].district = 'North'; data.villages[1].district = 'South';
  data.villages[3].district = 'North';
  data.waterSystems[0].water_quantity = 'SUFFICIENT';
  data.waterSystems[1].water_quantity = 'INSUFFICIENT';
  data.waterSystems[1].drinking_water_quality = 'FAIL';
  const set = eligible(data);
  const baseline = buildTemporaryPublicScope(set.payload);
  const projected = projectPublicDataset(set.payload, set.manifest);
  const previousData = structuredClone(AppState.data);
  const previousFilters = structuredClone(AppState.filters);
  const inspect = (scope, filters) => {
    Object.assign(AppState.data, {
      villages: scope.villages, waterSystems: scope.waterSystems, waterSources: scope.waterSources
    });
    Object.assign(AppState.filters, {
      search: '', district: '', localAuthority: '', systemType: '',
      operationalStatus: '', drinkingWaterQuality: '', waterQuantity: '', ...filters
    });
    const filtered = buildFilteredSnapshot();
    return { ids: idSets(filtered), monitoring: getMonitoringIssueCounts(),
      villageCount: filtered.villages.length, systemCount: filtered.waterSystems.length };
  };
  try {
    for (const filters of [
      {}, { district: 'North' }, { district: 'South' },
      { operationalStatus: 'NOT_WORKING' }, { waterQuantity: 'INSUFFICIENT' },
      { search: 'Visible' }
    ]) assert.deepEqual(inspect(projected, filters), inspect(baseline, filters));
  } finally {
    Object.assign(AppState.data, previousData);
    Object.assign(AppState.filters, previousFilters);
  }
});
