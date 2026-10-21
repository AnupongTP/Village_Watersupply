import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalSnapshotStorage } from '../../tools/public-dataset/local-storage.mjs';
import { migrateLocalSnapshot, publishLocalSnapshot } from '../../tools/public-dataset/local-publisher.mjs';
import { createLocalPublicGet } from '../../tools/public-dataset/local-serving.mjs';
import { datasetVersionFor, validatePublicSnapshot } from '../../tools/public-dataset/snapshot.mjs';
import { prepareLocalPublicCandidate } from '../../tools/public-dataset/local-integration.mjs';
import { decisions, oracle, selfManifest, snapshot, sourceFixture } from '../support/publication-fixture.mjs';

// Recreates the previous local schema-3 object and generation format. This is
// synthetic history, never a bypass into the current snapshot constructor.
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const byteHash = bytes => createHash('sha256').update(bytes).digest('hex');
function historical(candidate, schemaVersion = 3, policyRevision = candidate.policyRevision) {
  const old = structuredClone(candidate);
  old.schemaVersion = schemaVersion;
  old.policyRevision = policyRevision;
  delete old.publicationContract;
  old.datasetVersion = datasetVersionFor(old, schemaVersion, old.policyRevision);
  const { villages, waterSystems, waterSources, metadataHash, ...metadata } = old;
  old.metadataHash = hash(metadata);
  return old;
}
async function seedHistory(root, old) {
  await mkdir(join(root, 'objects'), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(old));
  const id = byteHash(bytes);
  await writeFile(join(root, 'objects', `${id}.json`), bytes);
  await writeFile(join(root, 'objects', `${id}.complete`), id);
  const pointer = { id, revision: old.sourceRevision, datasetVersion: old.datasetVersion, generation: 1 };
  const record = Buffer.from(JSON.stringify(pointer));
  await writeFile(join(root, 'publication-1.json'), record);
  await writeFile(join(root, 'publication-1.complete'), byteHash(record));
  return pointer;
}
async function fixture(t, old, hook) {
  const root = await mkdtemp(join(tmpdir(), 'village-policy-migration-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const pointer = await seedHistory(root, old);
  return { root, pointer, store: createLocalSnapshotStorage(root, { hook }) };
}
test('explicit same-revision schema migration remains unavailable before and during activation', async t => {
  const candidate = snapshot(sourceFixture(), 7);
  const predecessor = historical(candidate);
  assert.equal(predecessor.contentHash, candidate.contentHash);
  assert.notEqual(predecessor.datasetVersion, candidate.datasetVersion);
  let checkedDuringTransition = false;
  const { root, store } = await fixture(t, predecessor, async point => {
    if (point === 'beforePointerCommit') {
      checkedDuringTransition = true;
      const during = await createLocalPublicGet(store).getData(candidate);
      assert.equal(during.state, 'UNAVAILABLE');
      assert.equal(during.code, 'POLICY_MIGRATION_REQUIRED');
    }
  });
  const get = createLocalPublicGet(store);
  const before = await get.getVersion(candidate);
  assert.equal(before.state, 'UNAVAILABLE');
  assert.equal(before.code, 'POLICY_MIGRATION_REQUIRED');
  assert.equal((await get.getData(candidate)).state, 'UNAVAILABLE');
  assert.equal((await publishLocalSnapshot(store, candidate)).code, 'MIGRATION_REQUIRED');
  assert.equal((await migrateLocalSnapshot(store, candidate)).code, 'MIGRATED');
  assert.equal(checkedDuringTransition, true);
  const fresh = snapshot(sourceFixture(), 7);
  const response = await get.getData(fresh);
  assert.equal(response.state, 'CURRENT');
  assert.equal(response.body.waterSystems.some(row => row.system_id === 's2'), true);
  assert.equal((await get.getData()).state, 'UNKNOWN');
  assert.equal((await migrateLocalSnapshot(createLocalSnapshotStorage(root), fresh)).code, 'ALREADY_PUBLISHED');
});

async function expectSameRevisionContentConflict(t, change) {
  const original = sourceFixture();
  const { pointer, store } = await fixture(t, historical(snapshot(original, 12)));
  const changed = sourceFixture(); change(changed);
  const candidate = snapshot(changed, 12);
  assert.notEqual(candidate.contentHash, historical(snapshot(original, 12)).contentHash);
  assert.equal((await migrateLocalSnapshot(store, candidate)).code, 'MIGRATION_CONTENT_CONFLICT');
  assert.deepEqual(await store.pointer(), pointer);
  assert.equal((await createLocalPublicGet(store).getData(candidate)).state, 'UNAVAILABLE');
}

test('same revision with changed visible system name cannot migrate', async t => {
  await expectSameRevisionContentConflict(t, data => { data.waterSystems[1].system_name = 'Changed'; });
});

test('same revision with an added eligible public system cannot migrate', async t => {
  await expectSameRevisionContentConflict(t, data => {
    data.waterSystems.push({ system_id: 's3', village_id: 'v2', latitude: 19, longitude: 100 });
  });
});

test('same revision with a deleted public system cannot migrate', async t => {
  await expectSameRevisionContentConflict(t, data => { data.waterSystems.splice(1, 1); });
});

test('newer trusted source revision may migrate changed public content', async t => {
  const original = sourceFixture();
  const { store } = await fixture(t, historical(snapshot(original, 12)));
  const changed = sourceFixture(); changed.waterSystems[1].system_name = 'Changed at new revision';
  const candidate = snapshot(changed, 13);
  assert.notEqual(candidate.contentHash, snapshot(original, 12).contentHash);
  assert.equal((await migrateLocalSnapshot(store, candidate)).code, 'MIGRATED');
  assert.equal((await createLocalPublicGet(store).getData(snapshot(changed, 13))).state, 'CURRENT');
});

test('locked storage transition rejects conflict even without publisher preflight', async t => {
  const original = sourceFixture();
  const { root, pointer, store } = await fixture(t, historical(snapshot(original, 12)));
  const changed = sourceFixture(); changed.waterSystems[1].system_name = 'Unapproved same-revision change';
  const candidate = snapshot(changed, 12);
  const id = await store.put(candidate);
  await assert.rejects(store.compareAndSwapMigration(pointer.generation, {
    id, revision: candidate.sourceRevision, datasetVersion: candidate.datasetVersion,
    schemaVersion: candidate.schemaVersion, policyRevision: candidate.policyRevision
  }, candidate), { code: 'MIGRATION_CONTENT_CONFLICT' });
  assert.deepEqual(await store.pointer(), pointer);
  assert.equal((await readdir(root)).some(name => name === 'publication-2.complete'), false);
  assert.equal((await createLocalPublicGet(store).getData(candidate)).state, 'UNAVAILABLE');
});

test('same-policy conflict and lower source revision remain rejected across migration', async t => {
  const data = sourceFixture();
  const candidate = snapshot(data, 8);
  const { store } = await fixture(t, historical(snapshot(data, 7)));
  assert.equal((await migrateLocalSnapshot(store, candidate)).code, 'MIGRATED');
  const changed = sourceFixture(); changed.waterSystems[1].system_name = 'Different';
  assert.equal((await publishLocalSnapshot(store, snapshot(changed, 8))).code, 'REVISION_CONFLICT');
  assert.equal((await migrateLocalSnapshot(store, snapshot(changed, 8))).code, 'REVISION_CONFLICT');
  assert.equal((await migrateLocalSnapshot(store, snapshot(data, 7))).code, 'STALE_REJECTED');
  assert.equal((await publishLocalSnapshot(store, snapshot(data, 7))).code, 'STALE_REJECTED');
});

test('migration of a fresh hard-deletion projection cannot serve the historical deleted row', async t => {
  const original = sourceFixture();
  const { store } = await fixture(t, historical(snapshot(original, 5)));
  const deleted = sourceFixture(); deleted.waterSystems.splice(1, 1);
  const candidate = snapshot(deleted, 6);
  assert.equal((await migrateLocalSnapshot(store, candidate)).code, 'MIGRATED');
  const get = createLocalPublicGet(store);
  const response = await get.getData(snapshot(deleted, 6));
  assert.equal(response.state, 'CURRENT');
  assert.deepEqual(response.body.waterSystems, []);
  assert.equal((await get.getData(snapshot(original, 5))).state, 'UNKNOWN');
  assert.equal((await migrateLocalSnapshot(store, snapshot(original, 5))).code, 'STALE_REJECTED');
});

test('missing source and eligibility attestations cannot create a migration candidate', async t => {
  const data = sourceFixture();
  const { store } = await fixture(t, historical(snapshot(data, 2)));
  const noRead = prepareLocalPublicCandidate(data, selfManifest(data), {
    verifyEligibility: decisions(data), observationTime: '2026-10-19T04:00:00Z'
  });
  assert.equal(noRead.candidate, null);
  const noEligibility = prepareLocalPublicCandidate(data, selfManifest(data), {
    verifyRead: oracle(data, 2), observationTime: '2026-10-19T04:00:00Z'
  });
  assert.equal(noEligibility.candidate, null);
  await assert.rejects(migrateLocalSnapshot(store, structuredClone(snapshot(data, 2))), /Untrusted/);
  await assert.rejects(migrateLocalSnapshot(store, null));
  assert.equal((await store.pointer()).generation, 1);
});

test('unsupported schema, altered historical bytes, and untrusted candidates fail closed', async t => {
  const candidate = snapshot(sourceFixture(), 3);
  const legacy = await fixture(t, historical(candidate, 2));
  assert.equal((await migrateLocalSnapshot(legacy.store, candidate)).code, 'UNSUPPORTED_MIGRATION');
  assert.equal((await createLocalPublicGet(legacy.store).getData(candidate)).state, 'UNAVAILABLE');
  const unknownPolicy = await fixture(t, historical(candidate, 3, 'UNAPPROVED_OLD_POLICY'));
  assert.equal((await migrateLocalSnapshot(unknownPolicy.store, candidate)).code, 'UNSUPPORTED_MIGRATION');
  assert.equal((await createLocalPublicGet(unknownPolicy.store).getData(candidate)).state, 'UNAVAILABLE');
  const damaged = await fixture(t, historical(candidate));
  await writeFile(join(damaged.root, 'objects', `${damaged.pointer.id}.json`), '{"corrupt":true}');
  assert.equal((await migrateLocalSnapshot(damaged.store, candidate)).code, 'UNSUPPORTED_MIGRATION');
  assert.equal((await damaged.store.pointer()).generation, 1);
  const altered = structuredClone(candidate); altered.waterSystems[0].system_name = 'tampered';
  await assert.rejects(migrateLocalSnapshot(damaged.store, altered));
  assert.equal(validatePublicSnapshot(candidate), true);
});

test('interrupted candidate write and pointer transition do not partially activate', async t => {
  const candidate = snapshot(sourceFixture(), 4);
  const writeFailure = await fixture(t, historical(candidate), point => {
    if (point === 'afterTemporaryWrite') throw new Error('synthetic write interruption');
  });
  assert.equal((await migrateLocalSnapshot(writeFailure.store, candidate)).code, 'STORAGE_ERROR');
  assert.equal((await writeFailure.store.pointer()).generation, 1);
  assert.equal((await createLocalPublicGet(writeFailure.store).getData(candidate)).state, 'UNAVAILABLE');
  const pointerFailure = await fixture(t, historical(candidate), point => {
    if (point === 'beforePointerCommit') throw new Error('synthetic pointer interruption');
  });
  assert.equal((await migrateLocalSnapshot(pointerFailure.store, candidate)).code, 'PUBLICATION_INDETERMINATE');
  assert.equal((await pointerFailure.store.pointer()).generation, 1);
  assert.equal((await createLocalPublicGet(pointerFailure.store).getData(candidate)).state, 'UNAVAILABLE');
  assert.equal((await migrateLocalSnapshot(createLocalSnapshotStorage(pointerFailure.root), candidate)).code, 'MIGRATED');
});

test('timeout after activation is resolved by idempotent retry; GET and version remain read-only', async t => {
  const candidate = snapshot(sourceFixture(), 9);
  let failOnce = true;
  const { root, store } = await fixture(t, historical(candidate), point => {
    if (point === 'afterPointerCommit' && failOnce) {
      failOnce = false; throw new Error('synthetic response timeout');
    }
  });
  assert.equal((await migrateLocalSnapshot(store, candidate)).code, 'PUBLICATION_INDETERMINATE');
  assert.equal((await migrateLocalSnapshot(createLocalSnapshotStorage(root), candidate)).code, 'ALREADY_PUBLISHED');
  const before = await readdir(root);
  const beforeObjects = await readdir(join(root, 'objects'));
  const get = createLocalPublicGet(createLocalSnapshotStorage(root));
  assert.equal((await get.getVersion(snapshot(sourceFixture(), 9))).state, 'CURRENT');
  assert.equal((await get.getData(snapshot(sourceFixture(), 9))).state, 'CURRENT');
  assert.deepEqual(await readdir(root), before);
  assert.deepEqual(await readdir(join(root, 'objects')), beforeObjects);
  const old = historical(candidate);
  assert.notEqual(old.datasetVersion, candidate.datasetVersion);
  assert.equal(old.sourceRevision, candidate.sourceRevision);
  assert.equal(old.contentHash, candidate.contentHash);
});
