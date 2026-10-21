import { assertVerifiedRead } from './source-read.mjs';

const eligibleSets = new WeakSet();
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Physical deletion is represented by absence from the independently verified
// source set. Presence alone does not prove a Feature 3 row is publishable, so
// an independent decision must cover every present system exactly once.
export function selectPhysicalPublicationEligible(read, decisionProvider) {
  assertVerifiedRead(read);
  if (typeof decisionProvider !== 'function') throw new Error('Publication decision evidence required');
  let evidence;
  try { evidence = decisionProvider(); } catch (_) { throw new Error('Publication decision evidence unavailable'); }
  if (!evidence || evidence.complete !== true || typeof evidence.authority !== 'string' ||
      !evidence.authority.trim() || !Array.isArray(evidence.decisions)) {
    throw new Error('Incomplete publication decision evidence');
  }
  const sourceIds = new Set(read.payload.waterSystems.map(row => String(row.system_id).trim()));
  const decisions = new Map();
  for (const item of evidence.decisions) {
    const id = String(item?.systemId ?? '').trim();
    if (!sourceIds.has(id) || decisions.has(id) || !['ELIGIBLE', 'INELIGIBLE'].includes(item?.status)) {
      throw new Error('Invalid or contradictory publication decision');
    }
    decisions.set(id, item.status);
  }
  if (decisions.size !== sourceIds.size) throw new Error('Unverified publication status');
  const payload = {
    success: true,
    villages: structuredClone(read.payload.villages),
    waterSystems: structuredClone(read.payload.waterSystems.filter(row => decisions.get(String(row.system_id).trim()) === 'ELIGIBLE')),
    waterSources: structuredClone(read.payload.waterSources)
  };
  const manifest = { complete: true, counts: {
    villages: payload.villages.length,
    waterSystems: payload.waterSystems.length,
    waterSources: payload.waterSources.length
  } };
  const result = deepFreeze({
    payload, manifest,
    sourceCounts: Object.freeze({ ...read.manifest.counts }),
    sourceRevision: read.sourceRevision,
    generatedAt: read.generatedAt,
    excludedSystems: sourceIds.size - payload.waterSystems.length,
    verificationAuthority: read.evidenceAuthority,
    eligibilityAuthority: evidence.authority
  });
  eligibleSets.add(result);
  return result;
}

export function assertEligibleSet(value) {
  if (!value || !eligibleSets.has(value)) throw new Error('Verified publication eligibility required');
  return value;
}
