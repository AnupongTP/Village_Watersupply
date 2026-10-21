import { createHash } from 'node:crypto';
import { projectPublicDataset, PUBLIC_FIELDS, PUBLIC_PROJECTION_POLICY_REVISION } from './projection.mjs';
import { assertEligibleSet } from './eligibility.mjs';

// Schema 4 records the explicit publication-transition contract. Schema 3
// with this same restrictive field policy is readable only for migration.
export const SNAPSHOT_SCHEMA_VERSION = 4;
export const MIGRATION_SOURCE_SCHEMA_VERSION = 3;
export const PUBLICATION_CONTRACT = 'EXPLICIT_POLICY_MIGRATION_V1';
const KEYS = ['villages', 'waterSystems', 'waterSources'];
const IDS = { villages: 'village_id', waterSystems: 'system_id', waterSources: 'source_id' };
const candidateProofs = new WeakMap();

function canonical(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite snapshot value');
    if (value === undefined || typeof value === 'function') throw new Error('Non-JSON snapshot value');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Non-plain snapshot value');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function contentOf(snapshot) {
  return Object.fromEntries(KEYS.map(key => [key, [...snapshot[key]].sort((a, b) => {
    const left = String(a[IDS[key]]); const right = String(b[IDS[key]]);
    return left < right ? -1 : left > right ? 1 : 0;
  })]));
}
// The payload checksum remains independent of schema and disclosure policy.
// Version identity changes when either contract changes, even for empty data.
export function datasetVersionFor(content, schemaVersion, policyRevision) {
  return `sha256:${hash({
    schemaVersion,
    policyRevision,
    content: contentOf(content)
  })}`;
}
function metadataOf(snapshot) {
  const { villages, waterSystems, waterSources, metadataHash, ...metadata } = snapshot;
  return metadata;
}
function validCounts(counts) {
  return counts && typeof counts === 'object' && KEYS.every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0);
}

// Requires independently verified source and publication decisions. A revision
// can be absent; that candidate can be checked/recovered but not promoted.
export function createPublicSnapshot(eligible, { observationTime } = {}) {
  assertEligibleSet(eligible);
  if (typeof observationTime !== 'string' || !Number.isFinite(Date.parse(observationTime))) {
    throw new Error('Valid observationTime required');
  }
  const projected = projectPublicDataset(eligible.payload, eligible.manifest);
  const content = Object.fromEntries(KEYS.map(key => [key, projected[key]]));
  const contentHash = hash(contentOf(content));
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    policyRevision: PUBLIC_PROJECTION_POLICY_REVISION,
    publicationContract: PUBLICATION_CONTRACT,
    projectionOwner: 'SERVER_R5_1',
    completeness: 'VERIFIED',
    ordering: eligible.sourceRevision === null ? 'UNKNOWN' : 'VERIFIED',
    sourceRevision: eligible.sourceRevision,
    datasetVersion: datasetVersionFor(content, SNAPSHOT_SCHEMA_VERSION, PUBLIC_PROJECTION_POLICY_REVISION),
    contentHash,
    generatedAt: eligible.generatedAt,
    observationTime,
    counts: Object.fromEntries(KEYS.map(key => [key, content[key].length])),
    sourceCounts: { ...eligible.sourceCounts },
    eligibleCounts: { ...eligible.manifest.counts },
    excludedSystems: eligible.excludedSystems,
    suppression: projected.suppression,
    ...content
  };
  snapshot.metadataHash = hash(metadataOf(snapshot));
  validatePublicSnapshot(snapshot);
  candidateProofs.set(snapshot, Object.freeze({
    metadataHash: snapshot.metadataHash,
    contentHash: snapshot.contentHash,
    sourceRevision: snapshot.sourceRevision
  }));
  return snapshot;
}

