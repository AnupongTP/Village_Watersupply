import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicSnapshot, createVerifiedSnapshotStore, validatePublicSnapshot } from '../../tools/public-dataset/snapshot.mjs';
import { eligible, snapshot, sourceFixture } from '../support/publication-fixture.mjs';

test('initial acceptance needs a trusted revision and stays UNKNOWN until new read evidence', () => {
  const data = sourceFixture(); const candidate = snapshot(data, 1);
  const store = createVerifiedSnapshotStore();
  assert.equal(store.state, 'UNAVAILABLE');
  store.accept(candidate);
  assert.equal(store.state, 'UNKNOWN');
  assert.throws(() => store.publicResponse(snapshot(data, null)), /unavailable/);
  assert.equal(store.publicResponse(snapshot(data, 1)).waterSystems.length, 1);
  assert.equal(store.state, 'CURRENT');
});

test('identical data, additions, edits and physical deletion have deterministic ordered versions', () => {
  const base = sourceFixture();
  const first = snapshot(base, 1);
  const same = snapshot(base, 2);
  assert.equal(first.datasetVersion, same.datasetVersion);
  assert.equal(first.contentHash, same.contentHash);
  const reordered = sourceFixture(); reordered.villages.reverse(); reordered.waterSystems.reverse();
  assert.equal(snapshot(reordered, 2).datasetVersion, first.datasetVersion);
  const added = sourceFixture(); added.waterSystems.push({ system_id: 's3', village_id: 'v3', latitude: 19, longitude: 100 });
  assert.notEqual(snapshot(added, 2).datasetVersion, first.datasetVersion);
  const updated = sourceFixture(); updated.waterSystems[1].system_name = 'Changed';
  assert.notEqual(snapshot(updated, 2).datasetVersion, first.datasetVersion);
  const deleted = sourceFixture(); deleted.waterSystems.splice(1, 1);
  assert.notEqual(snapshot(deleted, 2).datasetVersion, first.datasetVersion);
});

test('new verified deletion blocks old candidate resurrection and old freshness evidence', () => {
  const oldData = sourceFixture(); const old = snapshot(oldData, 1);
  const deletedData = sourceFixture(); deletedData.waterSystems.splice(1, 1);
  const newer = snapshot(deletedData, 2);
  const store = createVerifiedSnapshotStore(); store.accept(old); store.accept(newer);
  assert.throws(() => store.accept(old), /Stale/);
  assert.equal(store.observeTrustedCandidate(snapshot(oldData, 1)), 'UNKNOWN');
  assert.throws(() => store.publicResponse(snapshot(oldData, 1)), /unavailable/);
  const response = store.publicResponse(snapshot(deletedData, 2));
  assert.deepEqual(response.waterSystems, []);
  assert.equal(response.villages.some(row => row.village_id === 'v2'), false);
});

test('same source revision with changed eligibility cannot confirm old public content', () => {
  const data = sourceFixture();
  const store = createVerifiedSnapshotStore(); store.accept(snapshot(data, 5));
  assert.equal(store.observeTrustedCandidate(snapshot(data, 5, ['s2'])), 'UNKNOWN');
  assert.throws(() => store.publicResponse(snapshot(data, 5, ['s2'])), /unavailable/);
  assert.equal(store.recover().waterSystems.length, 1);
});

test('same-revision conflict, out-of-order arrival and metadata tampering are rejected', () => {
  const data = sourceFixture(); const first = snapshot(data, 3);
  const changed = sourceFixture(); changed.waterSystems[1].system_name = 'Other';
  const conflict = snapshot(changed, 3);
  const store = createVerifiedSnapshotStore(); store.accept(first);
  assert.throws(() => store.accept(snapshot(data, 2)), /Stale/);
  assert.throws(() => store.accept(conflict), /Conflicting/);
  first.sourceRevision = 999;
  first.metadataHash = '0'.repeat(64);
  assert.throws(() => store.accept(first), /metadata hash mismatch|altered/);
  assert.equal(store.recover().sourceRevision, 3);
});

test('corrupt, duplicate, orphan and untrusted candidates cannot replace verified copy', () => {
  const candidate = snapshot(); const store = createVerifiedSnapshotStore(); store.accept(candidate);
  for (const mutate of [
    row => { row.waterSystems[0].system_name = 'tampered'; },
    row => { row.villages.push({ ...row.villages[0] }); row.counts.villages++; },
    row => { row.waterSystems[0].village_id = 'missing'; },
    row => { row.sourceRevision = 999; }
  ]) {
    const invalid = structuredClone(candidate); mutate(invalid);
    assert.throws(() => store.accept(invalid));
    assert.equal(store.recover().datasetVersion, candidate.datasetVersion);
  }
  assert.throws(() => store.accept(structuredClone(candidate)), /Untrusted/);
});

test('sync failure and recovery never automatically serve prior snapshot as current', () => {
  const data = sourceFixture(); const store = createVerifiedSnapshotStore(snapshot(data, 1));
  assert.equal(store.state, 'UNKNOWN');
  store.publicResponse(snapshot(data, 1));
  assert.equal(store.state, 'CURRENT');
  assert.equal(store.syncFailed(), 'UNKNOWN');
  assert.throws(() => store.publicResponse(snapshot(data, null)), /unavailable/);
  const prior = store.recover();
  assert.equal(validatePublicSnapshot(prior), true);
  prior.waterSystems[0].system_name = 'local alteration';
  assert.notEqual(store.recover().waterSystems[0].system_name, 'local alteration');
  const futureCandidate = snapshot(data, 2);
  assert.equal(store.observeTrustedCandidate(futureCandidate), 'STALE');
});

test('complete but unordered candidate cannot become authoritative', () => {
  const data = sourceFixture();
  const candidate = createPublicSnapshot(eligible(data, null), { observationTime: '2026-10-19T04:00:00Z' });
  assert.equal(candidate.sourceRevision, null);
  assert.equal(candidate.ordering, 'UNKNOWN');
  assert.throws(() => createVerifiedSnapshotStore().accept(candidate), /ordering unavailable/);
});

test('empty complete dataset can be accepted when ordered evidence exists', () => {
  const data = { success: true, villages: [], waterSystems: [], waterSources: [] };
  const store = createVerifiedSnapshotStore();
  store.accept(snapshot(data, 11));
  const response = store.publicResponse(snapshot(data, 11));
  assert.deepEqual(response.villages, []);
  assert.deepEqual(response.waterSystems, []);
  assert.deepEqual(response.waterSources, []);
});

test('nested data in an allowlisted public field is rejected', () => {
  const data = sourceFixture();
  data.waterSystems[1].system_name = { secret: 'synthetic' };
  assert.throws(() => snapshot(data, 1), /Invalid public field/);
});
