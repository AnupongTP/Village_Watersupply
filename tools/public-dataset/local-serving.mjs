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
    catch (error) { return safe(error.code ?? 'STORAGE_UNAVAILABLE', 'UNAVAILABLE'); }
    if (stored.sourceRevision !== pointer.revision || stored.datasetVersion !== pointer.datasetVersion) {
      return safe('POINTER_CONTENT_MISMATCH', 'UNAVAILABLE');
    }
    const metadata = { sourceRevision: pointer.revision, datasetVersion: pointer.datasetVersion,
      generation: pointer.generation, schemaVersion: stored.schemaVersion };
    if (!freshCandidate) return safe('FRESHNESS_UNKNOWN', 'UNKNOWN', { metadata });
    try { assertTrustedSnapshotCandidate(freshCandidate); }
    catch (_) { return safe('FRESHNESS_UNKNOWN', 'UNKNOWN', { metadata }); }
    if (freshCandidate.sourceRevision === null) return safe('FRESHNESS_UNKNOWN', 'UNKNOWN', { metadata });
    if (freshCandidate.sourceRevision > pointer.revision) return safe('SOURCE_NEWER', 'STALE', { metadata });
    if (freshCandidate.sourceRevision < pointer.revision ||
        freshCandidate.contentHash !== stored.contentHash ||
        freshCandidate.metadataHash !== stored.metadataHash) {
      // Same source revision with altered eligibility/content is a conflict.
      // Metadata can differ solely by observation time, so compare content.
      if (freshCandidate.sourceRevision === pointer.revision &&
          freshCandidate.contentHash === stored.contentHash) {
        return safe('CURRENT', 'CURRENT', { metadata, stored });
      }
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
