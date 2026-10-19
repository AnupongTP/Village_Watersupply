import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSourceRead } from '../../tools/public-dataset/source-read.mjs';
import { sourceFixture, selfManifest, oracle } from '../support/publication-fixture.mjs';

test('structure, internal consistency, and independent completeness are separate gates', () => {
  const data = sourceFixture();
  const missing = inspectSourceRead({ villages: [] }, null);
  assert.equal(missing.report.structure, 'INVALID');
  assert.equal(inspectSourceRead({ ...data, success: undefined }, selfManifest(data), oracle(data)).report.structure, 'INVALID');
  const noManifest = inspectSourceRead(data, null, oracle(data));
  assert.equal(noManifest.report.structure, 'VALID');
  assert.equal(noManifest.report.consistency, 'INVALID');
  const selfOnly = inspectSourceRead(data, selfManifest(data));
  assert.equal(selfOnly.report.consistency, 'VALID');
  assert.equal(selfOnly.report.completeness, 'UNVERIFIABLE');
  assert.equal(selfOnly.verifiedRead, null);
  const verified = inspectSourceRead(data, selfManifest(data), oracle(data));
  assert.equal(verified.report.completeness, 'VERIFIED');
  assert.equal(verified.report.ordering, 'VERIFIED');
});

test('self-count equality cannot override missing, mismatched or unstable independent evidence', () => {
  const data = sourceFixture();
  for (const evidence of [
    { ...oracle(data)(), complete: false },
    { ...oracle(data)(), consistentRead: false },
    { ...oracle(data)(), tableIds: { ...oracle(data)().tableIds, waterSystems: ['s1'] } },
    { ...oracle(data)(), tables: { ...oracle(data)().tables, waterSystems: 'wrong_sheet' } },
    { ...oracle(data)(), headers: { ...oracle(data)().headers, waterSystems: ['system_id'] } }
  ]) {
    const result = inspectSourceRead(data, selfManifest(data), () => evidence);
    assert.equal(result.verifiedRead, null);
    assert.equal(result.report.completeness, 'INCOMPLETE');
  }
  const outage = inspectSourceRead(data, selfManifest(data), () => { throw new Error('private provider detail'); });
  assert.deepEqual(outage.report.reasons, ['INDEPENDENT_EVIDENCE_UNAVAILABLE']);
  assert.equal(JSON.stringify(outage.report).includes('private provider detail'), false);
});

test('complete source without trusted monotonic revision remains unordered', () => {
  const data = sourceFixture();
  const result = inspectSourceRead(data, selfManifest(data), oracle(data, null));
  assert.equal(result.report.completeness, 'VERIFIED');
  assert.equal(result.report.ordering, 'UNKNOWN');
  assert.equal(result.verifiedRead.sourceRevision, null);
  assert.equal(Object.isFrozen(result.verifiedRead.payload.waterSystems[0]), true);
});

test('empty but independently verified complete datasets are valid', () => {
  const data = { success: true, villages: [], waterSystems: [], waterSources: [] };
  const result = inspectSourceRead(data, selfManifest(data), oracle(data, 7));
  assert.equal(result.report.structure, 'VALID');
  assert.equal(result.report.consistency, 'VALID');
  assert.equal(result.report.completeness, 'VERIFIED');
  assert.equal(result.verifiedRead.sourceRevision, 7);
});

test('duplicate IDs and invalid relationships fail internal consistency without private ID diagnostics', () => {
  const duplicate = sourceFixture(); duplicate.waterSources.push({ ...duplicate.waterSources[0] });
  const first = inspectSourceRead(duplicate, selfManifest(duplicate), oracle(duplicate));
  assert.equal(first.report.consistency, 'INVALID');
  const orphan = sourceFixture(); orphan.waterSystems[0].village_id = 'private-row-123';
  const second = inspectSourceRead(orphan, selfManifest(orphan), oracle(orphan));
  assert.equal(second.report.consistency, 'INVALID');
  assert.equal(JSON.stringify(second.report).includes('private-row-123'), false);
});

test('independent ID evidence captured before a later source change detects incompleteness', () => {
  const data = sourceFixture();
  const independent = oracle(data);
  data.waterSystems.pop();
  const result = inspectSourceRead(data, selfManifest(data), independent);
  assert.equal(result.report.consistency, 'VALID');
  assert.equal(result.report.completeness, 'INCOMPLETE');
  assert.equal(result.verifiedRead, null);
});
