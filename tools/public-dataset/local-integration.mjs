import { inspectSourceRead } from './source-read.mjs';
import { selectPhysicalPublicationEligible } from './eligibility.mjs';
import { createPublicSnapshot } from './snapshot.mjs';
export { consumeLocalDashboardResponse } from './dashboard-consumer.mjs';

// Local-only orchestration. The caller supplies independent source and
// publication evidence; no backend or Production endpoint is contacted here.
export function prepareLocalPublicCandidate(payload, selfManifest, {
  verifyRead, verifyEligibility, observationTime
} = {}) {
  const { report, verifiedRead } = inspectSourceRead(payload, selfManifest, verifyRead);
  if (!verifiedRead) return { report, candidate: null, verifiedRead: null };
  try {
    const eligible = selectPhysicalPublicationEligible(verifiedRead, verifyEligibility);
    const candidate = createPublicSnapshot(eligible, { observationTime });
    return { report, candidate, verifiedRead };
  } catch (_) {
    return {
      report: { ...report, reasons: [...report.reasons, 'PUBLICATION_OR_SNAPSHOT_REJECTED'] },
      candidate: null,
      verifiedRead
    };
  }
}
