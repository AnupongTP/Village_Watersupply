// Single-file packaging of the original LOCAL Candidate runtime-worker.
// No external or relative module imports: compatible with --use-api source upload.
// Logic is from the original code; only ESM packaging was transformed.


// source: supabase/functions/_shared/backend/canonical.mjs
const __canonical = (() => {

function mgmtNormalizeText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}
function mgmtNormalizeUpper_(value) {
  return mgmtNormalizeText_(value).toUpperCase();
}
function mgmtError_(code, safeMessage, details) {
  const error = new Error(code || 'SERVER_ERROR');
  error.mgmtCode = code || 'SERVER_ERROR';
  error.mgmtSafeMessage = safeMessage || 'เกิดข้อผิดพลาดในระบบ';
  if (details !== undefined) error.mgmtDetails = details;
  return error;
}
function mgmtStableClone_(value) {
  if (value === null || value === undefined) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(mgmtStableClone_);
  }
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).sort().forEach(function(key) {
      result[key] = mgmtStableClone_(value[key]);
    });
    return result;
  }
  if (typeof value === 'number' && !isFinite(value)) {
    throw mgmtError_('VALIDATION_FAILED', 'พบค่าตัวเลขที่ไม่ถูกต้อง');
  }
  return value;
}
function mgmtCanonicalJson_(value) {
  return JSON.stringify(mgmtStableClone_(value));
}
const MGMT_DATA = Object.freeze({
  VERSION: 2,

  SHEETS: Object.freeze({
    RAW: 'mainplumbing',
    VILLAGES: 'villages',
    SYSTEMS: 'water_systems',
    SOURCES: 'village_water_sources'
  }),

  ENTITY_TYPES: Object.freeze({
    WATER_SYSTEM: 'WATER_SYSTEM'
  }),


  PUBLIC_RULE: Object.freeze({
    ID: 'R5_1_TEMP_HIDE_244',
    SYSTEM_MISSING_COORDINATE: 'MISSING_COORDINATE',
    SYSTEM_VILLAGE_SUPPRESSED: 'VILLAGE_SUPPRESSED_NO_LINKED_ACTIVE_SYSTEM',
    VILLAGE_NO_LINKED_SYSTEM: 'WATERWORKS_WITHOUT_LINKED_ACTIVE_SYSTEM',
    SOURCE_VILLAGE_SUPPRESSED: 'VILLAGE_SUPPRESSED'
  }),

  HEADERS: Object.freeze({
    VILLAGES: Object.freeze([
      'village_id',
      'source_excel_row',
      'source_order',
      'province',
      'district',
      'subdistrict',
      'local_authority',
      'village_no',
      'village_name',
      'has_village_waterworks',
      'water_from_raw',
      'pwa_households',
      'mwa_households',
      'commercial_households',
      'other_village_pipe_households',
      'waterbank_households',
      'self_source_households',
      'natural_source_households',
      'created_at',
      'updated_at',
      'community_type',
      'dla_village_code'
    ]),

    SYSTEMS: Object.freeze([
      'system_id',
      'village_id',
      'source_excel_row',
      'system_no',
      'system_name',
      'latitude',
      'longitude',
      'owner_type',
      'responsible_agency',
      'system_type',
      'water_source_type',
      'capacity_m3_hr',
      'usage_type',
      'households_served',
      'construction_year_be',
      'construction_year_ce',
      'operational_status',
      'utility_water_quality',
      'drinking_water_quality',
      'water_quantity',
      'shared_with_other_village',
      'shared_village_name',
      'establishment_type',
      'establishment_agency',
      'transfer_year_be',
      'transfer_agency',
      'transfer_other',
      'transfer_document_status',
      'transfer_document_url',
      'created_at',
      'updated_at',
      'usage_types_json',
      'quality_failure_categories_json',
      'quality_failure_detail',
      'water_pressure',
      'year_round_status',
      'available_months_json',
      'beneficiaries',
      'monthly_production_cost',
      'monthly_service_revenue',
      'water_tariff',
      'service_agency',
      'water_source_detail',
      'surface_water_type',
      'surface_water_agency',
      'shared_villages_json'
    ]),

    SOURCES: Object.freeze([
      'source_id',
      'village_id',
      'source_excel_row',
      'source_type',
      'households'
    ])
  }),

  ENUM_CATALOG: Object.freeze({
    owner_type: Object.freeze(['LOCAL_AUTHORITY', 'VILLAGE_OR_OTHER', 'UNKNOWN']),
    system_type: Object.freeze([
      'GROUNDWATER_SMALL',
      'GROUNDWATER_MEDIUM',
      'GROUNDWATER_LARGE',
      'SURFACE_SMALL',
      'SURFACE_MEDIUM',
      'SURFACE_LARGE',
      'SURFACE_VERY_LARGE',
      'UNKNOWN'
    ]),
    water_source_type: Object.freeze(['GROUNDWATER', 'SURFACE_WATER', 'MIXED', 'UNKNOWN']),
    usage_type: Object.freeze(['DOMESTIC', 'AGRICULTURE', 'UNKNOWN']),
    operational_status: Object.freeze(['WORKING', 'NOT_WORKING', 'UNKNOWN']),
    utility_water_quality: Object.freeze(['USABLE', 'NOT_USABLE', 'UNKNOWN']),
    drinking_water_quality: Object.freeze(['PASS', 'FAIL', 'NO_DATA']),
    water_quantity: Object.freeze(['SUFFICIENT', 'INSUFFICIENT', 'NO_DATA']),
    shared_with_other_village: Object.freeze(['YES', 'NO', 'UNKNOWN']),
    establishment_type: Object.freeze([
      'LOCAL_CREATED',
      'ACCEPTED_ASSET',
      'TRANSFERRED',
      'NOT_LOCAL_AUTHORITY_ASSET',
      'UNKNOWN'
    ]),
    transfer_document_status: Object.freeze(['AVAILABLE', 'NOT_AVAILABLE', 'NO_DATA']),
    year_round_status: Object.freeze(['YEAR_ROUND', 'SEASONAL']),
    water_pressure: Object.freeze([
      'FLOW_CONTINUOUS',
      'FLOW_STRONG_SOMETIMES',
      'FLOW_WEAK_CONTINUOUS',
      'UNKNOWN'
    ])
  }),

  FEATURE_FLAGS: Object.freeze({
    directGithubToAppsScript: true,
    managementRead: true,
    updateWaterSystem: true,
    deleteWaterSystem: true,
    technicianUserManagement: true,
    entityHistory: true,
    managementCreateWaterSystem: false,
    rollbackWaterSystem: false,
    hardDeleteWaterSystem: true,
    temporaryPublicHide244ServerSide: false
  })
});


/**
 * Village Water Supply — Management Update v2
 * Update water_systems + optimistic concurrency + transactional audit.
 *
 * Correctness goals:
 * - SAME Apps Script project / SAME ScriptLock as Feature 3 Processor.
 * - Update by system_id, never by client-provided row number.
 * - Patch-driven mutation: unrelated legacy columns are preserved exactly.
 * - Conditional validation runs only for field groups affected by the patch.
 * - Full before/after canonical snapshots are written to append-only audit_log.
 * - PREPARED -> COMMITTED/FAILED transition is one contiguous Q:S setValues write.
 * - Deterministic PREPARED recovery happens before a new mutation of the entity.
 * - No SUCCESS until row read-back + COMMITTED audit are both verified.
 */

