import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, unlink, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalSnapshotStorage } from '../../tools/public-dataset/local-storage.mjs';
import { publishLocalSnapshot } from '../../tools/public-dataset/local-publisher.mjs';
import { createLocalPublicGet } from '../../tools/public-dataset/local-serving.mjs';
import { consumeLocalDashboardResponse } from '../../tools/public-dataset/dashboard-consumer.mjs';
import { snapshot, sourceFixture } from '../support/publication-fixture.mjs';

async function fixture(t, hook) {
  const root = await mkdtemp(join(tmpdir(), 'village-snapshot-'));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return { root, store: createLocalSnapshotStorage(root, { hook }) };
}
const deferred = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const changed = update => { const data = sourceFixture(); update(data); return data; };

test('storage: immutable content address, readback and process restart', async t => {
  const { root, store } = await fixture(t);
  const candidate = snapshot();
  const id = await store.put(candidate);
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.deepEqual(await store.get(id), candidate);
  assert.equal(await store.put(candidate), id);
  assert.deepEqual(await createLocalSnapshotStorage(root).get(id), candidate);
  assert.deepEqual(await store.history(), [id]);
});

test('storage: missing and corrupted objects fail closed', async t => {
  const { root, store } = await fixture(t);
  const id = await store.put(snapshot());
  await writeFile(join(root, 'objects', `${id}.json`), '{"broken":true}');
  await assert.rejects(store.get(id), { code: 'OBJECT_CORRUPT' });
  await unlink(join(root, 'objects', `${id}.json`));
  await assert.rejects(store.get(id), { code: 'OBJECT_MISSING' });
});

test('storage: interrupted candidate write leaves no published pointer', async t => {
  const { root, store } = await fixture(t, point => { if (point === 'afterTemporaryWrite') throw new Error('synthetic interruption'); });
  assert.equal((await publishLocalSnapshot(store, snapshot())).code, 'STORAGE_ERROR');
  assert.equal(await store.pointer(), null);
  assert.deepEqual(await store.history(), []);
  const retry = createLocalSnapshotStorage(root);
  assert.equal((await publishLocalSnapshot(retry, snapshot())).code, 'PUBLISHED');
});

test('publication: identical duplicate delivery and same-revision conflict', async t => {
  const { store } = await fixture(t);
  const original = snapshot();
  assert.equal((await publishLocalSnapshot(store, original)).code, 'PUBLISHED');
  assert.equal((await publishLocalSnapshot(store, original)).code, 'ALREADY_PUBLISHED');
  const conflict = snapshot(changed(data => { data.waterSystems[1].system_name = 'changed'; }), 1);
  assert.equal((await publishLocalSnapshot(store, conflict)).code, 'REVISION_CONFLICT');
  assert.equal((await store.pointer()).revision, 1);
});

test('publication: newer revision wins; late old candidate and rollback rejected', async t => {
  const { store } = await fixture(t);
  const old = snapshot(sourceFixture(), 1);
  const newer = snapshot(sourceFixture(), 2);
  assert.equal((await publishLocalSnapshot(store, newer)).code, 'PUBLISHED');
  assert.equal((await publishLocalSnapshot(store, old)).code, 'STALE_REJECTED');
  assert.equal((await store.pointer()).revision, 2);
});

test('publication: slow writer cannot regress newer pointer', async t => {
  const gate = deferred(); const entered = deferred(); let delayed = false;
  const { store } = await fixture(t, async (point, context) => {
    if (point === 'afterObjectWrite' && !delayed && context.id) {
      delayed = true; entered.release(); await gate.promise;
    }
  });
  const slow = publishLocalSnapshot(store, snapshot(sourceFixture(), 1));
  await entered.promise;
  assert.equal((await publishLocalSnapshot(store, snapshot(sourceFixture(), 2))).code, 'PUBLISHED');
  gate.release();
  assert.equal((await slow).code, 'STALE_REJECTED');
  assert.equal((await store.pointer()).revision, 2);
});

