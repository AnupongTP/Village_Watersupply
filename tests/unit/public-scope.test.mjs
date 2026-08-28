import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTemporaryPublicScope,
  isCoordinatePresent,
  isWaterworksVillage
} from '../../assets/js/public-scope.js';

test('coordinate presence treats empty and whitespace-only values as blank', () => {
  assert.equal(isCoordinatePresent({ latitude: '', longitude: 99.9 }), false);
  assert.equal(isCoordinatePresent({ latitude: '   ', longitude: 99.9 }), false);
  assert.equal(isCoordinatePresent({ latitude: 19.1, longitude: null }), false);
  assert.equal(isCoordinatePresent({ latitude: 19.1, longitude: 99.9 }), true);
});

test('waterworks village normalization matches supported source values', () => {
  for (const value of [true, 1, '1', 'YES', ' yes ', 'มีประปาหมู่บ้าน']) {
    assert.equal(isWaterworksVillage({ has_village_waterworks: value }), true);
  }
  assert.equal(isWaterworksVillage({ has_village_waterworks: false }), false);
});

test('no-system village set is calculated from original systems before coordinate suppression', () => {
  const payload = {
    villages: [
      { village_id: 'v1', has_village_waterworks: true },
      { village_id: 'v2', has_village_waterworks: true },
      { village_id: 'v3', has_village_waterworks: false },
      { village_id: 'v4', has_village_waterworks: 'มีประปาหมู่บ้าน' }
    ],
    waterSystems: [
      { system_id: 's1', village_id: 'v1', latitude: '', longitude: '' },
      { system_id: 's4', village_id: 'v4', latitude: 19.1, longitude: 99.9 }
    ],
    waterSources: [
      { village_id: 'v1', source: 'a' },
      { village_id: 'v2', source: 'b' },
      { village_id: 'v3', source: 'c' },
      { village_id: 'v4', source: 'd' }
    ]
  };

  const result = buildTemporaryPublicScope(payload);

  assert.deepEqual(result.villages.map(v => v.village_id), ['v1', 'v3', 'v4']);
  assert.deepEqual(result.waterSystems.map(s => s.system_id), ['s4']);
  assert.deepEqual(result.waterSources.map(s => s.village_id), ['v1', 'v3', 'v4']);
  assert.equal(result.suppression.hiddenMissingCoordinateSystems, 1);
  assert.equal(result.suppression.hiddenWaterworksVillagesWithoutSystem, 1);
  assert.equal(result.suppression.hiddenIssueRows, 2);
  assert.equal('originalLinkedVillageIds' in result.suppression, false);
});