const MGMT_MUTATION = Object.freeze({
  VERSION: 8,
  ENTITY_TYPE: 'WATER_SYSTEM',
  ACTION_UPDATE: 'SYSTEM_UPDATE',

  AUDIT: Object.freeze({
    PREPARED: 'PREPARED',
    COMMITTED: 'COMMITTED',
    FAILED: 'FAILED',
    AUDIT_PREFIX: 'AUD-',
    TRANSACTION_PREFIX: 'TXN-'
  }),

  EDITABLE_FIELDS: Object.freeze([
    'system_name',
    'latitude',
    'longitude',
    'owner_type',
    'responsible_agency',
    'system_type',
    'water_source_type',
    'capacity_m3_hr',
    'usage_type',
    'households_served',
    'construction_year_be',
    'operational_status',
    'utility_water_quality',
    'drinking_water_quality',
    'water_quantity',
    'shared_with_other_village',
    'shared_village_name',
    'establishment_type',
    'establishment_agency',
    'transfer_year_be',
    'transfer_agency',
    'transfer_other',
    'transfer_document_status',
    'transfer_document_url',
    'usage_types_json',
    'quality_failure_categories_json',
    'quality_failure_detail',
    'water_pressure',
    'year_round_status',
    'available_months_json',
    'beneficiaries',
    'monthly_production_cost',
    'monthly_service_revenue',
    'water_tariff',
    'service_agency',
    'water_source_detail',
    'surface_water_type',
    'surface_water_agency',
    'shared_villages_json'
  ]),

  IMMUTABLE_FIELDS: Object.freeze([
    'system_id',
    'village_id',
    'source_excel_row',
    'system_no',
    'construction_year_ce',
    'created_at',
    'updated_at'
  ]),

  ENUMS: Object.freeze({
    owner_type: Object.freeze(['LOCAL_AUTHORITY', 'VILLAGE_OR_OTHER', 'UNKNOWN']),
    system_type: Object.freeze([
      'GROUNDWATER_SMALL', 'GROUNDWATER_MEDIUM', 'GROUNDWATER_LARGE',
      'SURFACE_SMALL', 'SURFACE_MEDIUM', 'SURFACE_LARGE',
      'SURFACE_VERY_LARGE', 'UNKNOWN'
    ]),
    water_source_type: Object.freeze(['GROUNDWATER', 'SURFACE_WATER', 'MIXED', 'UNKNOWN']),
    usage_type: Object.freeze(['DOMESTIC', 'AGRICULTURE', 'UNKNOWN']),
    operational_status: Object.freeze(['WORKING', 'NOT_WORKING', 'UNKNOWN']),
    utility_water_quality: Object.freeze(['USABLE', 'NOT_USABLE', 'UNKNOWN']),
    drinking_water_quality: Object.freeze(['PASS', 'FAIL', 'NO_DATA']),
    water_quantity: Object.freeze(['SUFFICIENT', 'INSUFFICIENT', 'NO_DATA']),
    shared_with_other_village: Object.freeze(['YES', 'NO', 'UNKNOWN']),
    establishment_type: Object.freeze([
      'LOCAL_CREATED', 'ACCEPTED_ASSET', 'TRANSFERRED',
      'NOT_LOCAL_AUTHORITY_ASSET', 'UNKNOWN'
    ]),
    transfer_document_status: Object.freeze(['AVAILABLE', 'NOT_AVAILABLE', 'NO_DATA']),
    water_pressure: Object.freeze([
      'FLOW_CONTINUOUS', 'FLOW_STRONG_SOMETIMES',
      'FLOW_WEAK_CONTINUOUS', 'UNKNOWN'
    ]),
    year_round_status: Object.freeze(['YEAR_ROUND', 'SEASONAL'])
  }),

  ARRAY_CODES: Object.freeze({
    usage_types_json: Object.freeze(['DOMESTIC', 'AGRICULTURE']),
    quality_failure_categories_json: Object.freeze([
      'PHYSICAL',
      'GENERAL_CHEMICAL',
      'GENERAL_HEAVY_METALS',
      'TOXIC_HEAVY_METALS',
      'BACTERIA'
    ]),
    available_months_json: Object.freeze([
      'JAN','FEB','MAR','APR','MAY','JUN',
      'JUL','AUG','SEP','OCT','NOV','DEC'
    ])
  }),

  TEXT_FIELDS: Object.freeze([
    'system_name',
    'responsible_agency',
    'shared_village_name',
    'establishment_agency',
    'transfer_agency',
    'transfer_other',
    'quality_failure_detail',
    'service_agency',
    'water_source_detail',
    'surface_water_type',
    'surface_water_agency'
  ]),

  NUMBER_FIELDS: Object.freeze([
    'latitude',
    'longitude',
    'capacity_m3_hr',
    'monthly_production_cost',
    'monthly_service_revenue',
    'water_tariff'
  ]),

  INTEGER_FIELDS: Object.freeze([
    'households_served',
    'construction_year_be',
    'transfer_year_be',
    'beneficiaries'
  ])
});

// ============================================================================
// Pure validation / canonicalization helpers
// ============================================================================

function mgmtMutationHasOwn_(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function mgmtMutationTouchesAny_(patch, fields) {
  for (let i = 0; i < fields.length; i += 1) {
    if (mgmtMutationHasOwn_(patch, fields[i])) return true;
  }
  return false;
}

function mgmtMutationIsBlank_(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function mgmtMutationNormalizePatchObject_(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw mgmtError_('VALIDATION_FAILED', 'patch ต้องเป็น Object');
  }

  const editable = {};
  MGMT_MUTATION.EDITABLE_FIELDS.forEach(function(field) {
    editable[field] = true;
  });

  const immutable = {};
  MGMT_MUTATION.IMMUTABLE_FIELDS.forEach(function(field) {
    immutable[field] = true;
  });

  const keys = Object.keys(patch);
  if (keys.length === 0) {
    throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุข้อมูลที่ต้องการแก้ไข');
  }

  keys.forEach(function(key) {
    if (immutable[key]) {
      throw mgmtError_('VALIDATION_FAILED', 'field นี้แก้ไขไม่ได้ใน Management v1', {
        field: key,
        issue: 'IMMUTABLE_FIELD'
      });
    }
    if (!editable[key]) {
      throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ Management v1 ไม่รองรับ', {
        field: key,
        issue: 'UNSUPPORTED_FIELD'
      });
    }
  });

  return patch;
}

function mgmtMutationText_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบข้อความไม่ถูกต้อง');
  }
  return String(value).trim();
}