function validateSnapshotFor(snapshot, schemaVersion, historical = false) {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== schemaVersion) {
    throw new Error('Unsupported snapshot schema');
  }
  if (snapshot.policyRevision !== PUBLIC_PROJECTION_POLICY_REVISION) {
    throw new Error('Unsupported public projection policy');
  }
  if (historical ? snapshot.publicationContract !== undefined :
      snapshot.publicationContract !== PUBLICATION_CONTRACT) {
    throw new Error('Unsupported publication contract');
  }
  if (snapshot.projectionOwner !== 'SERVER_R5_1' || snapshot.completeness !== 'VERIFIED') {
    throw new Error('Invalid projection or completeness contract');
  }
  const revisionValid = snapshot.sourceRevision === null ||
    (Number.isSafeInteger(snapshot.sourceRevision) && snapshot.sourceRevision >= 0);
  if (!revisionValid || snapshot.ordering !== (snapshot.sourceRevision === null ? 'UNKNOWN' : 'VERIFIED')) {
    throw new Error('Invalid source ordering metadata');
  }
  if (typeof snapshot.observationTime !== 'string' || !Number.isFinite(Date.parse(snapshot.observationTime)) ||
      (snapshot.generatedAt !== null && typeof snapshot.generatedAt !== 'string')) {
    throw new Error('Invalid timestamp metadata');
  }
  if (!validCounts(snapshot.counts) || !validCounts(snapshot.sourceCounts) ||
      !validCounts(snapshot.eligibleCounts) || !snapshot.suppression) throw new Error('Missing integrity metadata');
  const villageIds = new Set();
  for (const key of KEYS) {
    if (!Array.isArray(snapshot[key]) || snapshot.counts[key] !== snapshot[key].length ||
        snapshot.sourceCounts[key] < snapshot.eligibleCounts[key] ||
        snapshot.eligibleCounts[key] < snapshot.counts[key]) throw new Error(`${key}: invalid snapshot count`);
    const seen = new Set();
    let previousId = null;
    for (const row of snapshot[key]) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.getPrototypeOf(row) !== Object.prototype) {
        throw new Error(`${key}: invalid record`);
      }
      if (Object.keys(row).some(field => !PUBLIC_FIELDS[key].includes(field))) throw new Error(`${key}: non-public field`);
      if (Object.values(row).some(value => value !== null &&
          (!['string', 'number', 'boolean'].includes(typeof value) ||
            (typeof value === 'number' && !Number.isFinite(value))))) {
        throw new Error(`${key}: invalid public value`);
      }
      const id = String(row[IDS[key]] ?? '').trim();
      if (!id || seen.has(id)) throw new Error(`${key}: missing or duplicate ID`);
      if (previousId !== null && id < previousId) throw new Error(`${key}: unordered public records`);
      previousId = id;
      seen.add(id);
      if (key === 'villages') villageIds.add(id);
    }
  }
  for (const key of ['waterSystems', 'waterSources']) {
    for (const row of snapshot[key]) {
      if (!villageIds.has(String(row.village_id ?? '').trim())) throw new Error(`${key}: orphan village`);
    }
  }
  if (snapshot.waterSystems.some(row => row.latitude === null || row.latitude === undefined ||
      String(row.latitude).trim() === '' || row.longitude === null || row.longitude === undefined ||
      String(row.longitude).trim() === '')) throw new Error('Snapshot contains coordinate-ineligible system');
  const s = snapshot.suppression;
  if (s.rule !== 'R5_1_TEMP_HIDE_244' || s.inputVillages !== snapshot.eligibleCounts.villages ||
      s.inputWaterSystems !== snapshot.eligibleCounts.waterSystems || s.outputVillages !== snapshot.counts.villages ||
      s.outputWaterSystems !== snapshot.counts.waterSystems ||
      s.hiddenWaterworksVillagesWithoutSystem !== s.inputVillages - s.outputVillages ||
      s.hiddenMissingCoordinateSystems !== s.inputWaterSystems - s.outputWaterSystems ||
      s.hiddenIssueRows !== s.hiddenWaterworksVillagesWithoutSystem + s.hiddenMissingCoordinateSystems ||
      !Number.isSafeInteger(snapshot.excludedSystems) ||
      snapshot.excludedSystems !== snapshot.sourceCounts.waterSystems - snapshot.eligibleCounts.waterSystems) {
    throw new Error('Inconsistent publication or suppression metadata');
  }
  const actualHash = hash(contentOf(snapshot));
  if (snapshot.contentHash !== actualHash || snapshot.datasetVersion !==
      datasetVersionFor(snapshot, schemaVersion, PUBLIC_PROJECTION_POLICY_REVISION)) {
    throw new Error('Snapshot content hash mismatch');
  }
  if (snapshot.metadataHash !== hash(metadataOf(snapshot))) throw new Error('Snapshot metadata hash mismatch');
  return true;
}

