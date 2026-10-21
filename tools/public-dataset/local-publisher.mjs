import { assertTrustedSnapshotCandidate, validatePublicSnapshot } from './snapshot.mjs';

const same = (candidate, pointer, id) => pointer?.id === id &&
  pointer.revision === candidate.sourceRevision && pointer.datasetVersion === candidate.datasetVersion &&
  pointer.schemaVersion === candidate.schemaVersion && pointer.policyRevision === candidate.policyRevision;
const result = (code, pointer = null, error = null) => ({ code, pointer, error: error?.code ?? null });
const nextOf = (candidate, id) => ({ id, revision: candidate.sourceRevision,
  datasetVersion: candidate.datasetVersion, schemaVersion: candidate.schemaVersion,
  policyRevision: candidate.policyRevision });

async function stage(storage, candidate) {
  const id = await storage.put(candidate);
  const readback = await storage.get(id);
  validatePublicSnapshot(readback);
  if (readback.metadataHash !== candidate.metadataHash ||
      readback.contentHash !== candidate.contentHash ||
      readback.sourceRevision !== candidate.sourceRevision) throw new Error('READBACK_MISMATCH');
  return id;
}

// A caller can retry an ambiguous result. It must use the same trusted in-memory
// candidate; JSON loaded from disk cannot acquire independent source proof.
export async function publishLocalSnapshot(storage, candidate) {
  assertTrustedSnapshotCandidate(candidate);
  if (candidate.sourceRevision === null) return result('ORDERING_UNKNOWN');
  let id;
  try { id = await stage(storage, candidate); }
  catch (error) { return result(error.message === 'READBACK_MISMATCH' ? 'READBACK_MISMATCH' : 'STORAGE_ERROR', null, error); }
  for (let attempt = 0; attempt < 20; attempt++) {
    let pointer;
    try { pointer = await storage.pointer(); }
    catch (error) { return result('STORAGE_ERROR', null, error); }
    if (pointer) {
      if (candidate.sourceRevision < pointer.revision) return result('STALE_REJECTED', pointer);
      if (pointer.schemaVersion !== candidate.schemaVersion ||
          pointer.policyRevision !== candidate.policyRevision) return result('MIGRATION_REQUIRED', pointer);
      if (candidate.sourceRevision === pointer.revision) {
        return same(candidate, pointer, id) ? result('ALREADY_PUBLISHED', pointer) : result('REVISION_CONFLICT', pointer);
      }
    }
    try {
      const swap = await storage.compareAndSwap(pointer?.generation ?? 0, nextOf(candidate, id));
      if (!swap.applied) continue;
      const finalPointer = await storage.pointer();
      if (same(candidate, finalPointer, id)) return result('PUBLISHED', finalPointer);
      // Another writer may have published a newer generation immediately.
      if (finalPointer?.revision > candidate.sourceRevision) return result('SUPERSEDED', finalPointer);
      return result('PUBLICATION_INDETERMINATE', finalPointer);
    } catch (error) {
      if (error.code === 'PUBLISH_BUSY') continue;
      // Includes timeout after pointer rename: do not claim failure or roll back.
      return result('PUBLICATION_INDETERMINATE', null, error);
    }
  }
  return result('PUBLISH_BUSY');
}

// Exact local transition: validated schema 3 / same restrictive policy to
// active schema 4. The current source and eligibility proof travels with the
// in-memory candidate; a historical object supplies identity, not freshness.
export async function migrateLocalSnapshot(storage, candidate) {
  assertTrustedSnapshotCandidate(candidate);
  if (candidate.sourceRevision === null) return result('ORDERING_UNKNOWN');
  let id;
  try { id = await stage(storage, candidate); }
  catch (error) { return result(error.message === 'READBACK_MISMATCH' ? 'READBACK_MISMATCH' : 'STORAGE_ERROR', null, error); }
  for (let attempt = 0; attempt < 20; attempt++) {
    let pointer;
    try { pointer = await storage.pointer(); }
    catch (error) { return result('STORAGE_ERROR', null, error); }
    if (!pointer) return result('MIGRATION_SOURCE_MISSING');
    if (candidate.sourceRevision < pointer.revision) return result('STALE_REJECTED', pointer);
    if (same(candidate, pointer, id)) return result('ALREADY_PUBLISHED', pointer);
    if (pointer.schemaVersion === candidate.schemaVersion &&
        pointer.policyRevision === candidate.policyRevision) {
      if (candidate.sourceRevision === pointer.revision &&
          candidate.datasetVersion === pointer.datasetVersion) {
        try {
          const published = await storage.get(pointer.id);
          if (published.contentHash === candidate.contentHash) return result('ALREADY_PUBLISHED', pointer);
        } catch (error) { return result('STORAGE_ERROR', pointer, error); }
      }
      return result('REVISION_CONFLICT', pointer);
    }
    let predecessor;
    try { predecessor = await storage.getMigrationSource(pointer.id); }
    catch (error) { return result('UNSUPPORTED_MIGRATION', pointer, error); }
    if (predecessor.sourceRevision !== pointer.revision ||
        predecessor.datasetVersion !== pointer.datasetVersion ||
        (pointer.schemaVersion !== undefined &&
          (pointer.schemaVersion !== predecessor.schemaVersion ||
            pointer.policyRevision !== predecessor.policyRevision))) {
      return result('UNSUPPORTED_MIGRATION', pointer);
    }
    if (candidate.sourceRevision === predecessor.sourceRevision &&
        candidate.contentHash !== predecessor.contentHash) {
      return result('MIGRATION_CONTENT_CONFLICT', pointer);
    }
    try {
      const swap = await storage.compareAndSwapMigration(pointer.generation,
        nextOf(candidate, id), candidate);
      if (!swap.applied) continue;
      const finalPointer = await storage.pointer();
      if (same(candidate, finalPointer, id)) return result('MIGRATED', finalPointer);
      if (finalPointer?.revision > candidate.sourceRevision) return result('SUPERSEDED', finalPointer);
      return result('PUBLICATION_INDETERMINATE', finalPointer);
    } catch (error) {
      if (error.code === 'PUBLISH_BUSY') continue;
      if (error.code === 'MIGRATION_CONTENT_CONFLICT') {
        return result('MIGRATION_CONTENT_CONFLICT', pointer, error);
      }
      if (error.code === 'INVALID_MIGRATION' || error.code === 'OBJECT_CORRUPT') {
        return result('MIGRATION_REJECTED', pointer, error);
      }
      return result('PUBLICATION_INDETERMINATE', null, error);
    }
  }
  return result('PUBLISH_BUSY');
}