function mgmtMutationOptionalNumber_(value, field, options) {
  const opts = options || {};
  if (mgmtMutationIsBlank_(value)) return '';

  if (typeof value !== 'number' && typeof value !== 'string') {
    throw mgmtError_('VALIDATION_FAILED', 'กรุณากรอกเป็นตัวเลข', { field: field });
  }

  let text = typeof value === 'number'
    ? String(value)
    : String(value).trim();

  // If a client sends thousands separators, accept only valid 3-digit grouping.
  // This deliberately rejects ambiguous strings such as "1,2" instead of
  // silently turning them into 12. Browser clients should normally send numbers.
  if (text.indexOf(',') >= 0) {
    if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) {
      throw mgmtError_('VALIDATION_FAILED', 'รูปแบบตัวเลขที่มีเครื่องหมายคั่นหลักไม่ถูกต้อง', { field: field });
    }
    text = text.replace(/,/g, '');
  }

  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) {
    throw mgmtError_('VALIDATION_FAILED', 'กรุณากรอกเป็นตัวเลข', { field: field });
  }

  const number = Number(text);
  if (!isFinite(number)) {
    throw mgmtError_('VALIDATION_FAILED', 'ค่าตัวเลขไม่ถูกต้อง', { field: field });
  }
  if (opts.integer === true && !Number.isInteger(number)) {
    throw mgmtError_('VALIDATION_FAILED', 'กรุณากรอกเป็นจำนวนเต็ม', { field: field });
  }
  if (opts.nonNegative === true && number < 0) {
    throw mgmtError_('VALIDATION_FAILED', 'ค่าต้องไม่น้อยกว่า 0', { field: field });
  }
  if (typeof opts.min === 'number' && number < opts.min) {
    throw mgmtError_('VALIDATION_FAILED', 'ค่าต่ำกว่าช่วงที่รองรับ', { field: field });
  }
  if (typeof opts.max === 'number' && number > opts.max) {
    throw mgmtError_('VALIDATION_FAILED', 'ค่าสูงกว่าช่วงที่รองรับ', { field: field });
  }

  return number;
}

function mgmtMutationCanonicalEnum_(value, field, allowBlank) {
  const text = mgmtNormalizeUpper_(value);
  if (!text) {
    if (allowBlank === true) return '';
    throw mgmtError_('VALIDATION_FAILED', 'field รหัสนี้ห้ามเป็นค่าว่าง', {
      field: field,
      issue: 'ENUM_BLANK_NOT_ALLOWED'
    });
  }

  const allowed = MGMT_MUTATION.ENUMS[field] || [];
  if (allowed.indexOf(text) < 0) {
    throw mgmtError_('VALIDATION_FAILED', 'ค่ารหัสไม่อยู่ในรายการที่รองรับ', {
      field: field,
      issue: 'ENUM_NOT_ALLOWED',
      value: text
    });
  }
  return text;
}

function mgmtMutationEnumAllowsBlankPatch_(field) {
  return field === 'water_pressure' ||
    field === 'year_round_status' ||
    field === 'transfer_document_status';
}

function mgmtMutationParseArrayInput_(value, field, options) {
  const opts = options || {};
  if (Array.isArray(value)) return value.slice();

  if (mgmtMutationIsBlank_(value)) {
    return opts.blankAsEmpty === false ? null : [];
  }

  if (typeof value !== 'string') {
    throw mgmtError_('VALIDATION_FAILED', 'field รายการต้องเป็น Array หรือ JSON Array', {
      field: field
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw mgmtError_('VALIDATION_FAILED', 'JSON Array ไม่ถูกต้อง', {
      field: field,
      issue: 'INVALID_JSON'
    });
  }

  if (!Array.isArray(parsed)) {
    throw mgmtError_('VALIDATION_FAILED', 'field นี้ต้องเป็น JSON Array', {
      field: field,
      issue: 'ARRAY_REQUIRED'
    });
  }

  return parsed;
}

function mgmtMutationCanonicalCodeArray_(value, field) {
  const allowed = MGMT_MUTATION.ARRAY_CODES[field] || [];
  const input = mgmtMutationParseArrayInput_(value, field, { blankAsEmpty: true });
  const seen = {};
  const result = [];

  input.forEach(function(item) {
    if (typeof item !== 'string') {
      throw mgmtError_('VALIDATION_FAILED', 'รายการ code มีรูปแบบไม่ถูกต้อง', {
        field: field
      });
    }

    const code = mgmtNormalizeUpper_(item);
    if (!code || allowed.indexOf(code) < 0) {
      throw mgmtError_('VALIDATION_FAILED', 'พบ code ที่ไม่รองรับ', {
        field: field,
        value: code
      });
    }
    if (seen[code]) {
      throw mgmtError_('VALIDATION_FAILED', 'พบ code ซ้ำในรายการ', {
        field: field,
        value: code
      });
    }

    seen[code] = true;
    result.push(code);
  });

  return result;
}

function mgmtMutationCanonicalExistingCodeArray_(value, field) {
  if (mgmtMutationIsBlank_(value)) return null;
  return mgmtMutationCanonicalCodeArray_(value, field);
}

function mgmtMutationHttpUrlOrBlank_(value, field) {
  const text = mgmtMutationText_(value);
  if (!text) return '';

  if (!/^https?:\/\/\S+$/i.test(text)) {
    throw mgmtError_('VALIDATION_FAILED', 'URL ต้องขึ้นต้นด้วย http:// หรือ https://', {
      field: field
    });
  }
  return text;
}

function mgmtMutationCanonicalSharedVillages_(value, primaryVillageId, villageIndex) {
  const input = mgmtMutationParseArrayInput_(value, 'shared_villages_json', { blankAsEmpty: true });
  const seen = {};
  const result = [];

  input.forEach(function(item, index) {
    let villageId = '';

    if (typeof item === 'string') {
      villageId = mgmtNormalizeText_(item);
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const allowed = { village_id: true, villageId: true, villageIdRef: true };
      Object.keys(item).forEach(function(key) {
        if (!allowed[key]) {
          throw mgmtError_('VALIDATION_FAILED', 'shared_villages_json รับเฉพาะ village_id', {
            field: 'shared_villages_json',
            index: index,
            unsupportedField: key
          });
        }
      });
      villageId = mgmtNormalizeText_(item.village_id || item.villageId || item.villageIdRef);
    } else {
      throw mgmtError_('VALIDATION_FAILED', 'รายการหมู่บ้านที่ใช้น้ำร่วมมีรูปแบบไม่ถูกต้อง', {
        field: 'shared_villages_json',
        index: index
      });
    }

    if (!villageId || !villageIndex[villageId]) {
      throw mgmtError_('VALIDATION_FAILED', 'ไม่พบหมู่บ้านที่ใช้น้ำร่วมในฐานข้อมูลปัจจุบัน', {
        field: 'shared_villages_json',
        index: index,
        villageId: villageId
      });
    }
    if (villageId === primaryVillageId) {
      throw mgmtError_('VALIDATION_FAILED', 'หมู่บ้านที่ใช้น้ำร่วมต้องไม่ซ้ำกับหมู่บ้านหลัก', {
        field: 'shared_villages_json',
        index: index
      });
    }
    if (seen[villageId]) {
      throw mgmtError_('VALIDATION_FAILED', 'พบหมู่บ้านที่ใช้น้ำร่วมซ้ำกัน', {
        field: 'shared_villages_json',
        villageId: villageId
      });
    }

    seen[villageId] = true;
    const village = villageIndex[villageId].object;
    result.push({
      village_id: villageId,
      district: mgmtNormalizeText_(village.district),
      subdistrict: mgmtNormalizeText_(village.subdistrict),
      local_authority: mgmtNormalizeText_(village.local_authority),
      community_type: mgmtNormalizeText_(village.community_type),
      village_name: mgmtNormalizeText_(village.village_name),
      dla_village_code: mgmtNormalizeText_(village.dla_village_code),
      village_no: mgmtNormalizeText_(village.village_no)
    });
  });

  return result;
}

function mgmtMutationCanonicalExistingSharedVillages_(value, primaryVillageId, villageIndex) {
  if (mgmtMutationIsBlank_(value)) return null;

  // Feature 3 persists canonical shared-village objects with descriptive fields,
  // while Management request input deliberately accepts only stable village IDs.
  // For an existing persisted value, extract only the stable ID and rebuild the
  // canonical object from the current villages master instead of trusting stale
  // descriptive fields from the stored JSON.
  const input = mgmtMutationParseArrayInput_(value, 'shared_villages_json', { blankAsEmpty: true });
  const ids = input.map(function(item, index) {
    if (typeof item === 'string') return mgmtNormalizeText_(item);
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'shared_villages_json เดิมมีรูปแบบไม่ถูกต้อง', {
        field: 'shared_villages_json',
        index: index
      });
    }
    const villageId = mgmtNormalizeText_(item.village_id || item.villageId || item.villageIdRef);
    if (!villageId) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'shared_villages_json เดิมไม่มี village_id', {
        field: 'shared_villages_json',
        index: index
      });
    }
    return villageId;
  });

  return mgmtMutationCanonicalSharedVillages_(ids, primaryVillageId, villageIndex);
}

