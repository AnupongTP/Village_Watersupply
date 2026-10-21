import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createLocalSourceAuthority, assertStableSourceGeneration } from '../../tools/public-dataset/local-source-authority.mjs';
import { createLocalPrivateSourceGateway, assertGatewaySuccess } from '../../tools/public-dataset/local-private-gateway.mjs';
import { createLocalSnapshotStorage } from '../../tools/public-dataset/local-storage.mjs';
import { publishLocalSnapshot } from '../../tools/public-dataset/local-publisher.mjs';
import { createLocalPublicGet } from '../../tools/public-dataset/local-serving.mjs';
import { inspectSourceRead } from '../../tools/public-dataset/source-read.mjs';
import { sourceFixture, selfManifest } from '../support/publication-fixture.mjs';

const time = '2026-10-21T00:00:00.000Z';
const eligible = { s1: 'ELIGIBLE', s2: 'ELIGIBLE' };
const hashString = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'village-source-authority-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const authority = createLocalSourceAuthority(join(root, 'authority'));
  await authority.initialize(sourceFixture(), eligible);
  return { root, authority };
}
const renamed = () => {
  const data = sourceFixture(); data.waterSystems[1].system_name = 'Updated synthetic name'; return data;
};
async function committedUpdate(authority, id = 'update-1') {
  const expectedRows = renamed();
  await authority.begin({ id, kind: 'MANAGEMENT_UPDATE', expectedRows });
  await authority.applyTable(id, 'waterSystems', expectedRows.waterSystems);
  return authority.resolve(id, { readback: await authority.observedReadback(), eligibility: eligible });
}

test('initial READY revision and private candidate are local synthetic generation zero', async t => {
  const { authority } = await setup(t);
  assert.deepEqual(await authority.status(), { state: 'READY', revision: 0, unresolved: null, reason: null });
  const prepared = await authority.verifiedGeneration(time);
  assert.equal(prepared.candidate.schemaVersion, 4);
  assert.equal(prepared.candidate.sourceRevision, 0);
  assert.equal(prepared.report.completeness, 'VERIFIED');
});

