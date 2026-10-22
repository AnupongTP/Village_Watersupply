// Pure (storage-free) model for the Public Dashboard browser cache.
//
// The cache holds the ALREADY R5.1-projected public dataset. R5.1 is applied
// exactly once, on the live payload in app.js, before this module is used.
// Cached data is never projected again: re-running rule (2) over an already
// coordinate-suppressed system set would hide additional villages.
//
// Only the allowlisted public columns below are persisted. Everything else
// (agency names, free-text ownership, shared-village names, document URLs,
// record-control fields, unknown keys) is dropped before storage, and raw API
// responses are never stored.

export const CACHE_SCHEMA = 1;
export const CACHE_POLICY = 'PUBLIC_ALLOWLIST_R5_1_V1';

export const CACHE_FIELDS = Object.freeze({
  villages: Object.freeze(['village_id', 'province', 'district', 'subdistrict', 'local_authority', 'village_no', 'village_name', 'has_village_waterworks', 'pwa_households', 'mwa_households', 'commercial_households', 'other_village_pipe_households', 'waterbank_households', 'self_source_households', 'natural_source_households']),
  waterSystems: Object.freeze(['system_id', 'village_id', 'system_name', 'latitude', 'longitude', 'operational_status', 'drinking_water_quality', 'water_quantity', 'households_served', 'owner_type', 'system_type', 'water_source_type', 'capacity_m3_hr', 'usage_type', 'construction_year_be', 'utility_water_quality', 'shared_with_other_village', 'establishment_type', 'transfer_year_be', 'transfer_document_status']),
  waterSources: Object.freeze(['source_id', 'village_id', 'source_type', 'households'])
});
const ID_FIELD = { villages: 'village_id', waterSystems: 'system_id', waterSources: 'source_id' };
const KEYS = Object.keys(CACHE_FIELDS);

const isPrimitive = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const idOf = value => (typeof value === 'string' || typeof value === 'number') ? String(value).trim() : '';
const blank = value => value === null || value === undefined || String(value).trim() === '';

// Copies only allowlisted, primitive-valued columns of one row.
function pickRow(row, fields) {
  const out = {};
  for (const field of fields) {
    if (!Object.hasOwn(row, field)) continue;
    const value = row[field];
    if (value === undefined) continue;
    if (!isPrimitive(value) || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`ค่าฟิลด์ ${field} ไม่ใช่ข้อมูลสาธารณะที่จัดเก็บได้`);
    }
    out[field] = value;
  }
  return out;
}

// Builds the strict-allowlist copy of an already projected public scope.
export function allowlistPublicDataset(scope) {
  const data = {};
  for (const key of KEYS) {
    if (!Array.isArray(scope?.[key])) throw new Error(`ชุดข้อมูล ${key} ไม่ถูกต้อง`);
    data[key] = scope[key].map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`แถวข้อมูล ${key} ไม่ถูกต้อง`);
      return pickRow(row, CACHE_FIELDS[key]);
    });
  }
  return data;
}

// Non-cryptographic integrity fingerprint (cyrb53) over canonical JSON. It
// detects truncation/corruption; it is not a security or revision proof.
export function fingerprint(value) {
  const text = JSON.stringify(value);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// Short non-secret tag so data cached for one source (mock vs. a given API
// endpoint) is never shown for another. The endpoint itself is not stored.
export function sourceTag(config = {}) {
  if (config.USE_MOCK_DATA) return 'mock';
  return `api-${fingerprint(String(config.API_URL || ''))}`;
}

export function buildCacheRecord({ scope, sourceGeneratedAt = '', sourceKey, savedAt = new Date().toISOString() }) {
  const data = allowlistPublicDataset(scope);
  const suppression = scope.suppression ? {
    rule: String(scope.suppression.rule || ''),
    hiddenMissingCoordinateSystems: Number(scope.suppression.hiddenMissingCoordinateSystems) || 0,
    hiddenWaterworksVillagesWithoutSystem: Number(scope.suppression.hiddenWaterworksVillagesWithoutSystem) || 0,
    hiddenIssueRows: Number(scope.suppression.hiddenIssueRows) || 0,
    inputVillages: Number(scope.suppression.inputVillages) || 0,
    inputWaterSystems: Number(scope.suppression.inputWaterSystems) || 0,
    outputVillages: Number(scope.suppression.outputVillages) || 0,
    outputWaterSystems: Number(scope.suppression.outputWaterSystems) || 0
  } : null;
  const record = {
    schema: CACHE_SCHEMA,
    policy: CACHE_POLICY,
    sourceKey: String(sourceKey || ''),
    savedAt,
    sourceGeneratedAt: String(sourceGeneratedAt || ''),
    counts: Object.fromEntries(KEYS.map(key => [key, data[key].length])),
    suppression,
    data
  };
  record.integrity = fingerprint({ counts: record.counts, suppression, data });
  return record;
}

// Returns { ok: true, record } or { ok: false, reason }. Never throws.
export function validateCacheRecord(record, { sourceKey, now = Date.now() } = {}) {
  const fail = reason => ({ ok: false, reason });
  try {
    if (!record || typeof record !== 'object') return fail('MALFORMED');
    if (record.schema !== CACHE_SCHEMA) return fail('SCHEMA_MISMATCH');
    if (record.policy !== CACHE_POLICY) return fail('POLICY_MISMATCH');
    if (sourceKey !== undefined && record.sourceKey !== sourceKey) return fail('SOURCE_MISMATCH');
    // Policy: do not discard an otherwise valid cached public dataset solely
    // because it is old, and never treat a young timestamp as CURRENT. Cached
    // records are always presented as STALE/UNVERIFIED until replaced by a
    // validated live fetch. Only malformed or impossible future timestamps fail.
    const savedMs = Date.parse(record.savedAt);
    if (!Number.isFinite(savedMs) || savedMs > now + 5 * 60 * 1000) return fail('INVALID_TIMESTAMP');
    const data = record.data;
    if (!data || typeof data !== 'object') return fail('MALFORMED');
    const ids = {};
    for (const key of KEYS) {
      const rows = data[key];
      if (!Array.isArray(rows) || record.counts?.[key] !== rows.length) return fail('COUNT_MISMATCH');
      ids[key] = new Set();
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return fail('MALFORMED_ROW');
        for (const field of Object.keys(row)) {
          if (!CACHE_FIELDS[key].includes(field)) return fail('NON_ALLOWLISTED_FIELD');
          if (!isPrimitive(row[field])) return fail('NON_PRIMITIVE_VALUE');
        }
        const id = idOf(row[ID_FIELD[key]]);
        if (!id || ids[key].has(id)) return fail('INVALID_OR_DUPLICATE_ID');
        ids[key].add(id);
      }
    }
    // Relational and R5.1 output invariants (checks only; nothing is re-projected).
    for (const system of data.waterSystems) {
      if (!ids.villages.has(idOf(system.village_id))) return fail('ORPHAN_SYSTEM');
      if (blank(system.latitude) || blank(system.longitude)) return fail('R5_1_VIOLATION');
    }
    for (const source of data.waterSources) {
      if (!ids.villages.has(idOf(source.village_id))) return fail('ORPHAN_SOURCE');
    }
    if (record.integrity !== fingerprint({ counts: record.counts, suppression: record.suppression, data })) {
      return fail('INTEGRITY_MISMATCH');
    }
    return { ok: true, record };
  } catch (_) {
    return fail('VALIDATION_ERROR');
  }
}