function mgmtMutationSharedVillageName_(sharedVillages) {
  return (sharedVillages || []).map(function(item) {
    const name = mgmtNormalizeText_(item.village_name);
    const moo = mgmtNormalizeText_(item.village_no);
    return name + (moo ? ' หมู่ ' + moo : '');
  }).join('; ');
}

function mgmtMutationAssertBlankPatchedDependents_(patch, normalizedPatch, fields, controllerField) {
  (fields || []).forEach(function(field) {
    if (!mgmtMutationHasOwn_(patch, field)) return;
    const value = normalizedPatch[field];
    const hasValue = Array.isArray(value) ? value.length > 0 : !mgmtMutationIsBlank_(value);
    if (hasValue) {
      throw mgmtError_('VALIDATION_FAILED', 'พบข้อมูลย่อยที่ไม่สอดคล้องกับสถานะหลัก', {
        field: field,
        controllerField: controllerField,
        issue: 'STALE_DEPENDENT_VALUE'
      });
    }
  });
}

function mgmtMutationCanonicalizeDirectPatch_(patch, before, snapshot) {
  mgmtMutationNormalizePatchObject_(patch);
  const normalized = {};

  Object.keys(patch).forEach(function(field) {
    const value = patch[field];

    if (MGMT_MUTATION.TEXT_FIELDS.indexOf(field) >= 0) {
      normalized[field] = mgmtMutationText_(value);
      return;
    }

    if (field === 'transfer_document_url') {
      normalized[field] = mgmtMutationHttpUrlOrBlank_(value, field);
      return;
    }

    if (MGMT_MUTATION.NUMBER_FIELDS.indexOf(field) >= 0) {
      if (field === 'latitude') {
        normalized[field] = mgmtMutationOptionalNumber_(value, field, { min: -90, max: 90 });
      } else if (field === 'longitude') {
        normalized[field] = mgmtMutationOptionalNumber_(value, field, { min: -180, max: 180 });
      } else {
        normalized[field] = mgmtMutationOptionalNumber_(value, field, { nonNegative: true });
      }
      return;
    }

    if (MGMT_MUTATION.INTEGER_FIELDS.indexOf(field) >= 0) {
      normalized[field] = mgmtMutationOptionalNumber_(value, field, {
        integer: true,
        nonNegative: true
      });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(MGMT_MUTATION.ENUMS, field)) {
      normalized[field] = mgmtMutationCanonicalEnum_(
        value,
        field,
        mgmtMutationEnumAllowsBlankPatch_(field)
      );
      return;
    }

    if (field === 'usage_types_json' ||
        field === 'quality_failure_categories_json' ||
        field === 'available_months_json') {
      normalized[field] = mgmtMutationCanonicalCodeArray_(value, field);
      return;
    }

    if (field === 'shared_villages_json') {
      normalized[field] = mgmtMutationCanonicalSharedVillages_(
        value,
        mgmtNormalizeText_(before.village_id),
        snapshot.villageIndex
      );
      return;
    }

    throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ยังไม่มี canonicalizer', {
      field: field
    });
  });

  return normalized;
}

// ============================================================================
// Patch-driven intended-state builder
// ============================================================================

