import { assertTrustedSnapshotCandidate } from './snapshot.mjs';

const safe = (code, state, extra = {}) => ({ code, state, ...extra });

export function createLocalPublicGet(storage) {
  async function inspect(freshCandidate = null) {
    let pointer;
    try { pointer = await storage.pointer(); }
    catch (error) { return safe(error.code ?? 'STORAGE_UNAVAILABLE', 'UNAVAILABLE'); }
    if (!pointer) return safe('NO_PUBLICATION', 'UNAVAILABLE');
    let stored;
    try { stored = await storage.get(pointer.id); }
    catch (error) {
      if (error.code === 'OBJECT_CORRUPT') {
        try {
          const predecessor = await storage.getMigrationSource(pointer.id);
          if (predecessor.sourceRevision === pointer.revision &&
              predecessor.datasetVersion === pointer.datasetVersion &&
              (pointer.schemaVersion === undefined ||
                (pointer.schemaVersion === predecessor.schemaVersion &&
                  pointer.policyRevision === predecessor.policyRevision))) {
            return safe('POLICY_MIGRATION_REQUIRED', 'UNAVAILABLE');
          }
        } catch (_) { /* Unknown or damaged history stays unavailable. */ }
      }
      return safe(error.code ?? 'STORAGE_UNAVAILABLE', 'UNAVAILABLE');
    }
    if (stored.sourceRevision !== pointer.revision || stored.datasetVersion !== pointer.datasetVersion ||
        pointer.schemaVersion !== stored.schemaVersion ||
        pointer.policyRevision !== stored.policyRevision) {
      return safe('POINTER_CONTENT_MISMATCH', 'UNAVAILABLE');
    }
    const metadata = { sourceRevision: pointer.revision, datasetVersion: pointer.datasetVersion,
      generation: pointer.generation, schemaVersion: stored.schemaVersion,
      policyRevision: stored.policyRevision };
    if (!freshCandidate) return safe('FRESHNESS_UNKNOWN', 'UNKNOWN', { metadata });
    try { assertTrustedSnapshotCandidate(freshCandidate); }
    catch (_) { return safe('FRESHNESS_UNKNOWN', 'UNKNOWN', { metadata }); }
    if (freshCandidate.sourceRevision === null) return safe('FRESHNESS_UNKNOWN', 'UNKNOWN', { metadata });
    if (freshCandidate.sourceRevision > pointer.revision) return safe('SOURCE_NEWER', 'STALE', { metadata });
    if (freshCandidate.sourceRevision < pointer.revision ||
        freshCandidate.datasetVersion !== stored.datasetVersion ||
        freshCandidate.contentHash !== stored.contentHash) {
      // Same-revision content or policy differences cannot confirm freshness.
      return safe('FRESHNESS_UNKNOWN', 'UNKNOWN', { metadata });
    }
    return safe('CURRENT', 'CURRENT', { metadata, stored });
  }
  return Object.freeze({
    async getVersion(freshCandidate = null) {
      const { stored, ...status } = await inspect(freshCandidate);
      return status;
    },
    async getData(freshCandidate = null) {
      const status = await inspect(freshCandidate);
      if (status.state !== 'CURRENT') return safe(status.code, status.state);
      const { stored, metadata } = status;
      return {
        code: 'CURRENT', state: 'CURRENT', metadata,
        body: { success: true, generatedAt: stored.generatedAt,
          projectionOwner: stored.projectionOwner,
          villages: structuredClone(stored.villages),
          waterSystems: structuredClone(stored.waterSystems),
          waterSources: structuredClone(stored.waterSources) }
      };
    }
  });
}