test('publication: pointer failure leaves candidate as recovery artifact', async t => {
  let failOnce = true;
  const { root, store } = await fixture(t, point => {
    if (point === 'beforePointerCommit' && failOnce) { failOnce = false; throw new Error('synthetic pointer failure'); }
  });
  const candidate = snapshot();
  assert.equal((await publishLocalSnapshot(store, candidate)).code, 'PUBLICATION_INDETERMINATE');
  assert.equal(await store.pointer(), null);
  assert.equal((await store.history()).length, 1);
  assert.equal((await createLocalPublicGet(createLocalSnapshotStorage(root)).getData(candidate)).state, 'UNAVAILABLE');
  assert.equal((await publishLocalSnapshot(createLocalSnapshotStorage(root), candidate)).code, 'PUBLISHED');
});

test('publication: timeout after pointer commit resolves on retry and restart', async t => {
  let failOnce = true;
  const { root, store } = await fixture(t, point => {
    if (point === 'afterPointerCommit' && failOnce) { failOnce = false; throw new Error('synthetic response timeout'); }
  });
  const candidate = snapshot();
  assert.equal((await publishLocalSnapshot(store, candidate)).code, 'PUBLICATION_INDETERMINATE');
  assert.equal((await publishLocalSnapshot(createLocalSnapshotStorage(root), candidate)).code, 'ALREADY_PUBLISHED');
  assert.equal((await createLocalPublicGet(createLocalSnapshotStorage(root)).getVersion()).state, 'UNKNOWN');
});

test('publication: two concurrent identical writers converge without duplicate generation', async t => {
  const gate = deferred(), entered = deferred(); let held = false;
  const { store } = await fixture(t, async point => {
    if (point === 'beforePointerCommit' && !held) {
      held = true; entered.release(); await gate.promise;
    }
  });
  const candidate = snapshot();
  const first = publishLocalSnapshot(store, candidate);
  await entered.promise;
  const second = await publishLocalSnapshot(store, candidate);
  assert.equal(second.code, 'PUBLISH_BUSY');
  gate.release();
  assert.equal((await first).code, 'PUBLISHED');
  assert.equal((await publishLocalSnapshot(store, candidate)).code, 'ALREADY_PUBLISHED');
  assert.equal((await store.pointer()).generation, 1);
});

test('publication: missing object after pointer resolution fails closed', async t => {
  const { root, store } = await fixture(t);
  const candidate = snapshot();
  await publishLocalSnapshot(store, candidate);
  const pointer = await store.pointer();
  await unlink(join(root, 'objects', `${pointer.id}.json`));
  assert.equal((await createLocalPublicGet(store).getData(candidate)).code, 'OBJECT_MISSING');
});

test('publication: deletion outage preserves old object as UNKNOWN, not current', async t => {
  let outage = false;
  const { store } = await fixture(t, point => {
    if (point === 'beforePointerCommit' && outage) throw new Error('synthetic deletion outage');
  });
  const old = snapshot(sourceFixture(), 1);
  await publishLocalSnapshot(store, old);
  const data = changed(d => { d.waterSystems.splice(1, 1); });
  const deletion = snapshot(data, 2);
  outage = true;
  assert.equal((await publishLocalSnapshot(store, deletion)).code, 'PUBLICATION_INDETERMINATE');
  assert.equal((await store.pointer()).revision, 1);
  assert.equal((await createLocalPublicGet(store).getData(deletion)).state, 'STALE');
  assert.equal((await createLocalPublicGet(store).getData()).state, 'UNKNOWN');
  outage = false;
  assert.equal((await publishLocalSnapshot(store, deletion)).code, 'PUBLISHED');
  assert.deepEqual((await createLocalPublicGet(store).getData(deletion)).body.waterSystems, []);
});

test('publication: read-after-write delay blocks promotion then retry succeeds', async t => {
  let delay = true;
  const { store } = await fixture(t, point => {
    if (point === 'beforeObjectRead' && delay) { delay = false; throw Object.assign(new Error('delayed visibility'), { code: 'OBJECT_MISSING' }); }
  });
  const candidate = snapshot();
  assert.equal((await publishLocalSnapshot(store, candidate)).code, 'STORAGE_ERROR');
  assert.equal(await store.pointer(), null);
  assert.equal((await publishLocalSnapshot(store, candidate)).code, 'PUBLISHED');
});

test('publication: storage outage and corrupt readback cannot promote', async t => {
  let outage = true;
  const { store } = await fixture(t, point => {
    if (point === 'beforeObjectWrite' && outage) { outage = false; throw Object.assign(new Error('outage'), { code: 'STORAGE_UNAVAILABLE' }); }
  });
  const candidate = snapshot();
  assert.equal((await publishLocalSnapshot(store, candidate)).code, 'STORAGE_ERROR');
  assert.equal(await store.pointer(), null);
  assert.equal((await publishLocalSnapshot(store, candidate)).code, 'PUBLISHED');
});