function mgmtMutationBuildIntendedObject_(before, patch, snapshot, now) {
  const normalizedPatch = mgmtMutationCanonicalizeDirectPatch_(patch, before, snapshot);
  const after = {};

  MGMT_DATA.HEADERS.SYSTEMS.forEach(function(header) {
    after[header] = before[header];
  });

  Object.keys(normalizedPatch).forEach(function(field) {
    const value = normalizedPatch[field];
    if (field === 'usage_types_json' ||
        field === 'quality_failure_categories_json' ||
        field === 'available_months_json' ||
        field === 'shared_villages_json') {
      after[field] = JSON.stringify(value);
    } else {
      after[field] = value;
    }
  });

  // Coordinates are validated only when the coordinate group is touched.
  if (mgmtMutationTouchesAny_(patch, ['latitude', 'longitude'])) {
    const latBlank = mgmtMutationIsBlank_(after.latitude);
    const lngBlank = mgmtMutationIsBlank_(after.longitude);
    if (latBlank !== lngBlank) {
      throw mgmtError_('VALIDATION_FAILED', 'Latitude และ Longitude ต้องว่างทั้งคู่หรือมีค่าทั้งคู่', {
        fields: ['latitude', 'longitude']
      });
    }
  }

  // construction_year_ce is server-derived only when construction_year_be changes.
  if (mgmtMutationHasOwn_(patch, 'construction_year_be')) {
    if (mgmtMutationIsBlank_(after.construction_year_be)) {
      after.construction_year_be = '';
      after.construction_year_ce = '';
    } else {
      const yearBE = mgmtMutationOptionalNumber_(after.construction_year_be, 'construction_year_be', {
        integer: true
      });
      after.construction_year_be = yearBE;
      after.construction_year_ce = yearBE >= 2400 ? yearBE - 543 : '';
    }
  }

  // Usage group: once touched, preserve Processor canonical relationship.
  if (mgmtMutationTouchesAny_(patch, ['usage_type', 'usage_types_json'])) {
    if (mgmtMutationHasOwn_(patch, 'usage_types_json')) {
      const usageArray = normalizedPatch.usage_types_json;
      const derivedScalar = usageArray.length === 1 ? usageArray[0] : 'UNKNOWN';
      if (mgmtMutationHasOwn_(patch, 'usage_type') && normalizedPatch.usage_type !== derivedScalar) {
        throw mgmtError_('VALIDATION_FAILED', 'usage_type ไม่สอดคล้องกับ usage_types_json', {
          fields: ['usage_type', 'usage_types_json']
        });
      }
      after.usage_types_json = JSON.stringify(usageArray);
      after.usage_type = derivedScalar;
    } else {
      const scalar = normalizedPatch.usage_type;
      after.usage_type = scalar;
      after.usage_types_json = JSON.stringify(
        scalar && scalar !== 'UNKNOWN' ? [scalar] : []
      );
    }
  }

  // Drinking-water group. Unrelated edits do NOT normalize legacy FAIL/blank rows.
  if (mgmtMutationTouchesAny_(patch, [
    'drinking_water_quality',
    'quality_failure_categories_json',
    'quality_failure_detail'
  ])) {
    const quality = mgmtMutationHasOwn_(patch, 'drinking_water_quality')
      ? normalizedPatch.drinking_water_quality
      : mgmtMutationCanonicalEnum_(after.drinking_water_quality, 'drinking_water_quality', false);

    after.drinking_water_quality = quality;

    if (quality === 'FAIL') {
      const categories = mgmtMutationHasOwn_(patch, 'quality_failure_categories_json')
        ? normalizedPatch.quality_failure_categories_json
        : mgmtMutationCanonicalExistingCodeArray_(
          before.quality_failure_categories_json,
          'quality_failure_categories_json'
        );

      if (!categories || categories.length === 0) {
        throw mgmtError_('VALIDATION_FAILED', 'เมื่อคุณภาพน้ำไม่ผ่าน ต้องระบุหมวดสาเหตุอย่างน้อย 1 รายการ', {
          field: 'quality_failure_categories_json'
        });
      }

      after.quality_failure_categories_json = JSON.stringify(categories);
      if (mgmtMutationHasOwn_(patch, 'quality_failure_detail')) {
        after.quality_failure_detail = normalizedPatch.quality_failure_detail;
      }
    } else {
      mgmtMutationAssertBlankPatchedDependents_(
        patch,
        normalizedPatch,
        ['quality_failure_categories_json', 'quality_failure_detail'],
        'drinking_water_quality'
      );
      after.quality_failure_categories_json = '[]';
      after.quality_failure_detail = '';
    }
  }

  // Year-round group. Legacy blank/blank survives unrelated edits.
  if (mgmtMutationTouchesAny_(patch, ['year_round_status', 'available_months_json'])) {
    const status = mgmtMutationHasOwn_(patch, 'year_round_status')
      ? normalizedPatch.year_round_status
      : mgmtMutationCanonicalEnum_(after.year_round_status, 'year_round_status', true);

    after.year_round_status = status;

    if (status === 'SEASONAL') {
      const months = mgmtMutationHasOwn_(patch, 'available_months_json')
        ? normalizedPatch.available_months_json
        : mgmtMutationCanonicalExistingCodeArray_(before.available_months_json, 'available_months_json');

      if (!months || months.length === 0) {
        throw mgmtError_('VALIDATION_FAILED', 'เมื่อระบุว่าไม่ตลอดปี ต้องเลือกเดือนที่มีน้ำอย่างน้อย 1 เดือน', {
          field: 'available_months_json'
        });
      }
      after.available_months_json = JSON.stringify(months);
    } else {
      mgmtMutationAssertBlankPatchedDependents_(
        patch,
        normalizedPatch,
        ['available_months_json'],
        'year_round_status'
      );
      after.available_months_json = '[]';
    }
  }

  // Shared-village group. Existing legacy text-only YES is tolerated until this group is edited.
  if (mgmtMutationTouchesAny_(patch, [
    'shared_with_other_village',
    'shared_village_name',
    'shared_villages_json'
  ])) {
    const flag = mgmtMutationHasOwn_(patch, 'shared_with_other_village')
      ? normalizedPatch.shared_with_other_village
      : mgmtMutationCanonicalEnum_(after.shared_with_other_village, 'shared_with_other_village', false);

    after.shared_with_other_village = flag;

    if (flag === 'YES') {
      const structured = mgmtMutationHasOwn_(patch, 'shared_villages_json')
        ? normalizedPatch.shared_villages_json
        : mgmtMutationCanonicalExistingSharedVillages_(
          before.shared_villages_json,
          mgmtNormalizeText_(before.village_id),
          snapshot.villageIndex
        );

      if (mgmtMutationHasOwn_(patch, 'shared_villages_json') && (!structured || structured.length === 0)) {
        throw mgmtError_('VALIDATION_FAILED', 'เมื่อระบุว่าใช้ระบบร่วม shared_villages_json ที่ส่งมาโดยตรงต้องมีอย่างน้อย 1 หมู่บ้าน', {
          field: 'shared_villages_json',
          issue: 'SHARED_VILLAGE_REQUIRED'
        });
      }

      if (structured && structured.length > 0) {
        const derivedName = mgmtMutationSharedVillageName_(structured);
        if (mgmtMutationHasOwn_(patch, 'shared_village_name') &&
            mgmtNormalizeText_(normalizedPatch.shared_village_name) !== derivedName) {
          throw mgmtError_('VALIDATION_FAILED', 'shared_village_name ไม่สอดคล้องกับ shared_villages_json', {
            fields: ['shared_village_name', 'shared_villages_json'],
            issue: 'SHARED_NAME_MISMATCH'
          });
        }
        after.shared_villages_json = JSON.stringify(structured);
        after.shared_village_name = derivedName;
      }

      const name = mgmtNormalizeText_(after.shared_village_name);
      const hasStructured = structured && structured.length > 0;
      if (!name && !hasStructured) {
        throw mgmtError_('VALIDATION_FAILED', 'เมื่อระบุว่าใช้ระบบร่วม ต้องระบุหมู่บ้านร่วม', {
          fields: ['shared_village_name', 'shared_villages_json']
        });
      }
    } else {
      mgmtMutationAssertBlankPatchedDependents_(
        patch,
        normalizedPatch,
        ['shared_village_name', 'shared_villages_json'],
        'shared_with_other_village'
      );
      after.shared_village_name = '';
      after.shared_villages_json = '[]';
    }
  }

  // Establishment/transfer group.
  if (mgmtMutationTouchesAny_(patch, [
    'establishment_type',
    'establishment_agency',
    'transfer_year_be',
    'transfer_agency',
    'transfer_other',
    'transfer_document_status',
    'transfer_document_url'
  ])) {
    const establishment = mgmtMutationHasOwn_(patch, 'establishment_type')
      ? normalizedPatch.establishment_type
      : mgmtMutationCanonicalEnum_(after.establishment_type, 'establishment_type', false);

    after.establishment_type = establishment;

    if (establishment === 'ACCEPTED_ASSET') {
      mgmtMutationAssertBlankPatchedDependents_(
        patch,
        normalizedPatch,
        ['transfer_year_be', 'transfer_agency', 'transfer_other', 'transfer_document_status', 'transfer_document_url'],
        'establishment_type'
      );
      if (!mgmtNormalizeText_(after.establishment_agency)) {
        throw mgmtError_('VALIDATION_FAILED', 'กรณีรับมอบตามระเบียบพัสดุต้องระบุหน่วยงานที่เกี่ยวข้อง', {
          field: 'establishment_agency'
        });
      }
      after.transfer_year_be = '';
      after.transfer_agency = '';
      after.transfer_other = '';
      after.transfer_document_status = '';
      after.transfer_document_url = '';
    } else if (establishment === 'TRANSFERRED') {
      mgmtMutationAssertBlankPatchedDependents_(
        patch,
        normalizedPatch,
        ['establishment_agency'],
        'establishment_type'
      );
      after.establishment_agency = '';
      if (!mgmtNormalizeText_(after.transfer_agency)) {
        throw mgmtError_('VALIDATION_FAILED', 'กรณีถ่ายโอนต้องระบุหน่วยงานที่ถ่ายโอน', {
          field: 'transfer_agency'
        });
      }
      if (!mgmtMutationIsBlank_(after.transfer_year_be)) {
        after.transfer_year_be = mgmtMutationOptionalNumber_(after.transfer_year_be, 'transfer_year_be', {
          integer: true,
          nonNegative: true
        });
      }
      if (mgmtMutationIsBlank_(after.transfer_document_status)) {
        after.transfer_document_status = 'NO_DATA';
      } else {
        after.transfer_document_status = mgmtMutationCanonicalEnum_(
          after.transfer_document_status,
          'transfer_document_status',
          false
        );
      }
      if (!mgmtMutationIsBlank_(after.transfer_document_url)) {
        after.transfer_document_url = mgmtMutationHttpUrlOrBlank_(
          after.transfer_document_url,
          'transfer_document_url'
        );
      }
    } else {
      mgmtMutationAssertBlankPatchedDependents_(
        patch,
        normalizedPatch,
        ['establishment_agency', 'transfer_year_be', 'transfer_agency', 'transfer_other', 'transfer_document_status', 'transfer_document_url'],
        'establishment_type'
      );
      after.establishment_agency = '';
      after.transfer_year_be = '';
      after.transfer_agency = '';
      after.transfer_other = '';
      after.transfer_document_status = '';
      after.transfer_document_url = '';
    }
  }

  // Surface-water detail group.
  if (mgmtMutationTouchesAny_(patch, [
    'water_source_type',
    'surface_water_type',
    'surface_water_agency'
  ])) {
    const type = mgmtMutationHasOwn_(patch, 'water_source_type')
      ? normalizedPatch.water_source_type
      : mgmtMutationCanonicalEnum_(after.water_source_type, 'water_source_type', false);

    after.water_source_type = type;
    if (type !== 'SURFACE_WATER' && type !== 'MIXED') {
      mgmtMutationAssertBlankPatchedDependents_(
        patch,
        normalizedPatch,
        ['surface_water_type', 'surface_water_agency'],
        'water_source_type'
      );
      after.surface_water_type = '';
      after.surface_water_agency = '';
    }
  }

  // Exact immutable identity and server-managed timestamp.
  after.system_id = before.system_id;
  after.village_id = before.village_id;
  after.source_excel_row = before.source_excel_row;
  after.system_no = before.system_no;
  after.created_at = before.created_at;
  after.updated_at = now instanceof Date ? now : new Date();

  return {
    normalizedPatch: normalizedPatch,
    intendedObject: after
  };
}

