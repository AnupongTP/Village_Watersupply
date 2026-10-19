import { performance } from 'node:perf_hooks';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { sourceFixture, snapshot } from '../tests/support/publication-fixture.mjs';
import { createLocalSnapshotStorage } from './public-dataset/local-storage.mjs';
import { publishLocalSnapshot } from './public-dataset/local-publisher.mjs';
import { createLocalPublicGet } from './public-dataset/local-serving.mjs';

function largeFixture() {
  const data = sourceFixture();
  data.villages = []; data.waterSystems = []; data.waterSources = [];
  for (let i = 0; i < 250; i++) {
    const id = `v${i}`;
    data.villages.push({ village_id: id, village_name: `Synthetic ${i}`, has_village_waterworks: true });
    data.waterSystems.push({ system_id: `s${i}`, village_id: id, latitude: 19, longitude: 100,
      system_name: `Synthetic system ${i}` });
    data.waterSources.push({ source_id: `r${i}`, village_id: id, source_type: 'SYNTHETIC' });
  }
  return data;
}
const quantile = (sorted, q) => sorted[Math.ceil(sorted.length * q) - 1];
async function measure(name, operation, count = 21) {
  const times = [], heaps = [];
  for (let i = 0; i < count; i++) {
    const before = process.memoryUsage().heapUsed, start = performance.now();
    await operation();
    times.push(performance.now() - start);
    heaps.push(process.memoryUsage().heapUsed - before);
  }
  times.sort((a, b) => a - b);
  return { model: name, samples: count, medianMs: +quantile(times, .5).toFixed(3),
    p95Ms: +quantile(times, .95).toFixed(3),
    medianHeapDeltaBytes: quantile(heaps.sort((a, b) => a - b), .5) };
}
const root = await mkdtemp(join(tmpdir(), 'village-benchmark-'));
if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temp path');
try {
  const data = largeFixture(), store = createLocalSnapshotStorage(root);
  const candidate = snapshot(data, 1);
  const publicationStart = performance.now();
  const published = await publishLocalSnapshot(store, candidate);
  const publicationMs = +(performance.now() - publicationStart).toFixed(3);
  if (published.code !== 'PUBLISHED') throw new Error(published.code);
  const pointer = await store.pointer();
  const get = createLocalPublicGet(store);
  const rows = [];
  rows.push(await measure('A_FULL_SYNTHETIC_READ_VERIFY_PROJECT', () => snapshot(data, 1)));
  rows.push(await measure('B_STORAGE_READ_NO_FRESHNESS', () => store.get(pointer.id)));
  rows.push(await measure('C_FULL_VERIFY_THEN_SAFE_GET', () => get.getData(snapshot(data, 1))));
  rows.push(await measure('D_REPEAT_STORAGE_READ_AFTER_PUBLICATION', () => store.get(pointer.id)));
  console.log(JSON.stringify({
    fixture: { villages: 250, waterSystems: 250, waterSources: 250, synthetic: true },
    bytes: { source: Buffer.byteLength(JSON.stringify(data)),
      snapshot: Buffer.byteLength(JSON.stringify(candidate)) },
    publicationMs, rows,
    semantics: {
      A: 'new synthetic independent verification and projection per read; no persistent storage',
      B: 'one object read per request; freshness UNKNOWN, unsafe to serve as CURRENT',
      C: 'full synthetic source verification plus pointer/object read; CURRENT only for matching candidate',
      D: 'one initial publication, repeated object reads; freshness UNKNOWN without new evidence'
    },
    storageOperationsPerSample: { A: 0, B: 1, C: 'pointer listing + pointer file + marker + object file + marker', D: 1 },
    cacheHits: { A: 0, B: 0, C: 0, D: 0 },
    note: 'Local synthetic timings only; heap deltas include GC noise. No Production latency or freshness guarantee.'
  }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
