import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSourceRead } from '../../tools/public-dataset/source-read.mjs';
import { selectPhysicalPublicationEligible } from '../../tools/public-dataset/eligibility.mjs';
import { projectPublicDataset } from '../../tools/public-dataset/projection.mjs';
import { sourceFixture, selfManifest, oracle, decisions, verified } from '../support/publication-fixture.mjs';

test('physical deletion is absence from a newly verified source read', () => {
  const first = sourceFixture();
  const second = sourceFixture(); second.waterSystems.splice(1, 1);
  const current = selectPhysicalPublicationEligible(verified(second, 2), decisions(second));
  assert.deepEqual(current.payload.waterSystems.map(row => row.system_id), ['s1']);
  assert.deepEqual(projectPublicDataset(current.payload, current.manifest).villages.map(row => row.village_id), ['v1', 'v4']);
  assert.equal(first.waterSystems.length - second.waterSystems.length, 1);
});

test('unverified, missing, duplicate and contradictory decisions fail closed', () => {
  const data = sourceFixture(); const read = verified(data);
  assert.throws(() => selectPhysicalPublicationEligible(read), /evidence required/);
  assert.throws(() => selectPhysicalPublicationEligible(read, () => ({ complete: true, authority: 'test', decisions: [] })), /Unverified/);
  assert.throws(() => selectPhysicalPublicationEligible(read, () => ({
    complete: true, authority: 'test', decisions: [
      { systemId: 's1', status: 'ELIGIBLE' }, { systemId: 's1', status: 'INELIGIBLE' }
    ]
  })), /contradictory/);
  assert.throws(() => selectPhysicalPublicationEligible(read, () => ({
    complete: true, authority: 'test', decisions: [
      { systemId: 's1', status: 'UNKNOWN' }, { systemId: 's2', status: 'ELIGIBLE' }
    ]
  })), /contradictory/);
});

test('synthetic processing or failed submission is excluded before village linkage', () => {
  const data = sourceFixture();
  const set = selectPhysicalPublicationEligible(verified(data), decisions(data, ['s1']));
  const projected = projectPublicDataset(set.payload, set.manifest);
  assert.deepEqual(projected.villages.map(row => row.village_id), ['v2', 'v4']);
  assert.deepEqual(projected.waterSources.map(row => row.source_id), ['r2', 'r4']);
  assert.equal(set.excludedSystems, 1);
});

test('source record-control fields are not silently interpreted as active', () => {
  const data = sourceFixture(); data.waterSystems[0].recordStatus = 'ACTIVE';
  const result = inspectSourceRead(data, selfManifest(data), oracle(data));
  assert.equal(result.verifiedRead, null);
  assert.equal(result.report.consistency, 'INVALID');
  assert.equal(JSON.stringify(result.report).includes('s1'), false);
});