function mgmtMutationChangedFields_(before, after) {
  const fields = [];
  MGMT_DATA.HEADERS.SYSTEMS.forEach(function(field) {
    if (field === 'updated_at') return;
    if (mgmtCanonicalJson_(before[field]) !== mgmtCanonicalJson_(after[field])) {
      fields.push(field);
    }
  });
  return fields;
}



return {MGMT_MUTATION: MGMT_MUTATION, MGMT_DATA: MGMT_DATA, buildIntended: mgmtMutationBuildIntendedObject_, changedFields: mgmtMutationChangedFields_};
})();


// source: supabase/functions/_shared/backend/security.mjs
const __security = (() => {

const enc=new TextEncoder();
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
async function sha(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
async function requestHash(secret,v){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(JSON.stringify(stable(v)))))].map(v=>v.toString(16).padStart(2,'0')).join('');}
function unhex(v){if(!/^[0-9a-f]{64}$/i.test(v))throw fail('CRYPTO_CONFIGURATION');return Uint8Array.from(v.match(/../g),v=>parseInt(v,16));}
async function seal(secret,value){const key=await crypto.subtle.importKey('raw',unhex(secret),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(value)));return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...new Uint8Array(bytes)));}
async function open(secret,cipher){const [a,b]=cipher.split('.');const key=await crypto.subtle.importKey('raw',unhex(secret),'AES-GCM',false,['decrypt']);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(a),c=>c.charCodeAt(0))},key,Uint8Array.from(atob(b),c=>c.charCodeAt(0)))));}
function jwtClaims(token){try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));}catch{throw fail('AUTH_INVALID');}}
function password(value){if(typeof value!=='string'||value.length<8||value.length>128)throw fail('VALIDATION_FAILED','กรุณากำหนดรหัสผ่านอย่างน้อย 8 ตัวอักษร และไม่เกิน 128 ตัวอักษร');}
function knownError(e){const source=e.code||e.mgmtCode||String(e.message||'');const names=['WORKFLOW_RETIRED','CONFLICT','FORBIDDEN','NOT_FOUND','SESSION_INVALID','SESSION_EXPIRED','SESSION_REVOKED','SESSION_IDLE_EXPIRED','AUTH_INVALID','AUTH_ACCOUNT_DISABLED','AUTH_ACCOUNT_DELETED','AUTH_PASSWORD_CHANGE_REQUIRED','ACCOUNT_DISTRICT_REQUIRED','VALIDATION_FAILED','IMMUTABLE_FIELD','IDEMPOTENCY_REQUIRED','IDEMPOTENCY_CONFLICT','USERNAME_IN_USE','PROCESSING_NOT_READY','RAW_FIRST_REQUIRED','BASE_EXPIRED','TOMBSTONED','AUTH_JOB_PENDING','RATE_LIMITED','SYNC_CONFIGURATION','UNKNOWN_COMMIT'];return names.find(n=>source===n||source.includes(' '+n)||source.startsWith(n))||'SERVER_ERROR';}

return {fail: fail, sha: sha, stable: stable, requestHash: requestHash, seal: seal, open: open, jwtClaims: jwtClaims, password: password, knownError: knownError};
})();


