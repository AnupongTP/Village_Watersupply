// Synthetic, local-only comparison. Run with: node tools/benchmark-public-dataset.mjs
import { performance } from 'node:perf_hooks';
import { buildTemporaryPublicScope } from '../assets/js/public-scope.js';
import { projectPublicDataset } from './public-dataset/projection.mjs';
import { createPublicSnapshot, createVerifiedSnapshotStore } from './public-dataset/snapshot.mjs';
import { inspectSourceRead } from './public-dataset/source-read.mjs';
import { selectPhysicalPublicationEligible } from './public-dataset/eligibility.mjs';

const villages = Array.from({ length: 1000 }, (_, i) => ({
  village_id: `v${i}`, village_name: `Synthetic ${i}`, has_village_waterworks: i % 5 !== 0,
  district: `d${i % 10}`, local_authority: `a${i % 50}`
}));
const waterSystems = Array.from({ length: 900 }, (_, i) => ({
  system_id: `s${i}`, village_id: `v${i}`, system_name: `Synthetic system ${i}`,
  latitude: i % 7 === 0 ? '' : 19 + i / 10000, longitude: 100 + i / 10000,
  operational_status: i % 3 === 0 ? 'NOT_WORKING' : 'WORKING'
}));
const waterSources = Array.from({ length: 5000 }, (_, i) => ({
  source_id: `r${i}`, village_id: `v${i % 1000}`, source_type: 'PWA', households: i % 100
}));
const payload = { success: true, villages, waterSystems, waterSources };
const manifest = { complete: true, counts: { villages: villages.length, waterSystems: waterSystems.length, waterSources: waterSources.length } };
const verifyRead = () => ({
  complete: true, consistentRead: true, authority: 'synthetic benchmark oracle',
  tables: { villages: 'villages', waterSystems: 'water_systems', waterSources: 'village_water_sources' },
  headers: {
    villages: ['village_id', 'has_village_waterworks'],
    waterSystems: ['system_id', 'village_id', 'latitude', 'longitude'],
    waterSources: ['source_id', 'village_id']
  },
  tableIds: {
    villages: villages.map(row => row.village_id),
    waterSystems: waterSystems.map(row => row.system_id),
    waterSources: waterSources.map(row => row.source_id)
  },
  revision: { value: 1, monotonic: true, authority: 'synthetic benchmark sequence' }
});
const verifyEligibility = () => ({
  complete: true, authority: 'synthetic benchmark oracle',
  decisions: waterSystems.map(row => ({ systemId: row.system_id, status: 'ELIGIBLE' }))
});
const verified = () => inspectSourceRead(payload, manifest, verifyRead).verifiedRead;
const build = () => createPublicSnapshot(selectPhysicalPublicationEligible(verified(), verifyEligibility), {
  observationTime: '2026-10-19T00:00:00Z'
});
const snapshot = build();
const store = createVerifiedSnapshotStore(snapshot);
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function sample(fn) {
  for (let i = 0; i < 5; i++) fn();
  const times = []; const heaps = [];
  for (let i = 0; i < 21; i++) {
    if (global.gc) global.gc();
    const beforeHeap = process.memoryUsage().heapUsed;
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
    heaps.push(process.memoryUsage().heapUsed - beforeHeap);
  }
  return { medianMs: median(times), medianHeapDeltaBytes: median(heaps) };
}
const results = {
  fixtureCounts: manifest.counts,
  sampleCount: 21,
  existingProjection: sample(() => buildTemporaryPublicScope(payload)),
  validatedProjection: sample(() => projectPublicDataset(payload, manifest)),
  independentReadVerification: sample(() => verified()),
  publicationEligibility: sample(() => selectPhysicalPublicationEligible(verified(), verifyEligibility)),
  snapshotReuse: sample(() => store.recover()),
  fullVerifiedSnapshotBuild: sample(build),
  serializedBytes: {
    source: Buffer.byteLength(JSON.stringify(payload)),
    projected: Buffer.byteLength(JSON.stringify(projectPublicDataset(payload, manifest))),
    snapshot: Buffer.byteLength(JSON.stringify(snapshot))
  }
};
console.log(JSON.stringify(results, null, 2));
