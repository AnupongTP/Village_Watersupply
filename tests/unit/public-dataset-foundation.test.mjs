import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemporaryPublicScope } from '../../assets/js/public-scope.js';
import { projectPublicDataset } from '../../tools/public-dataset/projection.mjs';
import { createPublicSnapshot, createVerifiedSnapshotStore, validatePublicSnapshot } from '../../tools/public-dataset/snapshot.mjs';
import { inspectSourceRead } from '../../tools/public-dataset/source-read.mjs';
import { selectPhysicalPublicationEligible } from '../../tools/public-dataset/eligibility.mjs';

const fixture = () => ({
  success: true,
  generatedAt: 'irrelevant request time',
  villages: [
    { village_id: 'v1', village_name: 'Linked only to no-coordinate system', has_village_waterworks: 'YES', admin_secret: 'do not publish' },
    { village_id: 'v2', village_name: 'Unlinked waterworks', has_village_waterworks: true },
    { village_id: 'v3', village_name: 'Other village', has_village_waterworks: false },
    { village_id: 'v4', village_name: 'Visible system', has_village_waterworks: 1 }
  ],
  waterSystems: [
    { system_id: 's1', village_id: 'v1', latitude: '', longitude: 100, admin_secret: 'hidden' },
    { system_id: 's4', village_id: 'v4', latitude: 19, longitude: 100, system_name: 'Visible', operational_status: 'WORKING', auth_token: 'hidden' }
  ],
  waterSources: [
    { source_id: 'r1', village_id: 'v1', source_type: 'PWA' },
    { source_id: 'r2', village_id: 'v2', source_type: 'PWA' },
    { source_id: 'r3', village_id: 'v3', source_type: 'PWA' },
    { source_id: 'r4', village_id: 'v4', source_type: 'PWA', password: 'hidden' }
  ]
});
const manifest = data => ({ complete: true, counts: {
  villages: data.villages.length, waterSystems: data.waterSystems.length, waterSources: data.waterSources.length
} });
const make = (data = fixture(), sourceRevision = 1, observationTime = '2026-10-19T00:00:00.000Z') => {
  const { verifiedRead } = inspectSourceRead(data, manifest(data), () => ({
    complete: true, consistentRead: true, authority: 'synthetic fixture',
    tables: { villages: 'villages', waterSystems: 'water_systems', waterSources: 'village_water_sources' },
    headers: {
      villages: ['village_id', 'has_village_waterworks'],
      waterSystems: ['system_id', 'village_id', 'latitude', 'longitude'],
      waterSources: ['source_id', 'village_id']
    },
    tableIds: {
      villages: data.villages.map(row => row.village_id),
      waterSystems: data.waterSystems.map(row => row.system_id),
      waterSources: data.waterSources.map(row => row.source_id)
    },
    revision: { value: sourceRevision, monotonic: true, authority: 'synthetic fixture' }
  }));
  const eligible = selectPhysicalPublicationEligible(verifiedRead, () => ({
    complete: true, authority: 'synthetic fixture',
    decisions: data.waterSystems.map(row => ({ systemId: row.system_id, status: 'ELIGIBLE' }))
  }));
  return createPublicSnapshot(eligible, { observationTime });
};

test('exact R5.1 parity for valid source sets, including linkage before coordinate filtering', () => {
  for (const change of [
    () => {},
    data => data.waterSystems.push({ system_id: 's5', village_id: 'v2', latitude: ' ', longitude: 100 }),
    data => { data.waterSystems[0].latitude = 19; data.waterSystems[0].longitude = 100; },
    data => { data.villages[1].has_village_waterworks = false; },
    data => { data.waterSystems.splice(0, 1); },
    data => data.villages.push({ village_id: 'v5', has_village_waterworks: false })
  ]) {
    const data = fixture(); change(data);
    const actual = projectPublicDataset(data, manifest(data));
    const baseline = buildTemporaryPublicScope(data);
    for (const key of ['villages', 'waterSystems', 'waterSources']) {
      const id = key === 'villages' ? 'village_id' : key === 'waterSystems' ? 'system_id' : 'source_id';
      assert.deepEqual(actual[key].map(row => row[id]), baseline[key].map(row => row[id]));
    }
    assert.deepEqual(actual.suppression, baseline.suppression);
  }
});