// source: supabase/functions/_shared/backend/public-fields.mjs
const __fields = (() => {

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

function validateSourceInput(payload, manifest) {
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

function projectPublicDataset(payload, manifest) {
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

const PUBLIC_FIELDS = FIELDS;
const PUBLIC_PROJECTION_POLICY_REVISION = 'REVIEW_DEFAULT_DENY_2026_10_21_V1';

return {PUBLIC_FIELDS: PUBLIC_FIELDS, validateSourceInput: validateSourceInput, projectPublicDataset: projectPublicDataset, PUBLIC_PROJECTION_POLICY_REVISION: PUBLIC_PROJECTION_POLICY_REVISION};
})();


// source: supabase/functions/_shared/backend/supabase.mjs
const __supabase = (() => {
const {fail} = __security;

function supabase(env,fetcher=fetch){const url=env.SUPABASE_URL?.replace(/\/$/,'');const service=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!service)throw fail('SYNC_CONFIGURATION');
 async function call(path,{method='POST',body,token=service,headers={}}={}){let r;try{r=await fetcher(url+path,{method,headers:{apikey:service,Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw fail('UNKNOWN_COMMIT');}
 let j;try{j=await r.json();}catch{j={};}if(!r.ok)throw fail(j.message||'AUTH_INVALID');return j;}
 return {
 rpc:(name,args)=>{if(!/^[a-z_]+$/.test(name))throw fail('INVALID_RPC');return call('/rest/v1/rpc/'+name,{body:args,headers:{'Content-Profile':'api','Accept-Profile':'api'}});},
 auth:{
  async login(identity,password){const a=await call('/auth/v1/token?grant_type=password',{body:{email:identity,password}});await call('/auth/v1/user',{method:'GET',token:a.access_token});return a;},
  create:(email,password)=>call('/auth/v1/admin/users',{body:{email,password,email_confirm:true}}),
  setPassword:(id,password)=>call('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'PUT',body:{password}}),
  delete:id=>call('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'DELETE'}),
  async change(identity,current,newPassword){const a=await this.login(identity,current);await call('/auth/v1/user',{method:'PUT',token:a.access_token,body:{password:newPassword}});return a;},
  logout:async token=>{try{await call('/auth/v1/logout?scope=local',{token,body:{}});}catch(e){if(e.code==='UNKNOWN_COMMIT')throw e;}},
 },
 };
}

return {supabase: supabase};
})();


// source: supabase/functions/_shared/backend/engine.mjs
const __engine = (() => {
const {MGMT_DATA,MGMT_MUTATION,buildIntended} = __canonical;
const {sha,requestHash,seal,open,jwtClaims,password,fail,knownError} = __security;
const {PUBLIC_FIELDS} = __fields;



function intended(before,patch,villages){const row=Object.fromEntries(MGMT_DATA.HEADERS.SYSTEMS.map(k=>[k,before[k]??'']));const villageIndex=Object.fromEntries(villages.map(v=>[v.village_id,{object:v}]));
 const after=buildIntended(row,patch,{villageIndex},new Date()).intendedObject;
 return Object.fromEntries(Object.entries(after).filter(([k])=>!['system_id','village_id','source_excel_row','system_no','created_at'].includes(k)).map(([k,v])=>[k,v===''&&['latitude','longitude','capacity_m3_hr','households_served','construction_year_be','construction_year_ce','transfer_year_be','beneficiaries','monthly_production_cost','monthly_service_revenue','water_tariff'].includes(k)?null:v]));}
function publicProjection(source){const eligible=source.waterSystems.filter(s=>!s.processingGuard||s.processingGuard.mutable===true);const links=new Set(eligible.map(s=>s.village_id));
 const has=v=>v===true||v===1||v==='1'||String(v).trim().toUpperCase()==='YES'||v==='มีประปาหมู่บ้าน';
 const hidden=new Set(source.villages.filter(v=>has(v.has_village_waterworks)&&!links.has(v.village_id)).map(v=>v.village_id));
 const blank=v=>v==null||String(v).trim()==='';
 const data={villages:source.villages.filter(v=>!hidden.has(v.village_id)),waterSystems:eligible.filter(s=>!hidden.has(s.village_id)&&!blank(s.latitude)&&!blank(s.longitude)),waterSources:source.waterSources.filter(s=>!hidden.has(s.village_id))};
 for(const[k,rows]of Object.entries(data))data[k]=rows.map(r=>Object.fromEntries(PUBLIC_FIELDS[k].filter(f=>Object.hasOwn(r,f)).map(f=>[f,r[f]]))).sort((a,b)=>String(a[PUBLIC_FIELDS[k][0]]).localeCompare(String(b[PUBLIC_FIELDS[k][0]])));
 const missing=eligible.filter(s=>blank(s.latitude)||blank(s.longitude)).length;
 return{success:true,...data,generatedAt:new Date().toISOString(),sourceRevision:source.sourceRevision,epoch:source.epoch,projection:{policy:'PUBLIC_ALLOWLIST_R5_1_V1'},projectionOwner:'SERVER_R5_1',suppression:{rule:'R5_1_TEMP_HIDE_244',hiddenMissingCoordinateSystems:missing,hiddenWaterworksVillagesWithoutSystem:hidden.size,hiddenIssueRows:missing+hidden.size,inputVillages:source.villages.length,inputWaterSystems:eligible.length,outputVillages:data.villages.length,outputWaterSystems:data.waterSystems.length}};
}
function createEngine({rpc,auth,env,processor}){
 if(!env.TOKEN_ENCRYPTION_KEY||!env.REQUEST_HMAC_KEY)throw fail('CRYPTO_CONFIGURATION');
 const execute=(t,action,payload={},mutation_id=null,request_hash=null)=>rpc('execute',{token_hash:t,action,payload,mutation_id,request_hash});
 async function hashPayload(a,p){return requestHash(env.REQUEST_HMAC_KEY,{action:a,payload:p});}
 async function accountJob(t,a,req,mid,rhash){const credential=req.password??req.newPassword;password(credential);const safe={...req};delete safe.password;delete safe.newPassword;delete safe.currentPassword;
 safe.identityDomain=env.AUTH_IDENTITY_DOMAIN;if(!safe.identityDomain)throw fail('SYNC_CONFIGURATION');
 const begin=await rpc('auth_job_begin',{t,act:a,p:safe,mid,rhash,cipher:await seal(env.TOKEN_ENCRYPTION_KEY,{password:credential,currentPassword:req.currentPassword})});
 if(begin.state==='COMMITTED')return begin.result;
 const job=await rpc('auth_job_state',{t,mid});const creds=await open(env.TOKEN_ENCRYPTION_KEY,job.credential_cipher);
 try{let id=job.target_auth_id,session=null,newCipher=null;
  if(a==='technicians.create'){if(id){await auth.setPassword(id,creds.password);}else{const u=await auth.create(job.provider_identity,creds.password);id=u.id||u.user?.id;}}
  else if(a==='auth.changePassword'){const s=await auth.change(job.provider_identity,creds.currentPassword,creds.password);id=s.user.id;session=jwtClaims(s.access_token).session_id;newCipher=await seal(env.TOKEN_ENCRYPTION_KEY,s);}
  else await auth.setPassword(id,creds.password);
  return await rpc('auth_job_finish',{t,mid,auth_id:id,session_id:session,new_cipher:newCipher});
 }catch(e){await rpc('auth_job_fail',{t,mid,code:knownError(e)}).catch(()=>{});throw fail('AUTH_JOB_PENDING','การดำเนินการบัญชียังรอตรวจสอบ กรุณาลองซ้ำด้วยรายการเดิม');}
 }
 async function management(envelope,clientKey='unknown'){
 function safeKeys(v,depth=0){if(depth>30)throw fail('VALIDATION_FAILED');if(!v||typeof v!=='object')return;for(const k of Object.keys(v)){if(['__proto__','prototype','constructor'].includes(k))throw fail('VALIDATION_FAILED');safeKeys(v[k],depth+1);}}safeKeys(envelope);
 if(envelope?.version!==2||typeof envelope.action!=='string'||!envelope.payload||Array.isArray(envelope.payload))throw fail('VALIDATION_FAILED');
 const a=envelope.action,p=envelope.payload,req=p.request||{},mid=p.mutationId||null;
 if(a==='auth.login'){
  const loginKey=await sha('login:'+String(p.username).trim().toLowerCase());if(!await rpc('rate_limit',{key:loginKey,max_count:5,seconds:900})||!await rpc('rate_limit',{key:await sha('ip:'+clientKey),max_count:60,seconds:900}))throw fail('RATE_LIMITED');
  const mapping=await rpc('login_identity',{username:String(p.username||'')});if(!mapping){await auth.login('unknown-login@'+env.AUTH_IDENTITY_DOMAIN,String(p.password||'')).catch(()=>{});throw fail('AUTH_INVALID','ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');}
  let s;try{s=await auth.login(mapping.identity,p.password);}catch{throw fail('AUTH_INVALID','ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');}
  const claims=jwtClaims(s.access_token);if(claims.sub!==s.user.id||!claims.session_id)throw fail('AUTH_INVALID');
  const token='MGT-'+[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const result=await rpc('open_session',{p:{authId:s.user.id,username:p.username,sessionId:claims.session_id,tokenHash:await sha(token),cipher:await seal(env.TOKEN_ENCRYPTION_KEY,s)}});
  await rpc('login_success',{key:loginKey});
  return{...result,token};
 }
 if(!/^MGT-[0-9a-f]{64}$/.test(p.token||''))throw fail('SESSION_INVALID');const t=await sha(p.token);
 if(a==='auth.logout'){let secret;try{secret=await rpc('session_secret',{token_hash:t});}catch{}const result=await execute(t,a);if(secret){const s=await open(env.TOKEN_ENCRYPTION_KEY,secret.cipher);await auth.logout(s.access_token).catch(()=>{});}return result;}
 if(a==='data.bootstrap'){const boot=await execute(t,a);return{...boot,enumCatalog:MGMT_DATA.ENUM_CATALOG,featureFlags:{...MGMT_DATA.FEATURE_FLAGS,...boot.featureFlags,technicianDistrictScope:true}};}
 if(a==='data.updateWaterSystem'){
  const prior=await rpc('receipt',{t,mid,rhash:await hashPayload(a,req)});if(prior)return prior;
  const current=await execute(t,'data.waterSystem',{systemId:req.systemId});const dash=await execute(t,'data.dashboard');
  if(current.system.recordVersion!==req.expectedVersion)throw fail('CONFLICT');
  return execute(t,a,{...req,intended:intended(current.system,req.patch,dash.villages)},mid,await hashPayload(a,req));
 }
 if(['data.deleteWaterSystem'].includes(a))return execute(t,a,req,mid,await hashPayload(a,req));
 if(['technicians.create','technicians.resetPassword','auth.changePassword'].includes(a))return accountJob(t,a,req,mid,await hashPayload(a,req));
 if(['technicians.update','technicians.disable','technicians.enable','technicians.delete'].includes(a))return rpc('account_mutate',{t,act:a,p:req,mid,rhash:await hashPayload(a,req)});
 if(a.startsWith('sheets.')||a==='data.directSyncStatus')throw fail('WORKFLOW_RETIRED','การแก้ไขผ่าน Google Sheets ยุติแล้ว กรุณาใช้เว็บไซต์');
 if(a==='auth.jobStatus')return rpc('job_receipt',{t,mid:p.jobId});
 if(a==='data.revision')return rpc('revision',{t});
 if(a==='feature3.submit'||a==='feature3.retry'||a==='feature3.bootstrap'){
  const me=await execute(t,'auth.me');if(me.user.mustChangePassword)throw fail('AUTH_PASSWORD_CHANGE_REQUIRED');
  const result=await processor(a,p,{...me.user,authTokenHash:t});
  const current=await execute(t,'auth.me');if(current.user.role!==me.user.role||current.user.district!==me.user.district)throw fail('SESSION_REVOKED');return result;
 }
 return execute(t,a,a==='data.waterSystem'?{systemId:p.systemId}:a==='data.entityHistory'?req:p);
 }
 async function handle(request){const id=crypto.randomUUID();try{const u=new URL(request.url);let data;if(request.method==='GET'&&(u.pathname.endsWith('/public')||u.pathname.endsWith('/public-data'))){data=await rpc('public_snapshot',{});if(!data)throw fail('SYNC_NOT_READY');return Response.json(data,{headers:{'Cache-Control':'no-store'}});}
  const text=await request.text();if(new TextEncoder().encode(text).length>256000)throw fail('VALIDATION_FAILED');
  data=await management(JSON.parse(text),request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown');return Response.json({success:true,data,meta:{requestId:id,serverAt:new Date().toISOString()}},{headers:{'Cache-Control':'no-store'}});
 }catch(e){const code=knownError(e);const message=({CONFLICT:'ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดรายการล่าสุด',FORBIDDEN:'คุณไม่มีสิทธิ์ดำเนินการนี้',SESSION_INVALID:'กรุณาเข้าสู่ระบบใหม่',USERNAME_IN_USE:'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว'})[code]||e.mgmtSafeMessage||'ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่';return Response.json({success:false,error:{code,message},meta:{requestId:id}},{status:200,headers:{'Cache-Control':'no-store'}});}}
 return{management,handle};
}

return {intended: intended, publicProjection: publicProjection, createEngine: createEngine};
})();


// source: supabase/functions/_shared/backend/runtime.mjs
const __runtime = (() => {
const {publicProjection} = __engine;
const {sha,stable} = __security;
// Internal PostgreSQL snapshots and durable Auth cleanup only. No Sheets adapter/binding.


const stringify=v=>JSON.stringify(stable(v));
function createRuntime({rpc,auth}){
 async function snapshots(){
  const source=await rpc('public_source',{}),pub=publicProjection(source);
  pub.datasetVersion=await sha(stringify({villages:pub.villages,waterSystems:pub.waterSystems,waterSources:pub.waterSources,policy:'PUBLIC_ALLOWLIST_R5_1_V1'}));
  const published=await rpc('snapshot_publish',{p:{scope:'PUBLIC',epoch:source.epoch,revision:source.sourceRevision,policy:'PUBLIC_ALLOWLIST_R5_1_V1',hash:pub.datasetVersion,payload:pub}});
  // Districts come from canonical data, never from obsolete workbook bindings.
  let privatePublished=0;
  const scopes=new Set([null,...source.villages.map(v=>v.district).filter(Boolean)]);
  for(const district of scopes){
   const data=await rpc('private_snapshot_source',{district});
   const content={villages:data.villages,waterSystems:data.waterSystems,waterSources:data.waterSources};
   if(await rpc('snapshot_publish',{p:{scope:district===null?'PRIVATE:ADMIN':'PRIVATE:DISTRICT:'+district,epoch:data.epoch,revision:data.sourceRevision,policy:'PRIVATE_V1',hash:await sha(stringify(content)),payload:data}}))privatePublished++;
  }
  // False promotion is observable; stale work is never reported as current.
  return{sourceRevision:source.sourceRevision,publicPublished:published,privatePublished,privateExpected:scopes.size};
 }
 async function tick(){
  const summary={snapshots:null,snapshotFailed:false,authDeleted:0,authFailed:0};
  // Snapshot failure must not starve durable account cleanup (or undo a committed mutation).
  try{summary.snapshots=await snapshots();summary.snapshotFailed=!summary.snapshots.publicPublished||summary.snapshots.privatePublished!==summary.snapshots.privateExpected;}catch{summary.snapshotFailed=true;}
  for(const job of await rpc('auth_cleanup_jobs',{})){
   try{await auth.delete(job.authId);await rpc('auth_cleanup_done',{job_id:job.jobId});summary.authDeleted++;}
   catch{summary.authFailed++;}
  }
  return summary;
 }
 return{snapshots,tick};
}

return {createRuntime: createRuntime};
})();


const {supabase} = __supabase;
const {createRuntime} = __runtime;
const {sha} = __security;



const env=Deno.env.toObject();const runtime=createRuntime(supabase(env));
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response('Method denied',{status:405});
 if(!env.WORKER_SECRET||await sha(req.headers.get('Authorization')||'')!==await sha('Bearer '+env.WORKER_SECRET))return new Response('Denied',{status:403});
 if(env.RUNTIME_WORKER_ENABLED!=='true')return Response.json({state:'DISABLED'});
 try{const p=await req.json();if(p.action==='snapshots')return Response.json(await runtime.snapshots());
  if(p.action==='tick'){const result=await runtime.tick();return Response.json(result,{status:result.snapshotFailed||result.authFailed?503:200});}
  return new Response('Invalid action',{status:400});
 }catch{return Response.json({state:'RETRY_REQUIRED'},{status:503});}
});

