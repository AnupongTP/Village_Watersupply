import { validateSourceInput } from './projection.mjs';

const KEYS = ['villages', 'waterSystems', 'waterSources'];
const IDS = { villages: 'village_id', waterSystems: 'system_id', waterSources: 'source_id' };
const TABLES = { villages: 'villages', waterSystems: 'water_systems', waterSources: 'village_water_sources' };
const REQUIRED_HEADERS = {
  villages: ['village_id', 'has_village_waterworks'],
  waterSystems: ['system_id', 'village_id', 'latitude', 'longitude'],
  waterSources: ['source_id', 'village_id']
};
const verifiedReads = new WeakSet();
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function sameIds(rows, expected, field) {
  if (!Array.isArray(expected) || expected.length !== rows.length) return false;
  const actual = rows.map(row => String(row[field]).trim()).sort();
  const independent = expected.map(value => String(value).trim()).sort();
  return actual.every((value, index) => value && value === independent[index]);
}

// The verifier is an external trust boundary. This function checks its evidence;
// it cannot prove that a future Google Sheets adapter is genuinely independent.
export function inspectSourceRead(payload, selfManifest, independentVerifier = null) {
  const report = {
    structure: 'INVALID', consistency: 'INVALID', completeness: 'UNVERIFIABLE',
    ordering: 'UNKNOWN', reasons: []
  };
  if (!payload || typeof payload !== 'object' || payload.success !== true ||
      KEYS.some(key => !Array.isArray(payload[key]))) {
    report.reasons.push('INVALID_DATASET_STRUCTURE');
    return { report, verifiedRead: null };
  }
  report.structure = 'VALID';
  try {
    validateSourceInput(payload, selfManifest);
  } catch (_) {
    // Validation errors can contain implementation details. The public diagnostic
    // deliberately exposes only a bounded category, never raw source records.
    report.reasons.push('INCONSISTENT_SOURCE_RECORDS_OR_MANIFEST');
    return { report, verifiedRead: null };
  }
  report.consistency = 'VALID';
  if (typeof independentVerifier !== 'function') {
    report.reasons.push('INDEPENDENT_EVIDENCE_MISSING');
    return { report, verifiedRead: null };
  }
  let evidence;
  try { evidence = independentVerifier(); } catch (_) {
    report.reasons.push('INDEPENDENT_EVIDENCE_UNAVAILABLE');
    return { report, verifiedRead: null };
  }
  if (!evidence || evidence.complete !== true || evidence.consistentRead !== true ||
      typeof evidence.authority !== 'string' || !evidence.authority.trim() ||
      KEYS.some(key => evidence.tables?.[key] !== TABLES[key] ||
        !Array.isArray(evidence.headers?.[key]) ||
        REQUIRED_HEADERS[key].some(header => !evidence.headers[key].includes(header))) ||
      !evidence.tableIds || KEYS.some(key => !sameIds(payload[key], evidence.tableIds[key], IDS[key]))) {
    report.completeness = 'INCOMPLETE';
    report.reasons.push('INDEPENDENT_EVIDENCE_MISMATCH');
    return { report, verifiedRead: null };
  }
  const revision = evidence.revision;
  const hasTrustedRevision = revision && Number.isSafeInteger(revision.value) && revision.value >= 0 &&
    revision.monotonic === true && typeof revision.authority === 'string' && revision.authority.trim();
  report.completeness = 'VERIFIED';
  report.ordering = hasTrustedRevision ? 'VERIFIED' : 'UNKNOWN';
  if (!hasTrustedRevision) report.reasons.push('TRUSTED_REVISION_MISSING');
  let verifiedRead;
  try {
    verifiedRead = {
      payload: structuredClone(payload),
      manifest: structuredClone(selfManifest),
      sourceRevision: hasTrustedRevision ? revision.value : null,
      generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : null,
      evidenceAuthority: evidence.authority
    };
  } catch (_) {
    report.consistency = 'INVALID';
    report.completeness = 'UNVERIFIABLE';
    report.reasons.push('UNCLONEABLE_SOURCE_RECORD');
    return { report, verifiedRead: null };
  }
  deepFreeze(verifiedRead);
  verifiedReads.add(verifiedRead);
  return { report, verifiedRead };
}

export function assertVerifiedRead(read) {
  if (!read || !verifiedReads.has(read)) throw new Error('Independently verified source read required');
  return read;
}
