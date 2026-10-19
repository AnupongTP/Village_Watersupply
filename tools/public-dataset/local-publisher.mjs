import { assertTrustedSnapshotCandidate, validatePublicSnapshot } from './snapshot.mjs';

const same = (candidate, pointer, id) => pointer?.id === id &&
  pointer.revision === candidate.sourceRevision && pointer.datasetVersion === candidate.datasetVersion;
const result = (code, pointer = null, error = null) => ({ code, pointer, error: error?.code ?? null });

// A caller can retry an ambiguous result. It must use the same trusted in-memory
// candidate; JSON loaded from disk cannot acquire independent source proof.
export async function publishLocalSnapshot(storage, candidate) {
  assertTrustedSnapshotCandidate(candidate);
  if (candidate.sourceRevision === null) return result('ORDERING_UNKNOWN');
  let id;
  try {
    id = await storage.put(candidate);
    const readback = await storage.get(id);
    validatePublicSnapshot(readback);
    if (readback.metadataHash !== candidate.metadataHash ||
        readback.contentHash !== candidate.contentHash ||
        readback.sourceRevision !== candidate.sourceRevision) return result('READBACK_MISMATCH');
  } catch (error) { return result('STORAGE_ERROR', null, error); }
  for (let attempt = 0; attempt < 20; attempt++) {
    let pointer;
    try { pointer = await storage.pointer(); }
    catch (error) { return result('STORAGE_ERROR', null, error); }
    if (pointer) {
      if (candidate.sourceRevision < pointer.revision) return result('STALE_REJECTED', pointer);
      if (candidate.sourceRevision === pointer.revision) {
        return same(candidate, pointer, id) ? result('ALREADY_PUBLISHED', pointer) : result('REVISION_CONFLICT', pointer);
      }
    }
    try {
      const swap = await storage.compareAndSwap(pointer?.generation ?? 0, {
        id, revision: candidate.sourceRevision, datasetVersion: candidate.datasetVersion
      });
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