test('incorrect table headers cannot initialize a READY authority', async t => {
  const root = await mkdtemp(join(tmpdir(), 'village-source-headers-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const authority = createLocalSourceAuthority(join(root, 'authority'));
  await assert.rejects(authority.initialize(sourceFixture(), eligible, {
    headers: { villages: ['village_id', 'has_village_waterworks'],
      waterSystems: ['system_id', 'village_id'], waterSources: ['source_id', 'village_id'] }
  }), /INCOMPLETE_SOURCE_READ/);
  assert.equal((await authority.status()).state, 'BLOCKED');
});

test('fence precedes normalized write; commit advances once and retry is idempotent', async t => {
  const { authority } = await setup(t);
  const expectedRows = renamed();
  await authority.begin({ id: 'u1', kind: 'MANAGEMENT_UPDATE', expectedRows });
  await assert.rejects(authority.begin({ id: 'u1', kind: 'MANAGEMENT_UPDATE',
    expectedRows: sourceFixture() }), /MUTATION_IDEMPOTENCY_CONFLICT/);
  assert.equal((await authority.status()).state, 'WRITING');
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
  await authority.applyTable('u1', 'waterSystems', expectedRows.waterSystems);
  const proof = await authority.observedReadback();
  assert.deepEqual(await authority.resolve('u1', { readback: proof, eligibility: eligible }),
    { code: 'COMMITTED', revision: 1 });
  assert.deepEqual(await authority.resolve('u1', { readback: proof, eligibility: eligible }),
    { code: 'ALREADY_COMMITTED', revision: 1 });
  assert.equal((await authority.begin({ id: 'u1', kind: 'MANAGEMENT_UPDATE', expectedRows })).code,
    'ALREADY_COMMITTED');
});

test('crash before first normalized write can abort only with unchanged readback', async t => {
  const { authority } = await setup(t);
  await authority.begin({ id: 'u2', kind: 'MANAGEMENT_UPDATE', expectedRows: renamed() });
  await authority.interrupt('u2');
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
  assert.deepEqual(await authority.abortUnchanged('u2', await authority.observedReadback()),
    { code: 'ABORTED_UNCHANGED', revision: 0 });
  assert.equal((await authority.status()).state, 'READY');
});

test('an applied write cannot be silently classified as an unchanged abort', async t => {
  const { authority } = await setup(t);
  const expectedRows = renamed();
  await authority.begin({ id: 'u-applied', kind: 'MANAGEMENT_UPDATE', expectedRows });
  await authority.applyTable('u-applied', 'waterSystems', sourceFixture().waterSystems);
  await assert.rejects(authority.abortUnchanged('u-applied', await authority.observedReadback()),
    /ABORT_REQUIRES_UNCHANGED_READBACK/);
  assert.equal((await authority.status()).state, 'WRITING');
});

test('multi-sheet partial write and forged readback cannot be confirmed', async t => {
  const { authority } = await setup(t);
  const expectedRows = renamed();
  expectedRows.villages[1].village_name = 'Changed synthetic village';
  await authority.begin({ id: 'partial', kind: 'MANAGEMENT_UPDATE', expectedRows });
  await authority.applyTable('partial', 'waterSystems', expectedRows.waterSystems);
  await authority.interrupt('partial', 'PARTIAL_NORMALIZATION');
  await assert.rejects(authority.resolve('partial', {
    readback: await authority.observedReadback(), eligibility: eligible
  }), /READBACK_OR_EXPECTED_ROWS_MISMATCH/);
  await assert.rejects(authority.resolve('partial', {
    readback: { rows: expectedRows, generation: 3 }, eligibility: eligible
  }), /READBACK_OR_EXPECTED_ROWS_MISMATCH/);
  assert.equal((await authority.status()).state, 'NEEDS_RECONCILE');
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
});

test('crash after physical change but before commit marker requires a new observed readback', async t => {
  const { root, authority } = await setup(t);
  const expectedRows = renamed();
  await authority.begin({ id: 'u3', kind: 'MANAGEMENT_UPDATE', expectedRows });
  await authority.applyTable('u3', 'waterSystems', expectedRows.waterSystems);
  await authority.interrupt('u3');
  const restarted = createLocalSourceAuthority(join(root, 'authority'));
  assert.equal((await restarted.status()).state, 'NEEDS_RECONCILE');
  await assert.rejects(restarted.resolve('u3', { eligibility: eligible }), /READBACK_OR_EXPECTED_ROWS_MISMATCH/);
  assert.deepEqual(await restarted.resolve('u3', {
    readback: await restarted.observedReadback(), eligibility: eligible
  }), { code: 'COMMITTED', revision: 1 });
});

test('Feature 3 raw-first, malformed reference, and duplicate submission are explicit', async t => {
  const { authority } = await setup(t);
  await assert.rejects(authority.appendRaw('bad', { status: 'RECEIVED' }), /INVALID_RAW_SUBMISSION/);
  const raw = { village_id_ref: 'v2', status: 'RECEIVED', synthetic: true };
  assert.equal((await authority.appendRaw('submission-1', raw)).code, 'RECEIVED');
  assert.equal((await authority.appendRaw('submission-1', raw)).code, 'ALREADY_RECEIVED');
  await assert.rejects(authority.appendRaw('submission-1', { ...raw, status: 'FAILED' }),
    /RAW_IDEMPOTENCY_CONFLICT/);
  const expectedRows = sourceFixture();
  expectedRows.waterSystems.push({ system_id: 's3', village_id: 'v2', latitude: 19, longitude: 100 });
  await assert.rejects(authority.begin({ id: 'f-missing', kind: 'FEATURE3',
    rawSubmissionId: 'missing', expectedRows }), /RAW_SUBMISSION_REQUIRED/);
  await authority.begin({ id: 'f1', kind: 'FEATURE3', rawSubmissionId: 'submission-1', expectedRows });
  await authority.applyTable('f1', 'waterSystems', expectedRows.waterSystems);
  await assert.rejects(authority.applyTable('f1', 'waterSources', []), /WRITE_FENCE_REQUIRED/);
  assert.deepEqual(await authority.resolve('f1', { readback: await authority.observedReadback(),
    eligibility: { ...eligible, s3: 'ELIGIBLE' } }), { code: 'COMMITTED', revision: 1 });
  assert.equal((await authority.begin({ id: 'f1', kind: 'FEATURE3',
    rawSubmissionId: 'submission-1', expectedRows })).code, 'ALREADY_COMMITTED');
});

test('Feature 3 FAILED status does not authorize partial normalized content', async t => {
  const { authority } = await setup(t);
  await authority.appendRaw('failed', { village_id_ref: 'v5', newVillageEvidence: true, status: 'FAILED' });
  const expectedRows = sourceFixture();
  expectedRows.waterSystems.push({ system_id: 's3', village_id: 'v5', latitude: 19, longitude: 100 });
  expectedRows.villages.push({ village_id: 'v5', village_name: 'New synthetic village',
    has_village_waterworks: true });
  await authority.begin({ id: 'f-partial', kind: 'FEATURE3', rawSubmissionId: 'failed', expectedRows });
  await authority.applyTable('f-partial', 'waterSystems', expectedRows.waterSystems);
  await authority.interrupt('f-partial');
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
  await assert.rejects(authority.resolve('f-partial', {
    readback: await authority.observedReadback(), eligibility: { ...eligible, s3: 'ELIGIBLE' }
  }), /READBACK_OR_EXPECTED_ROWS_MISMATCH/);
});

test('Feature 3 PROCESSED text alone cannot replace per-system eligibility evidence', async t => {
  const { authority } = await setup(t);
  await authority.appendRaw('processed-text', { village_id_ref: 'v2', status: 'PROCESSED' });
  const expectedRows = sourceFixture();
  expectedRows.waterSystems.push({ system_id: 's3', village_id: 'v2', latitude: 19, longitude: 100 });
  await authority.begin({ id: 'f-no-eligibility', kind: 'FEATURE3',
    rawSubmissionId: 'processed-text', expectedRows });
  await authority.applyTable('f-no-eligibility', 'waterSystems', expectedRows.waterSystems);
  await assert.rejects(authority.resolve('f-no-eligibility', {
    readback: await authority.observedReadback(), eligibility: eligible
  }), /ELIGIBILITY_UNVERIFIED/);
  assert.equal((await authority.status()).state, 'WRITING');
});

test('Management PREPARED update and reader/recovery race fail closed until confirmed', async t => {
  const { authority } = await setup(t);
  await authority.begin({ id: 'prepared', kind: 'MANAGEMENT_UPDATE', expectedRows: renamed() });
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
  await authority.applyTable('prepared', 'waterSystems', renamed().waterSystems);
  await authority.interrupt('prepared', 'PREPARED_RECOVERY');
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
  assert.equal((await authority.resolve('prepared', {
    readback: await authority.observedReadback(), eligibility: eligible
  })).revision, 1);
  assert.equal((await authority.verifiedGeneration(time)).candidate.sourceRevision, 1);
});

test('physical hard delete, audit evidence, and duplicate recovery preserve ordering', async t => {
  const { authority } = await setup(t);
  const before = await authority.verifiedGeneration(time);
  const expectedRows = sourceFixture(); expectedRows.waterSystems.splice(1, 1);
  await assert.rejects(authority.begin({ id: 'update-delete', kind: 'MANAGEMENT_UPDATE', expectedRows }),
    /UPDATE_CANNOT_CHANGE_ROW_SET/);
  await assert.rejects(authority.begin({ id: 'delete-no-audit', kind: 'HARD_DELETE', expectedRows }),
    /DELETE_AUDIT_REQUIRED/);
  await authority.begin({ id: 'delete-1', kind: 'HARD_DELETE', expectedRows,
    auditEvidence: { entryId: 'audit-delete-1', action: 'HARD_DELETE',
      systemId: 's2', status: 'PREPARED' } });
  await authority.applyTable('delete-1', 'waterSystems', expectedRows.waterSystems);
  await authority.interrupt('delete-1', 'PREPARED_AFTER_PHYSICAL_DELETE');
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
  assert.deepEqual(await authority.resolve('delete-1', {
    readback: await authority.observedReadback(), eligibility: { s1: 'ELIGIBLE' }
  }), { code: 'COMMITTED', revision: 1 });
  assert.equal((await authority.resolve('delete-1')).code, 'ALREADY_COMMITTED');
  const after = await authority.verifiedGeneration(time);
  assert.deepEqual(after.candidate.waterSystems, []);
  assert.notEqual(after.candidate.sourceRevision, before.candidate.sourceRevision);
});

test('direct source drift blocks READY until separately invoked reconciliation', async t => {
  const { authority } = await setup(t);
  const changed = sourceFixture(); changed.waterSystems[1].system_name = 'Manual edit';
  await authority.simulateDirectEdit('waterSystems', changed.waterSystems);
  assert.equal((await authority.status()).revision, null);
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
  await assert.rejects(authority.reconcileDrift({ eligibility: eligible }), /RECONCILIATION_EVIDENCE_REQUIRED/);
  assert.deepEqual(await authority.reconcileDrift({
    readback: await authority.observedReadback(), eligibility: eligible
  }), { code: 'RECONCILED', revision: 1 });
});

test('incomplete independent evidence, duplicate IDs and orphan references reject candidate', async t => {
  const { authority } = await setup(t);
  assert.equal(inspectSourceRead(sourceFixture(), selfManifest(sourceFixture())).verifiedRead, null);
  const duplicate = sourceFixture(); duplicate.waterSystems.push({ ...duplicate.waterSystems[0] });
  await assert.rejects(authority.simulateDirectEdit('unknown', []), /INVALID_TABLE/);
  await authority.simulateDirectEdit('waterSystems', duplicate.waterSystems);
  await assert.rejects(authority.reconcileDrift({
    readback: await authority.observedReadback(), eligibility: eligible
  }));
  assert.equal((await authority.status()).state, 'NEEDS_RECONCILE');
});

test('missing or contradictory eligibility cannot commit or create public candidate', async t => {
  const { authority } = await setup(t);
  const expectedRows = renamed();
  await authority.begin({ id: 'u4', kind: 'MANAGEMENT_UPDATE', expectedRows });
  await authority.applyTable('u4', 'waterSystems', expectedRows.waterSystems);
  const proof = await authority.observedReadback();
  await assert.rejects(authority.resolve('u4', { readback: proof, eligibility: {} }));
  await assert.rejects(authority.resolve('u4', { readback: proof,
    eligibility: { ...eligible, extra: 'ELIGIBLE' } }));
  assert.equal((await authority.status()).state, 'WRITING');
});

test('unsupported authority state fails closed and gateway rejects untrusted requests', async t => {
  const { authority } = await setup(t);
  const gateway = createLocalPrivateSourceGateway(authority, {
    authorize: request => request.principal === 'synthetic-server'
  });
  assert.equal((await gateway.request({ action: 'VERIFIED_SOURCE_READ', nonce: 'n1',
    principal: 'untrusted', observationTime: time })).success, false);
  const accepted = await gateway.request({ action: 'VERIFIED_SOURCE_READ', nonce: 'n2',
    principal: 'synthetic-server', observationTime: time });
  assert.equal(assertGatewaySuccess(accepted).candidate.sourceRevision, 0);
  assert.equal((await gateway.request({ action: 'SOURCE_STATUS', nonce: 'large',
    principal: 'synthetic-server', padding: 'x'.repeat(3000) })).code, 'REQUEST_REJECTED');
  assert.equal((await gateway.request({ action: 'VERIFIED_SOURCE_READ', nonce: 'n2',
    principal: 'synthetic-server', observationTime: time })).success, false);
  assert.throws(() => assertGatewaySuccess({ success: false }), /PRIVATE_GATEWAY_REJECTED/);
  await authority.block('UNSUPPORTED_AUTHORITY_STATE');
  await assert.rejects(authority.verifiedGeneration(time), /SOURCE_NOT_READY/);
  assert.equal((await gateway.request({ action: 'SOURCE_STATUS', nonce: 'n3',
    principal: 'synthetic-server' })).status.state, 'BLOCKED');
});

test('safe candidate reaches local publisher; old deleted row cannot supersede newer revision', async t => {
  const { root, authority } = await setup(t);
  const storage = createLocalSnapshotStorage(join(root, 'published'));
  const oldCandidate = (await authority.verifiedGeneration(time)).candidate;
  assert.equal((await authority.publishReady(storage, time)).code, 'PUBLISHED');
  const expectedRows = sourceFixture(); expectedRows.waterSystems.splice(1, 1);
  await authority.begin({ id: 'delete-publish', kind: 'HARD_DELETE', expectedRows,
    auditEvidence: { entryId: 'audit-delete-publish', action: 'HARD_DELETE',
      systemId: 's2', status: 'PREPARED' } });
  await authority.applyTable('delete-publish', 'waterSystems', expectedRows.waterSystems);
  await assert.rejects(authority.publishReady(storage, time), /SOURCE_NOT_READY/);
  await authority.resolve('delete-publish', {
    readback: await authority.observedReadback(), eligibility: { s1: 'ELIGIBLE' }
  });
  assert.equal((await authority.publishReady(storage, time)).code, 'PUBLISHED');
  assert.equal((await publishLocalSnapshot(storage, oldCandidate)).code, 'STALE_REJECTED');
  const fresh = (await authority.verifiedGeneration(time)).candidate;
  const response = await createLocalPublicGet(storage).getData(fresh);
  assert.equal(response.state, 'CURRENT');
  assert.equal(response.body.waterSystems.some(row => row.system_id === 's2'), false);
});

test('raw append alone does not advance source revision or make a system eligible', async t => {
  const { authority } = await setup(t);
  await authority.appendRaw('raw-only', { village_id_ref: 'v2', status: 'RECEIVED' });
  assert.equal((await authority.status()).revision, 0);
  assert.deepEqual((await authority.verifiedGeneration(time)).candidate.waterSystems.map(row => row.system_id), ['s2']);
});

test('stable revision number cannot excuse changed generation or changed rows during read', () => {
  const rows = sourceFixture();
  const before = { state: 'READY', generation: 3, revision: 7, rows,
    committedDigest: 'synthetic-digest' };
  assert.doesNotThrow(() => assertStableSourceGeneration(before, structuredClone(before)));
  assert.throws(() => assertStableSourceGeneration(before, { ...before, generation: 4 }),
    /REVISION_CHANGED_DURING_READ/);
  const changed = structuredClone(before);
  changed.rows.waterSystems[0].system_name = 'Untracked edit';
  assert.throws(() => assertStableSourceGeneration(before, changed), /REVISION_CHANGED_DURING_READ/);
});

test('broken foreign key prevents evidence-backed direct-edit reconciliation', async t => {
  const { authority } = await setup(t);
  const invalid = sourceFixture(); invalid.waterSystems[0].village_id = 'missing-village';
  await authority.simulateDirectEdit('waterSystems', invalid.waterSystems);
  await assert.rejects(authority.reconcileDrift({
    readback: await authority.observedReadback(), eligibility: eligible
  }));
  assert.equal((await authority.status()).state, 'NEEDS_RECONCILE');
});

test('Feature 3 all normalized writes can be committed despite stale raw text only with evidence', async t => {
  const { authority } = await setup(t);
  await authority.appendRaw('raw-status', { village_id_ref: 'v5', newVillageEvidence: true, status: 'FAILED' });
  const expectedRows = sourceFixture();
  expectedRows.waterSystems.push({ system_id: 's3', village_id: 'v5', latitude: 19, longitude: 100 });
  expectedRows.villages.push({ village_id: 'v5', village_name: 'New synthetic village',
    has_village_waterworks: true });
  await authority.begin({ id: 'feature-recovery', kind: 'FEATURE3',
    rawSubmissionId: 'raw-status', expectedRows });
  await authority.applyTable('feature-recovery', 'villages', expectedRows.villages);
  await authority.applyTable('feature-recovery', 'waterSystems', expectedRows.waterSystems);
  await authority.interrupt('feature-recovery');
  assert.equal((await authority.resolve('feature-recovery', {
    readback: await authority.observedReadback(), eligibility: { ...eligible, s3: 'INELIGIBLE' }
  })).revision, 1);
  assert.equal((await authority.verifiedGeneration(time)).candidate.waterSystems.some(row => row.system_id === 's3'), false);
});

test('F01 committed raw submission has one durable system mapping across restart', async t => {
  const { root, authority } = await setup(t);
  await authority.appendRaw('raw-once', { village_id_ref: 'v2', status: 'RECEIVED' });
  const first = sourceFixture();
  first.waterSystems.push({ system_id: 's3', village_id: 'v2', latitude: 19, longitude: 100 });
  const original = { id: 'f-once', kind: 'FEATURE3', rawSubmissionId: 'raw-once', expectedRows: first };
  await authority.begin(original);
  await authority.applyTable('f-once', 'waterSystems', first.waterSystems);
  assert.deepEqual(await authority.resolve('f-once', {
    readback: await authority.observedReadback(), eligibility: { ...eligible, s3: 'ELIGIBLE' }
  }), { code: 'COMMITTED', revision: 1 });
  assert.deepEqual(await authority.begin(original), { code: 'ALREADY_COMMITTED', revision: 1 });
  const second = structuredClone(first);
  second.waterSystems.push({ system_id: 's4', village_id: 'v2', latitude: 19, longitude: 100 });
  const reused = { id: 'f-second', kind: 'FEATURE3', rawSubmissionId: 'raw-once', expectedRows: second };
  await assert.rejects(authority.begin(reused), /RAW_SUBMISSION_ALREADY_CONSUMED/);
  assert.equal((await authority.status()).revision, 1);
  const restarted = createLocalSourceAuthority(join(root, 'authority'));
  assert.deepEqual(await restarted.begin(original), { code: 'ALREADY_COMMITTED', revision: 1 });
  await assert.rejects(restarted.begin(reused), /RAW_SUBMISSION_ALREADY_CONSUMED/);
  assert.deepEqual((await restarted.verifiedGeneration(time)).verifiedRead.payload.waterSystems
    .map(row => row.system_id), ['s1', 's2', 's3']);
});

test('F01 pending raw reservation survives restart and proven pre-write abort releases it', async t => {
  const { root, authority } = await setup(t);
  await authority.appendRaw('raw-pending', { village_id_ref: 'v2', status: 'RECEIVED' });
  const first = sourceFixture();
  first.waterSystems.push({ system_id: 's3', village_id: 'v2', latitude: 19, longitude: 100 });
  await authority.begin({ id: 'f-pending', kind: 'FEATURE3',
    rawSubmissionId: 'raw-pending', expectedRows: first });
  const restarted = createLocalSourceAuthority(join(root, 'authority'));
  await assert.rejects(restarted.begin({ id: 'f-other', kind: 'FEATURE3',
    rawSubmissionId: 'raw-pending', expectedRows: first }), /RAW_SUBMISSION_RESERVED/);
  assert.deepEqual(await restarted.abortUnchanged('f-pending', await restarted.observedReadback()),
    { code: 'ABORTED_UNCHANGED', revision: 0 });
  const second = sourceFixture();
  second.waterSystems.push({ system_id: 's4', village_id: 'v2', latitude: 19, longitude: 100 });
  await restarted.begin({ id: 'f-other', kind: 'FEATURE3',
    rawSubmissionId: 'raw-pending', expectedRows: second });
  await restarted.applyTable('f-other', 'waterSystems', second.waterSystems);
  assert.equal((await restarted.resolve('f-other', {
    readback: await restarted.observedReadback(), eligibility: { ...eligible, s4: 'ELIGIBLE' }
  })).revision, 1);
});

test('F01 unresolved partial raw mutation cannot be bypassed by another mutation ID', async t => {
  const { root, authority } = await setup(t);
  await authority.appendRaw('raw-partial', { village_id_ref: 'v5',
    newVillageEvidence: true, status: 'FAILED' });
  const expectedRows = sourceFixture();
  expectedRows.villages.push({ village_id: 'v5', has_village_waterworks: true });
  expectedRows.waterSystems.push({ system_id: 's3', village_id: 'v5', latitude: 19, longitude: 100 });
  await authority.begin({ id: 'f-partial-ledger', kind: 'FEATURE3',
    rawSubmissionId: 'raw-partial', expectedRows });
  await authority.applyTable('f-partial-ledger', 'villages', expectedRows.villages);
  await authority.interrupt('f-partial-ledger');
  const restarted = createLocalSourceAuthority(join(root, 'authority'));
  await assert.rejects(restarted.begin({ id: 'f-bypass', kind: 'FEATURE3',
    rawSubmissionId: 'raw-partial', expectedRows }), /RAW_SUBMISSION_RESERVED/);
  assert.equal((await restarted.status()).revision, null);
});

test('F03 committed mutation identity rejects changed rows, kind and raw ID after restart', async t => {
  const { root, authority } = await setup(t);
  await authority.appendRaw('raw-identity', { village_id_ref: 'v2', status: 'RECEIVED' });
  const expectedRows = sourceFixture();
  expectedRows.waterSystems.push({ system_id: 's3', village_id: 'v2', latitude: 19, longitude: 100 });
  const original = { id: 'f-identity', kind: 'FEATURE3',
    rawSubmissionId: 'raw-identity', expectedRows };
  await authority.begin(original);
  await authority.applyTable('f-identity', 'waterSystems', expectedRows.waterSystems);
  await authority.resolve('f-identity', { readback: await authority.observedReadback(),
    eligibility: { ...eligible, s3: 'ELIGIBLE' } });
  const restarted = createLocalSourceAuthority(join(root, 'authority'));
  assert.deepEqual(await restarted.begin(original), { code: 'ALREADY_COMMITTED', revision: 1 });
  const changed = structuredClone(expectedRows);
  changed.waterSystems[2].system_name = 'Conflicting synthetic payload';
  for (const attempt of [
    { ...original, expectedRows: changed },
    { ...original, kind: 'MANAGEMENT_UPDATE' },
    { ...original, rawSubmissionId: 'different-raw' }
  ]) await assert.rejects(restarted.begin(attempt), /MUTATION_IDEMPOTENCY_CONFLICT/);
  assert.equal((await restarted.status()).revision, 1);
  assert.deepEqual((await restarted.verifiedGeneration(time)).verifiedRead.payload.waterSystems,
    expectedRows.waterSystems);
});

test('F03 committed Hard Delete rejects changed audit evidence', async t => {
  const { authority } = await setup(t);
  const expectedRows = sourceFixture(); expectedRows.waterSystems.splice(1, 1);
  const original = { id: 'd-identity', kind: 'HARD_DELETE', expectedRows,
    auditEvidence: { entryId: 'audit-original', action: 'HARD_DELETE',
      systemId: 's2', status: 'PREPARED' } };
  await authority.begin(original);
  await authority.applyTable('d-identity', 'waterSystems', expectedRows.waterSystems);
  await authority.resolve('d-identity', { readback: await authority.observedReadback(),
    eligibility: { s1: 'ELIGIBLE' } });
  assert.deepEqual(await authority.begin(original), { code: 'ALREADY_COMMITTED', revision: 1 });
  await assert.rejects(authority.begin({ ...original,
    auditEvidence: { ...original.auditEvidence, entryId: 'audit-conflict' } }),
  /MUTATION_IDEMPOTENCY_CONFLICT/);
  assert.equal((await authority.status()).revision, 1);
});

test('F02 concurrent same nonce is reserved before async authorization yields', async t => {
  const { authority } = await setup(t);
  let releaseAuthorization, signalStarted;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const held = new Promise(resolve => { releaseAuthorization = resolve; });
  const gateway = createLocalPrivateSourceGateway(authority, {
    authorize: async () => { signalStarted(); await held; return true; }
  });
  const request = { action: 'SOURCE_STATUS', nonce: 'same-nonce', principal: 'synthetic-server' };
  const first = gateway.request(request);
  await started;
  const duplicate = await gateway.request(request);
  assert.deepEqual(duplicate, { success: false, code: 'REQUEST_REJECTED' });
  releaseAuthorization();
  assert.equal((await first).success, true);
  assert.deepEqual(await gateway.request(request), { success: false, code: 'REQUEST_REJECTED' });
});

test('F02 denied authorization retains nonce and capacity fails closed', async t => {
  const { authority } = await setup(t);
  const gateway = createLocalPrivateSourceGateway(authority, {
    authorize: async () => false, maxReplayEntries: 1
  });
  const first = { action: 'SOURCE_STATUS', nonce: 'denied-once' };
  assert.deepEqual(await gateway.request(first), { success: false, code: 'REQUEST_REJECTED' });
  assert.deepEqual(await gateway.request(first), { success: false, code: 'REQUEST_REJECTED' });
  assert.deepEqual(await gateway.request({ ...first, nonce: 'capacity-exhausted' }),
    { success: false, code: 'REQUEST_REJECTED' });
});

test('F04 incomplete newer generation blocks status, verified read and publication after restart', async t => {
  const { root, authority } = await setup(t);
  const directory = join(root, 'authority');
  const original = await readdir(directory);
  await writeFile(join(directory, 'authority-2.json'), '{"state":"WRITING"}');
  const orphaned = await readdir(directory);
  assert.equal((await authority.status()).state, 'BLOCKED');
  assert.equal((await authority.status()).revision, null);
  await assert.rejects(authority.verifiedGeneration(time), /JOURNAL_INTEGRITY_UNRESOLVED/);
  await assert.rejects(authority.publishReady(createLocalSnapshotStorage(join(root, 'published')), time),
    /JOURNAL_INTEGRITY_UNRESOLVED/);
  const restarted = createLocalSourceAuthority(directory);
  assert.equal((await restarted.status()).state, 'BLOCKED');
  await assert.rejects(restarted.begin({ id: 'after-orphan', kind: 'MANAGEMENT_UPDATE',
    expectedRows: renamed() }), /JOURNAL_INTEGRITY_UNRESOLVED/);
  assert.deepEqual(await readdir(directory), orphaned);
  assert.equal(original.includes('authority-2.json'), false);
});

test('F04 JSON and status without completion marker stay untouched and unavailable', async t => {
  const { root, authority } = await setup(t);
  const directory = join(root, 'authority');
  await writeFile(join(directory, 'authority-2.json'), '{"state":"WRITING"}');
  await writeFile(join(directory, 'authority-2.status.json'), '{"state":"WRITING"}');
  const names = await readdir(directory);
  assert.deepEqual(await authority.status(), { state: 'BLOCKED', revision: null,
    unresolved: null, reason: 'JOURNAL_INTEGRITY_UNRESOLVED' });
  await assert.rejects(authority.verifiedGeneration(time), /JOURNAL_INTEGRITY_UNRESOLVED/);
  assert.deepEqual(await readdir(directory), names);
});

test('F04 corrupt completion marker blocks current revision without automatic repair', async t => {
  const { root, authority } = await setup(t);
  const directory = join(root, 'authority');
  await writeFile(join(directory, 'authority-2.json'), '{"state":"WRITING"}');
  await writeFile(join(directory, 'authority-2.status.json'), '{"state":"WRITING"}');
  await writeFile(join(directory, 'authority-2.complete'), 'invalid-marker');
  const names = await readdir(directory);
  assert.equal((await authority.status()).revision, null);
  await assert.rejects(authority.verifiedGeneration(time), /JOURNAL_INTEGRITY_UNRESOLVED/);
  assert.deepEqual(await readdir(directory), names);
});

test('F03 legacy committed ID without fingerprint and raw ledger fails closed', async t => {
  const { root, authority } = await setup(t);
  await authority.appendRaw('legacy-raw', { village_id_ref: 'v2', status: 'RECEIVED' });
  const expectedRows = sourceFixture();
  expectedRows.waterSystems.push({ system_id: 's3', village_id: 'v2', latitude: 19, longitude: 100 });
  const original = { id: 'legacy-feature', kind: 'FEATURE3',
    rawSubmissionId: 'legacy-raw', expectedRows };
  await authority.begin(original);
  await authority.applyTable('legacy-feature', 'waterSystems', expectedRows.waterSystems);
  await authority.resolve('legacy-feature', { readback: await authority.observedReadback(),
    eligibility: { ...eligible, s3: 'ELIGIBLE' } });
  const directory = join(root, 'authority');
  const generations = (await readdir(directory)).filter(name => /^authority-\d+\.complete$/.test(name));
  const generation = Math.max(...generations.map(name => Number(name.match(/\d+/)[0])));
  const journalPath = join(directory, `authority-${generation}.json`);
  const statusPath = join(directory, `authority-${generation}.status.json`);
  const record = JSON.parse(await readFile(journalPath, 'utf8'));
  const status = JSON.parse(await readFile(statusPath, 'utf8'));
  delete record.committedMutations;
  delete record.rawConsumption;
  delete record.rawLedgerComplete;
  delete status.identityComplete;
  const recordBytes = JSON.stringify(record), statusBytes = JSON.stringify(status);
  await writeFile(journalPath, recordBytes);
  await writeFile(statusPath, statusBytes);
  await writeFile(join(directory, `authority-${generation}.complete`),
    `${hashString(recordBytes)}:${hashString(statusBytes)}`);
  const restarted = createLocalSourceAuthority(directory);
  assert.deepEqual(await restarted.status(), { state: 'BLOCKED', revision: null,
    unresolved: null, reason: 'LEGACY_IDENTITY_UNVERIFIABLE' });
  await assert.rejects(restarted.begin(original), /MUTATION_IDENTITY_UNVERIFIABLE/);
  const reused = structuredClone(expectedRows);
  reused.waterSystems.push({ system_id: 's4', village_id: 'v2', latitude: 19, longitude: 100 });
  await assert.rejects(restarted.begin({ id: 'legacy-reuse', kind: 'FEATURE3',
    rawSubmissionId: 'legacy-raw', expectedRows: reused }), /RAW_CONSUMPTION_UNVERIFIABLE/);
  await assert.rejects(restarted.verifiedGeneration(time), /SOURCE_NOT_READY/);
});