export function validatePublicSnapshot(snapshot) {
  return validateSnapshotFor(snapshot, SNAPSHOT_SCHEMA_VERSION);
}

// This exact predecessor is never eligible for Public GET or normal recovery.
// Schema 2 and any unknown policy are intentionally unsupported.
export function validateMigrationSourceSnapshot(snapshot) {
  return validateSnapshotFor(snapshot, MIGRATION_SOURCE_SCHEMA_VERSION, true);
}

// A deserialized hash-valid object does not carry the independent source and
// eligibility proof. Only candidates constructed by this module can be staged.
export function assertTrustedSnapshotCandidate(candidate) {
  validatePublicSnapshot(candidate);
  const proof = candidateProofs.get(candidate);
  if (!proof || proof.metadataHash !== candidate.metadataHash ||
      proof.contentHash !== candidate.contentHash ||
      proof.sourceRevision !== candidate.sourceRevision) {
    throw new Error('Untrusted or altered snapshot candidate');
  }
  return candidate;
}

// The store has no durable pointer and makes no Production freshness guarantee.
// Every public read requires a newly verified candidate with identical public
// content and revision. Source revision alone cannot prove eligibility unchanged.
export function createVerifiedSnapshotStore(initialSnapshot = null) {
  let lastVerified = null;
  let freshness = 'UNAVAILABLE';
  if (initialSnapshot !== null) {
    validatePublicSnapshot(initialSnapshot);
    lastVerified = structuredClone(initialSnapshot);
    freshness = 'UNKNOWN';
  }
  return {
    accept(candidate) {
      validatePublicSnapshot(candidate);
      const proof = candidateProofs.get(candidate);
      if (!proof || proof.metadataHash !== candidate.metadataHash || proof.contentHash !== candidate.contentHash ||
          proof.sourceRevision !== candidate.sourceRevision) throw new Error('Untrusted or altered snapshot candidate');
      if (candidate.sourceRevision === null) throw new Error('Trusted ordering unavailable; candidate not promoted');
      if (lastVerified && lastVerified.sourceRevision !== null) {
        if (candidate.sourceRevision < lastVerified.sourceRevision) throw new Error('Stale snapshot candidate');
        if (candidate.sourceRevision === lastVerified.sourceRevision &&
            candidate.datasetVersion !== lastVerified.datasetVersion) throw new Error('Conflicting snapshot revision');
      }
      lastVerified = structuredClone(candidate);
      freshness = 'UNKNOWN';
      return structuredClone(lastVerified);
    },
    observeTrustedCandidate(candidate) {
      if (!lastVerified) { freshness = 'UNAVAILABLE'; return freshness; }
      validatePublicSnapshot(candidate);
      const proof = candidateProofs.get(candidate);
      if (!proof || proof.metadataHash !== candidate.metadataHash || proof.contentHash !== candidate.contentHash ||
          proof.sourceRevision !== candidate.sourceRevision) {
        freshness = 'UNKNOWN';
        throw new Error('Freshness candidate is untrusted or altered');
      }
      if (candidate.sourceRevision === null) { freshness = 'UNKNOWN'; return freshness; }
      freshness = candidate.sourceRevision > lastVerified.sourceRevision ? 'STALE' :
        candidate.sourceRevision === lastVerified.sourceRevision &&
        candidate.datasetVersion === lastVerified.datasetVersion ? 'CURRENT' : 'UNKNOWN';
      return freshness;
    },
    syncFailed() { freshness = lastVerified ? 'UNKNOWN' : 'UNAVAILABLE'; return freshness; },
    get state() { return freshness; },
    recover() { return lastVerified ? structuredClone(lastVerified) : null; },
    publicResponse(freshCandidate) {
      if (this.observeTrustedCandidate(freshCandidate) !== 'CURRENT') throw new Error('Current public dataset unavailable');
      validatePublicSnapshot(lastVerified);
      return {
        success: true, generatedAt: lastVerified.generatedAt,
        projectionOwner: lastVerified.projectionOwner,
        villages: structuredClone(lastVerified.villages),
        waterSystems: structuredClone(lastVerified.waterSystems),
        waterSources: structuredClone(lastVerified.waterSources)
      };
    }
  };
}