test('publication: corrupt object readback blocks pointer promotion', async t => {
  let root;
  const entry = await fixture(t, async (point, context) => {
    if (point === 'afterObjectWrite') {
      await writeFile(join(root, 'objects', `${context.id}.json`), 'corrupt');
    }
  });
  root = entry.root;
  assert.equal((await publishLocalSnapshot(entry.store, snapshot())).code, 'STORAGE_ERROR');
  assert.equal(await entry.store.pointer(), null);
});

test('GET: version and data reads do not create publication files', async t => {
  const { root, store } = await fixture(t);
  const get = createLocalPublicGet(store);
  assert.equal((await get.getVersion()).state, 'UNAVAILABLE');
  assert.equal((await get.getData()).state, 'UNAVAILABLE');
  assert.deepEqual(await readdir(root), []);
  const candidate = snapshot();
  await publishLocalSnapshot(store, candidate);
  const before = await readdir(root);
  assert.equal((await get.getVersion(candidate)).state, 'CURRENT');
  assert.equal((await get.getData(candidate)).state, 'CURRENT');
  assert.deepEqual(await readdir(root), before);
});

test('GET: unknown, stale, corrupt and untrusted evidence never yields data', async t => {
  const { root, store } = await fixture(t);
  const old = snapshot(sourceFixture(), 1);
  await publishLocalSnapshot(store, old);
  const get = createLocalPublicGet(store);
  assert.equal((await get.getData()).state, 'UNKNOWN');
  assert.equal((await get.getData(structuredClone(old))).state, 'UNKNOWN');
  assert.equal((await get.getData(snapshot(sourceFixture(), 2))).state, 'STALE');
  const response = await get.getData(snapshot(sourceFixture(), 1));
  assert.equal(response.state, 'CURRENT');
  assert.deepEqual(consumeLocalDashboardResponse(response.body).waterSystems, response.body.waterSystems);
  const pointer = await store.pointer();
  await writeFile(join(root, 'objects', `${pointer.id}.json`), 'corrupt');
  assert.equal((await get.getData(old)).code, 'OBJECT_CORRUPT');
});

test('deletion: add, edit, coordinates, linkage, source, delete and rollback', async t => {
  const { root, store } = await fixture(t);
  const sequence = [sourceFixture()];
  sequence.push(changed(d => { d.waterSystems.push({ system_id: 's3', village_id: 'v3', latitude: 19, longitude: 100 }); }));
  sequence.push(structuredClone(sequence.at(-1))); sequence.at(-1).waterSystems[1].system_name = 'Edited';
  sequence.push(structuredClone(sequence.at(-1))); sequence.at(-1).waterSystems[1].latitude = '';
  sequence.push(structuredClone(sequence.at(-1))); sequence.at(-1).waterSystems[1].latitude = 19;
  sequence.push(structuredClone(sequence.at(-1))); sequence.at(-1).waterSystems[1].village_id = 'v3';
  sequence.push(structuredClone(sequence.at(-1))); sequence.at(-1).waterSources[1].source_type = 'OTHER';
  sequence.push(structuredClone(sequence.at(-1))); sequence.at(-1).waterSystems.splice(1, 1);
  for (let i = 0; i < sequence.length; i++) {
    const candidate = snapshot(sequence[i], i + 1);
    assert.equal((await publishLocalSnapshot(store, candidate)).code, 'PUBLISHED');
    assert.equal((await createLocalPublicGet(store).getData(candidate)).state, 'CURRENT');
  }
  const deleted = snapshot(sequence.at(-1), sequence.length);
  const response = await createLocalPublicGet(createLocalSnapshotStorage(root)).getData(deleted);
  assert.equal(response.body.waterSystems.some(row => row.system_id === 's2'), false);
  assert.equal((await publishLocalSnapshot(store, snapshot(sequence[0], 1))).code, 'STALE_REJECTED');
  assert.equal((await createLocalPublicGet(store).getData(snapshot(sequence[0], 1))).state, 'UNKNOWN');
  assert.equal((await store.history()).length, sequence.length);
});
