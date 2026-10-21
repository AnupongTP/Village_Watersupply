// Local foundation for a future public API. No Production service imports this file.
const FIELDS = Object.freeze({
  villages: ['village_id', 'province', 'district', 'subdistrict', 'local_authority', 'village_no', 'village_name', 'has_village_waterworks', 'pwa_households', 'mwa_households', 'commercial_households', 'other_village_pipe_households', 'waterbank_households', 'self_source_households', 'natural_source_households'],
  // Candidate publication policy: agency, free-text ownership, shared-village
  // names, transfer details, and document URLs await disclosure approval.
  waterSystems: ['system_id', 'village_id', 'system_name', 'latitude', 'longitude', 'operational_status', 'drinking_water_quality', 'water_quantity', 'households_served', 'owner_type', 'system_type', 'water_source_type', 'capacity_m3_hr', 'usage_type', 'construction_year_be', 'utility_water_quality', 'shared_with_other_village', 'establishment_type', 'transfer_year_be', 'transfer_document_status'],
  waterSources: ['source_id', 'village_id', 'source_type', 'households']
});
Object.values(FIELDS).forEach(Object.freeze);
const ID_FIELDS = { villages: 'village_id', waterSystems: 'system_id', waterSources: 'source_id' };
const CONTROL_FIELDS = [
  'is_deleted', 'deleted_at', 'record_status', 'submission_status', 'publication_status',
  'isDeleted', 'deletedAt', 'recordStatus', 'submissionStatus', 'publicationStatus',
  'publicVisible', 'processingGuard'
];

const id = value => typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))
  ? String(value).trim() : '';
const blank = value => value === null || value === undefined || String(value).trim() === '';
const hasCoordinates = row => !blank(row.latitude) && !blank(row.longitude);
const hasWaterworks = row => row.has_village_waterworks === true || row.has_village_waterworks === 1 ||
  row.has_village_waterworks === '1' || String(row.has_village_waterworks ?? '').trim().toUpperCase() === 'YES' ||
  String(row.has_village_waterworks ?? '').trim() === 'มีประปาหมู่บ้าน';

function assertPlainRow(row, label) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.getPrototypeOf(row) !== Object.prototype) {
    throw new Error(`${label}: expected a plain record`);
  }
  for (const key of CONTROL_FIELDS) {
    if (Object.hasOwn(row, key)) throw new Error(`${label}: undecided record-control field ${key}`);
  }
}

export function validateSourceInput(payload, manifest) {
  if (!payload || typeof payload !== 'object' || payload.success === false) throw new Error('Source read failed');
  if (payload.projectionOwner || payload.projection?.owner) throw new Error('Already-projected payload cannot be projected again');
  if (!manifest || manifest.complete !== true || !manifest.counts || typeof manifest.counts !== 'object') {
    throw new Error('Complete source-read manifest required');
  }
  const ids = {};
  for (const key of Object.keys(FIELDS)) {
    const rows = payload[key];
    if (!Array.isArray(rows) || !Number.isSafeInteger(manifest.counts[key]) || manifest.counts[key] < 0 ||
        rows.length !== manifest.counts[key]) throw new Error(`${key}: missing, partial, or invalid source read`);
    ids[key] = new Set();
    rows.forEach((row, index) => {
      assertPlainRow(row, `${key}[${index}]`);
      const value = id(row[ID_FIELDS[key]]);
      if (!value) throw new Error(`${key}[${index}]: missing ${ID_FIELDS[key]}`);
      if (ids[key].has(value)) throw new Error(`${key}: duplicate ${ID_FIELDS[key]}`);
      ids[key].add(value);
      if (key !== 'villages' && !id(row.village_id)) throw new Error(`${key}[${index}]: missing village_id`);
      if (key === 'villages' && !Object.hasOwn(row, 'has_village_waterworks')) {
        throw new Error(`${key}[${index}]: missing has_village_waterworks`);
      }
    });
  }
  for (const key of ['waterSystems', 'waterSources']) {
    for (const row of payload[key]) {
      if (!ids.villages.has(id(row.village_id))) throw new Error(`${key}: orphan village_id`);
    }
  }
}

function pick(row, fields) {
  const output = {};
  for (const field of fields) if (Object.hasOwn(row, field)) {
    const value = row[field];
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`Invalid public field ${field}`);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Invalid public field ${field}`);
    output[field] = value;
  }
  return output;
}

function ordered(rows, key, fields) {
  return rows.map(row => pick(row, fields)).sort((a, b) => {
    const left = id(a[key]); const right = id(b[key]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function projectPublicDataset(payload, manifest) {
  validateSourceInput(payload, manifest);
  const linked = new Set(payload.waterSystems.map(row => id(row.village_id)));
  const hiddenVillages = new Set(payload.villages
    .filter(row => hasWaterworks(row) && !linked.has(id(row.village_id)))
    .map(row => id(row.village_id)));
  const villages = payload.villages.filter(row => !hiddenVillages.has(id(row.village_id)));
  const publicIds = new Set(villages.map(row => id(row.village_id)));
  const systems = payload.waterSystems.filter(row => hasCoordinates(row) && publicIds.has(id(row.village_id)));
  const sources = payload.waterSources.filter(row => publicIds.has(id(row.village_id)));
  const hiddenCoordinateSystems = payload.waterSystems.length - payload.waterSystems.filter(hasCoordinates).length;
  return {
    villages: ordered(villages, 'village_id', FIELDS.villages),
    waterSystems: ordered(systems, 'system_id', FIELDS.waterSystems),
    waterSources: ordered(sources, 'source_id', FIELDS.waterSources),
    projectionOwner: 'SERVER_R5_1',
    suppression: {
      rule: 'R5_1_TEMP_HIDE_244',
      hiddenMissingCoordinateSystems: hiddenCoordinateSystems,
      hiddenWaterworksVillagesWithoutSystem: hiddenVillages.size,
      hiddenIssueRows: hiddenCoordinateSystems + hiddenVillages.size,
      inputVillages: payload.villages.length,
      inputWaterSystems: payload.waterSystems.length,
      outputVillages: villages.length,
      outputWaterSystems: systems.length
    }
  };
}

export const PUBLIC_FIELDS = FIELDS;
export const PUBLIC_PROJECTION_POLICY_REVISION = 'REVIEW_DEFAULT_DENY_2026_10_21_V1';
