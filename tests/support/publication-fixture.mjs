import { inspectSourceRead } from '../../tools/public-dataset/source-read.mjs';
import { selectPhysicalPublicationEligible } from '../../tools/public-dataset/eligibility.mjs';
import { createPublicSnapshot } from '../../tools/public-dataset/snapshot.mjs';

export function sourceFixture() {
  return {
    success: true,
    generatedAt: '2026-10-19T03:00:00Z',
    villages: [
      { village_id: 'v1', village_name: 'Only blank system', has_village_waterworks: 'YES' },
      { village_id: 'v2', village_name: 'Visible', has_village_waterworks: true },
      { village_id: 'v3', village_name: 'No linked system', has_village_waterworks: true },
      { village_id: 'v4', village_name: 'No waterworks', has_village_waterworks: false }
    ],
    waterSystems: [
      { system_id: 's1', village_id: 'v1', latitude: '', longitude: 100, system_name: 'No coordinate', operational_status: 'WORKING' },
      { system_id: 's2', village_id: 'v2', latitude: 19, longitude: 100, system_name: 'Visible', operational_status: 'NOT_WORKING' }
    ],
    waterSources: [
      { source_id: 'r1', village_id: 'v1', source_type: 'PWA' },
      { source_id: 'r2', village_id: 'v2', source_type: 'PWA' },
      { source_id: 'r3', village_id: 'v3', source_type: 'PWA' },
      { source_id: 'r4', village_id: 'v4', source_type: 'PWA' }
    ]
  };
}

export const selfManifest = data => ({ complete: true, counts: {
  villages: data.villages.length, waterSystems: data.waterSystems.length, waterSources: data.waterSources.length
} });

// Synthetic independent oracle for local tests only. Production would need a
// separately verified source/commit contract; this helper is not that proof.
export function oracle(data, revision = 1) {
  const expectedIds = {
    villages: data.villages.map(row => row.village_id),
    waterSystems: data.waterSystems.map(row => row.system_id),
    waterSources: data.waterSources.map(row => row.source_id)
  };
  return () => ({
    complete: true, consistentRead: true, authority: 'synthetic oracle',
    tables: { villages: 'villages', waterSystems: 'water_systems', waterSources: 'village_water_sources' },
    headers: {
      villages: ['village_id', 'has_village_waterworks'],
      waterSystems: ['system_id', 'village_id', 'latitude', 'longitude'],
      waterSources: ['source_id', 'village_id']
    },
    tableIds: structuredClone(expectedIds),
    revision: revision === null ? null : { value: revision, monotonic: true, authority: 'synthetic revision sequence' }
  });
}

export function decisions(data, ineligible = []) {
  const expected = data.waterSystems.map(row => ({
    systemId: row.system_id,
    status: ineligible.includes(row.system_id) ? 'INELIGIBLE' : 'ELIGIBLE'
  }));
  return () => ({
    complete: true, authority: 'synthetic publication oracle', decisions: structuredClone(expected)
  });
}

export function verified(data = sourceFixture(), revision = 1) {
  const result = inspectSourceRead(data, selfManifest(data), oracle(data, revision));
  if (!result.verifiedRead) throw new Error(`Fixture verification failed: ${result.report.reasons.join(',')}`);
  return result.verifiedRead;
}

export function eligible(data = sourceFixture(), revision = 1, ineligible = []) {
  return selectPhysicalPublicationEligible(verified(data, revision), decisions(data, ineligible));
}

export function snapshot(data = sourceFixture(), revision = 1, ineligible = []) {
  return createPublicSnapshot(eligible(data, revision, ineligible), {
    observationTime: '2026-10-19T04:00:00Z'
  });
}