test('suppressed village sources disappear while sources of coordinate-only suppressed system remain', () => {
  const result = projectPublicDataset(fixture(), manifest(fixture()));
  assert.deepEqual(result.villages.map(row => row.village_id), ['v1', 'v3', 'v4']);
  assert.deepEqual(result.waterSystems.map(row => row.system_id), ['s4']);
  assert.deepEqual(result.waterSources.map(row => row.source_id), ['r1', 'r3', 'r4']);
  assert.equal(JSON.stringify(result).includes('admin_secret'), false);
  assert.equal(JSON.stringify(result).includes('auth_token'), false);
  assert.equal(JSON.stringify(result).includes('password'), false);
  assert.equal(result.waterSystems[0].operational_status, 'WORKING');
});

test('rejects missing, partial, duplicated, and orphan source records', () => {
  const data = fixture();
  assert.throws(() => projectPublicDataset(data), /manifest/);
  assert.throws(() => projectPublicDataset(data, { complete: false, counts: manifest(data).counts }), /manifest/);
  assert.throws(() => projectPublicDataset(data, { complete: true, counts: { ...manifest(data).counts, villages: 5 } }), /partial/);
  for (const key of ['villages', 'waterSystems', 'waterSources']) {
    const duplicate = fixture(); duplicate[key].push({ ...duplicate[key][0] });
    assert.throws(() => projectPublicDataset(duplicate, manifest(duplicate)), /duplicate/);
  }
  for (const key of ['waterSystems', 'waterSources']) {
    const orphan = fixture(); orphan[key][0].village_id = 'missing';
    assert.throws(() => projectPublicDataset(orphan, manifest(orphan)), /orphan/);
  }
  const missing = fixture(); missing.waterSources[0].source_id = ' ';
  assert.throws(() => projectPublicDataset(missing, manifest(missing)), /missing source_id/);
});

test('record-control and Feature 3 processing states fail closed pending governance decision', () => {
  for (const [key, field, value] of [
    ['villages', 'is_deleted', true], ['waterSystems', 'record_status', 'DELETED'],
    ['waterSystems', 'submission_status', 'PROCESSING'], ['waterSystems', 'submission_status', 'FAILED'],
    ['waterSystems', 'recordStatus', 'SOFT_DELETED'], ['waterSystems', 'publicVisible', false]
  ]) {
    const data = fixture(); data[key][0][field] = value;
    assert.throws(() => projectPublicDataset(data, manifest(data)), /undecided record-control/);
  }
});

test('snapshot version ignores observation timestamp, but changes for add, edit and physical deletion', () => {
  const first = make();
  const later = make(fixture(), 2, '2026-10-20T00:00:00.000Z');
  assert.equal(first.datasetVersion, later.datasetVersion);
  assert.equal(first.contentHash, later.contentHash);
  const reordered = fixture(); reordered.villages.reverse(); reordered.waterSources.reverse();
  assert.equal(make(reordered, 2).datasetVersion, first.datasetVersion);
  const added = fixture(); added.villages.push({ village_id: 'v5', has_village_waterworks: false });
  assert.notEqual(make(added, 3).datasetVersion, first.datasetVersion);
  const edited = fixture(); edited.waterSystems[1].system_name = 'Updated';
  assert.notEqual(make(edited, 3).datasetVersion, first.datasetVersion);
  const deleted = fixture(); deleted.waterSystems.splice(1, 1);
  assert.notEqual(make(deleted, 3).datasetVersion, first.datasetVersion);
});

test('snapshot integrity and acceptance preserve last verified copy on invalid/stale candidates', () => {
  const first = make();
  const store = createVerifiedSnapshotStore(first);
  assert.equal(validatePublicSnapshot(first), true);
  const changed = fixture(); changed.waterSystems[1].system_name = 'New';
  const second = make(changed, 2);
  const corrupt = structuredClone(second); corrupt.waterSystems[0].system_name = 'Tampered';
  assert.throws(() => store.accept(corrupt), /hash mismatch/);
  const extra = structuredClone(second); extra.villages[0].administrator_password = 'synthetic';
  assert.throws(() => store.accept(extra), /non-public field/);
  assert.equal(store.recover().datasetVersion, first.datasetVersion);
  store.accept(second);
  assert.throws(() => store.accept(first), /Stale/);
  const conflict = make(fixture(), 2);
  assert.throws(() => store.accept(conflict), /Conflicting/);
  assert.equal(store.recover().datasetVersion, second.datasetVersion);
  const recovered = store.recover(); recovered.waterSystems[0].system_name = 'external mutation';
  assert.equal(store.recover().waterSystems[0].system_name, 'New');
});
