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

function mgmtMutationObjectToRow_(headers, object) {
  return headers.map(function(header) {
    return mgmtMutationHasOwn_(object, header) ? object[header] : '';
  });
}

// ============================================================================
// Entity / record-control helpers
// ============================================================================

function mgmtMutationFindSystemEntryLocked_(systemsTable, systemId) {
  const idIndex = systemsTable.headerMap.system_id;
  const matches = [];

  systemsTable.rows.forEach(function(row, offset) {
    if (mgmtNormalizeText_(row[idIndex]) === systemId) {
      matches.push({
        sheetRow: offset + 2,
        row: row,
        object: mgmtRowObject_(systemsTable.headers, row)
      });
    }
  });

  if (matches.length === 0) {
    throw mgmtError_('NOT_FOUND', 'ไม่พบระบบประปาที่ต้องการแก้ไข');
  }
  if (matches.length > 1) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบ system_id ซ้ำใน water_systems', {
      systemId: systemId
    });
  }
  return matches[0];
}

function mgmtMutationAssertTargetRowHasNoFormulas_(systemsTable, sheetRow, systemId) {
  let formulas;
  try {
    formulas = systemsTable.sheet
      .getRange(sheetRow, 1, 1, systemsTable.headers.length)
      .getFormulas()[0];
  } catch (error) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่สามารถตรวจสอบสูตรในแถวระบบประปาก่อนแก้ไขได้', {
      systemId: systemId
    });
  }

  const formulaColumns = [];
  (formulas || []).forEach(function(formula, index) {
    if (!mgmtMutationIsBlank_(formula)) {
      formulaColumns.push(systemsTable.headers[index] || ('COLUMN_' + (index + 1)));
    }
  });

  if (formulaColumns.length > 0) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่อนุญาตให้เขียนทับแถว water_systems ที่มีสูตร', {
      systemId: systemId,
      formulaColumns: formulaColumns
    });
  }
  return true;
}

// ============================================================================
// Audit helpers + recovery
// ============================================================================

function mgmtMutationNewAuditId_() {
  return MGMT_MUTATION.AUDIT.AUDIT_PREFIX + Utilities.getUuid();
}

function mgmtMutationNewTransactionId_() {
  return MGMT_MUTATION.AUDIT.TRANSACTION_PREFIX + Utilities.getUuid();
}

function mgmtMutationReadAuditTable_(ss) {
  return mgmtReadExactTable_(
    ss,
    MGMT_CONFIG.SHEETS.AUDIT,
    MGMT_CONFIG.HEADERS.AUDIT
  );
}

function mgmtMutationAuditTransitionRange_(auditTable) {
  const statusIndex = auditTable.headerMap.audit_status;
  const committedIndex = auditTable.headerMap.committed_at;
  const errorIndex = auditTable.headerMap.error_code;

  if (statusIndex === undefined || committedIndex === undefined || errorIndex === undefined ||
      committedIndex !== statusIndex + 1 || errorIndex !== statusIndex + 2) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'audit_log transition columns ไม่ต่อเนื่องตาม schema', {
      audit_status: statusIndex,
      committed_at: committedIndex,
      error_code: errorIndex
    });
  }

  return {
    startColumn: statusIndex + 1,
    width: 3
  };
}

function mgmtMutationRefreshAuditTableLocked_(auditTable) {
  const sheet = auditTable.sheet;
  const width = auditTable.headers.length;
  const header = sheet.getRange(1, 1, 1, width).getValues()[0];

  if (mgmtCanonicalJson_(header) !== mgmtCanonicalJson_(auditTable.headers)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'audit_log header เปลี่ยนระหว่าง transaction');
  }

  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, width).getValues()
    : [];

  return {
    sheet: sheet,
    headers: auditTable.headers,
    headerMap: auditTable.headerMap,
    rows: rows
  };
}

function mgmtMutationAuditIdentityFromObject_(object) {
  return {
    auditId: mgmtNormalizeText_(object && (object.audit_id || object.auditId)),
    transactionId: mgmtNormalizeText_(object && (object.transaction_id || object.transactionId)),
    entityId: mgmtNormalizeText_(object && (object.entity_id || object.entityId)),
    action: mgmtNormalizeUpper_(object && object.action),
    sheetName: mgmtNormalizeText_(object && (object.sheet_name || object.sheetName))
  };
}

function mgmtMutationFindAuditEntryByIdentityLocked_(auditTable, identity) {
  const expected = mgmtMutationAuditIdentityFromObject_(identity || {});
  if (!expected.auditId || !expected.transactionId) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit stable identity ไม่ครบถ้วน');
  }

  const idMatches = [];
  const txMatches = [];

  auditTable.rows.forEach(function(row, offset) {
    const object = mgmtRowObject_(auditTable.headers, row);
    if (mgmtNormalizeText_(object.audit_id) === expected.auditId) {
      idMatches.push({ sheetRow: offset + 2, row: row, object: object });
    }
    if (mgmtNormalizeText_(object.transaction_id) === expected.transactionId) {
      txMatches.push({ sheetRow: offset + 2, row: row, object: object });
    }
  });

  if (idMatches.length !== 1 || txMatches.length !== 1 ||
      idMatches[0].sheetRow !== txMatches[0].sheetRow) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit stable identity ไม่ชี้ไปยัง row เดียวแบบ unique', {
      auditId: expected.auditId,
      transactionId: expected.transactionId,
      auditIdMatchCount: idMatches.length,
      transactionIdMatchCount: txMatches.length
    });
  }

  const entry = idMatches[0];
  const object = entry.object;
  if (expected.entityId && mgmtNormalizeText_(object.entity_id) !== expected.entityId) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit entity_id ไม่ตรง stable identity', {
      auditId: expected.auditId
    });
  }
  if (expected.action && mgmtNormalizeUpper_(object.action) !== expected.action) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit action ไม่ตรง stable identity', {
      auditId: expected.auditId
    });
  }
  if (expected.sheetName && mgmtNormalizeText_(object.sheet_name) !== expected.sheetName) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit sheet_name ไม่ตรง stable identity', {
      auditId: expected.auditId
    });
  }

  return entry;
}

function mgmtMutationSetAuditStateLocked_(auditTable, identity, status, committedAt, errorCode) {
  const transition = mgmtMutationAuditTransitionRange_(auditTable);
  const normalizedStatus = mgmtNormalizeUpper_(status);

  if ([
    MGMT_MUTATION.AUDIT.COMMITTED,
    MGMT_MUTATION.AUDIT.FAILED
  ].indexOf(normalizedStatus) < 0) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'audit transition target ไม่อยู่ในสัญญาที่รองรับ');
  }

  // Never trust a stored row number. Refresh and resolve by audit_id + transaction_id.
  let fresh = mgmtMutationRefreshAuditTableLocked_(auditTable);
  let entry = mgmtMutationFindAuditEntryByIdentityLocked_(fresh, identity);

  // Re-read the exact row immediately before the Q:S transition. If a human sort/edit
  // moved a different audit into this coordinate, fail closed instead of mutating it.
  const exactRow = fresh.sheet
    .getRange(entry.sheetRow, 1, 1, fresh.headers.length)
    .getValues()[0];
  const exactObject = mgmtRowObject_(fresh.headers, exactRow);
  const exactIdentity = mgmtMutationAuditIdentityFromObject_(exactObject);
  const expectedIdentity = mgmtMutationAuditIdentityFromObject_(identity);

  if (exactIdentity.auditId !== expectedIdentity.auditId ||
      exactIdentity.transactionId !== expectedIdentity.transactionId) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit row moved during transition precheck', {
      auditId: expectedIdentity.auditId,
      transactionId: expectedIdentity.transactionId
    });
  }

  if (mgmtNormalizeUpper_(exactObject.audit_status) !== MGMT_MUTATION.AUDIT.PREPARED ||
      !mgmtMutationIsBlank_(exactObject.committed_at) ||
      !mgmtMutationIsBlank_(exactObject.error_code)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'อนุญาตเฉพาะ PREPARED → COMMITTED/FAILED', {
      auditId: expectedIdentity.auditId,
      currentStatus: mgmtNormalizeUpper_(exactObject.audit_status)
    });
  }

  const committedValue = normalizedStatus === MGMT_MUTATION.AUDIT.COMMITTED
    ? (committedAt || new Date())
    : '';
  const errorValue = normalizedStatus === MGMT_MUTATION.AUDIT.FAILED
    ? (mgmtNormalizeText_(errorCode) || 'MUTATION_FAILED')
    : '';

  let transitionWriteError = null;
  try {
    fresh.sheet
      .getRange(entry.sheetRow, transition.startColumn, 1, transition.width)
      .setValues([[normalizedStatus, committedValue, errorValue]]);

    SpreadsheetApp.flush();
  } catch (error) {
    transitionWriteError = error;
  }

  // Whether the write returned normally or threw ambiguously, re-locate by stable
  // identity and decide from persisted state. Never infer commit outcome from the RPC.
  fresh = mgmtMutationRefreshAuditTableLocked_(fresh);
  entry = mgmtMutationFindAuditEntryByIdentityLocked_(fresh, identity);
  const persistedObject = entry.object;
  const persistedStatus = mgmtNormalizeUpper_(persistedObject.audit_status);

  if (persistedStatus !== normalizedStatus) {
    if (transitionWriteError &&
        persistedStatus === MGMT_MUTATION.AUDIT.PREPARED &&
        mgmtMutationIsBlank_(persistedObject.committed_at) &&
        mgmtMutationIsBlank_(persistedObject.error_code)) {
      if (normalizedStatus === MGMT_MUTATION.AUDIT.COMMITTED) {
        throw mgmtError_('AUDIT_COMMIT_FAILED', 'Audit transition ยังเป็น PREPARED หลังผลการเขียนไม่แน่นอน');
      }
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit FAILED transition ยังไม่ยืนยันหลังผลการเขียนไม่แน่นอน');
    }
    throw mgmtError_(
      normalizedStatus === MGMT_MUTATION.AUDIT.COMMITTED ? 'AUDIT_COMMIT_FAILED' : 'DATA_INTEGRITY_CONFLICT',
      'ยืนยันสถานะ Audit ไม่สำเร็จ',
      {
        expectedStatus: normalizedStatus,
        persistedStatus: persistedStatus
      }
    );
  }
  if (normalizedStatus === MGMT_MUTATION.AUDIT.COMMITTED && mgmtMutationIsBlank_(persistedObject.committed_at)) {
    throw mgmtError_('AUDIT_COMMIT_FAILED', 'Audit COMMITTED ไม่มี committed_at');
  }
  if (normalizedStatus !== MGMT_MUTATION.AUDIT.COMMITTED && !mgmtMutationIsBlank_(persistedObject.committed_at)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'audit committed_at ไม่สอดคล้องกับสถานะ');
  }
  if (normalizedStatus === MGMT_MUTATION.AUDIT.COMMITTED && !mgmtMutationIsBlank_(persistedObject.error_code)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit COMMITTED ต้องไม่มี error_code');
  }
  if (normalizedStatus === MGMT_MUTATION.AUDIT.FAILED && mgmtMutationIsBlank_(persistedObject.error_code)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit FAILED ไม่มี error_code');
  }

  return true;
}

function mgmtMutationValidateRelevantAuditState_(item) {
  const object = item.object;
  const status = mgmtNormalizeUpper_(object.audit_status);
  const committedAtBlank = mgmtMutationIsBlank_(object.committed_at);
  const errorBlank = mgmtMutationIsBlank_(object.error_code);

  if (status === MGMT_MUTATION.AUDIT.PREPARED) {
    if (!committedAtBlank || !errorBlank) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit มี committed_at ผิดสัญญา', {
        auditId: mgmtNormalizeText_(object.audit_id)
      });
    }
    return;
  }

  if (status === MGMT_MUTATION.AUDIT.COMMITTED) {
    if (committedAtBlank || !errorBlank) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'COMMITTED audit มี transition fields ผิดสัญญา', {
        auditId: mgmtNormalizeText_(object.audit_id)
      });
    }
    return;
  }

  if (status === MGMT_MUTATION.AUDIT.FAILED) {
    if (!committedAtBlank || errorBlank) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'FAILED audit มี transition fields ผิดสัญญา', {
        auditId: mgmtNormalizeText_(object.audit_id)
      });
    }
    return;
  }

  throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'audit_status ไม่อยู่ในสัญญา', {
    auditId: mgmtNormalizeText_(object.audit_id),
    auditStatus: status
  });
}

function mgmtMutationRelevantUpdateAudits_(auditTable, entityId) {
  const result = [];
  const auditIds = {};
  const transactionIds = {};

  auditTable.rows.forEach(function(row, offset) {
    const object = mgmtRowObject_(auditTable.headers, row);
    if (mgmtNormalizeUpper_(object.entity_type) !== MGMT_MUTATION.ENTITY_TYPE) return;
    if (mgmtNormalizeText_(object.entity_id) !== entityId) return;
    if (mgmtNormalizeUpper_(object.action) !== MGMT_MUTATION.ACTION_UPDATE) return;

    const auditId = mgmtNormalizeText_(object.audit_id);
    const transactionId = mgmtNormalizeText_(object.transaction_id);
    if (!auditId || !transactionId) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit ของ entity นี้ไม่มี stable ID ครบถ้วน', {
        entityId: entityId,
        sheetRow: offset + 2
      });
    }
    if (auditIds[auditId] || transactionIds[transactionId]) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit ของ entity นี้มี ID ซ้ำ', {
        entityId: entityId,
        auditId: auditId,
        transactionId: transactionId
      });
    }
    auditIds[auditId] = true;
    transactionIds[transactionId] = true;

    const item = {
      sheetRow: offset + 2,
      row: row,
      object: object
    };
    mgmtMutationValidateRelevantAuditState_(item);
    result.push(item);
  });

  return result;
}

function mgmtMutationParseAuditSnapshot_(text, field, sheetRow) {
  const raw = mgmtNormalizeText_(text);
  if (!raw) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบ PREPARED audit ที่ไม่มี snapshot', {
      field: field,
      sheetRow: sheetRow
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบ PREPARED audit snapshot ที่อ่านไม่ได้', {
      field: field,
      sheetRow: sheetRow
    });
  }
  return parsed;
}

function mgmtMutationAuditTimestampMs_(value, auditId) {
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  if (!isFinite(time)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'Audit timestamp ไม่ถูกต้อง', {
      auditId: mgmtNormalizeText_(auditId)
    });
  }
  return time;
}

function mgmtMutationValidatePreparedUpdateSnapshots_(item, before, after) {
  if (!before || typeof before !== 'object' || Array.isArray(before) ||
      !after || typeof after !== 'object' || Array.isArray(after)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit snapshot ต้องเป็น full object', {
      auditId: mgmtNormalizeText_(item.object.audit_id)
    });
  }

  const expectedHeaders = MGMT_DATA.HEADERS.SYSTEMS.slice();
  const expectedSorted = expectedHeaders.slice().sort();
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  if (mgmtCanonicalJson_(beforeKeys) !== mgmtCanonicalJson_(expectedSorted) ||
      mgmtCanonicalJson_(afterKeys) !== mgmtCanonicalJson_(expectedSorted)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit snapshot ไม่ครบ schema water_systems', {
      auditId: mgmtNormalizeText_(item.object.audit_id)
    });
  }

  const entityId = mgmtNormalizeText_(item.object.entity_id);
  if (mgmtNormalizeText_(before.system_id) !== entityId ||
      mgmtNormalizeText_(after.system_id) !== entityId) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit snapshot system_id ไม่ตรง entity_id', {
      auditId: mgmtNormalizeText_(item.object.audit_id),
      entityId: entityId
    });
  }

  ['system_id','village_id','source_excel_row','system_no','created_at'].forEach(function(field) {
    if (mgmtCanonicalJson_(before[field]) !== mgmtCanonicalJson_(after[field])) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit เปลี่ยน immutable identity field', {
        auditId: mgmtNormalizeText_(item.object.audit_id),
        field: field
      });
    }
  });

  let declared;
  try {
    declared = JSON.parse(mgmtNormalizeText_(item.object.changed_fields_json));
  } catch (error) {
    declared = null;
  }
  if (!Array.isArray(declared) || declared.some(function(field) { return typeof field !== 'string'; })) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit changed_fields_json ไม่ถูกต้อง', {
      auditId: mgmtNormalizeText_(item.object.audit_id)
    });
  }

  const seen = {};
  declared.forEach(function(field) {
    if (seen[field]) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit changed_fields_json มี field ซ้ำ', {
        auditId: mgmtNormalizeText_(item.object.audit_id),
        field: field
      });
    }
    seen[field] = true;
  });

  const actual = [];
  expectedHeaders.forEach(function(field) {
    if (field === 'updated_at') return;
    if (mgmtCanonicalJson_(before[field]) !== mgmtCanonicalJson_(after[field])) {
      actual.push(field);
    }
  });

  if (mgmtCanonicalJson_(declared) !== mgmtCanonicalJson_(actual)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit changed_fields_json ไม่ตรง before/after', {
      auditId: mgmtNormalizeText_(item.object.audit_id)
    });
  }

  if (actual.length === 0) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit ไม่มี business field ที่เปลี่ยน', {
      auditId: mgmtNormalizeText_(item.object.audit_id)
    });
  }

  return true;
}

function mgmtMutationReadRecoveryCandidateLocked_(ss, entityId, expectedIdentity, expectedTimestampMs) {
  const auditTable = mgmtMutationReadAuditTable_(ss);
  const relevant = mgmtMutationRelevantUpdateAudits_(auditTable, entityId);
  const pending = relevant.filter(function(item) {
    return mgmtNormalizeUpper_(item.object.audit_status) === MGMT_MUTATION.AUDIT.PREPARED;
  });

  if (pending.length === 0) {
    if (expectedIdentity) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit เปลี่ยนสถานะหรือหายไประหว่าง recovery', {
        entityId: entityId,
        auditId: mgmtNormalizeText_(expectedIdentity.auditId || expectedIdentity.audit_id)
      });
    }
    return null;
  }

  if (pending.length > 1) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'พบ PREPARED audit มากกว่า 1 รายการสำหรับ entity เดียวกัน', {
      entityId: entityId,
      count: pending.length
    });
  }

  const item = pending[0];
  const identity = mgmtMutationAuditIdentityFromObject_(item.object);
  if (expectedIdentity) {
    const expected = mgmtMutationAuditIdentityFromObject_(expectedIdentity);
    if (identity.auditId !== expected.auditId ||
        identity.transactionId !== expected.transactionId ||
        identity.entityId !== expected.entityId ||
        identity.action !== expected.action ||
        identity.sheetName !== expected.sheetName) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit identity เปลี่ยนระหว่าง recovery', {
        entityId: entityId,
        expectedAuditId: expected.auditId,
        actualAuditId: identity.auditId
      });
    }
  }

  const itemTime = mgmtMutationAuditTimestampMs_(item.object.timestamp, item.object.audit_id);
  if (expectedTimestampMs !== undefined && expectedTimestampMs !== null && itemTime !== expectedTimestampMs) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit timestamp เปลี่ยนระหว่าง recovery', {
      entityId: entityId,
      auditId: identity.auditId
    });
  }

  let sameTimestampCount = 0;
  let laterAuditCount = 0;
  relevant.forEach(function(candidate) {
    if (candidate === item) return;
    const candidateTime = mgmtMutationAuditTimestampMs_(candidate.object.timestamp, candidate.object.audit_id);
    if (candidateTime === itemTime) sameTimestampCount += 1;
    if (candidateTime > itemTime) laterAuditCount += 1;
  });

  if (sameTimestampCount > 0) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่สามารถจัดลำดับ audit ที่ timestamp เท่ากันได้อย่างปลอดภัย', {
      auditId: identity.auditId,
      entityId: entityId,
      sameTimestampCount: sameTimestampCount
    });
  }
  if (laterAuditCount > 0) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ไม่สามารถ resolve PREPARED audit ที่มี mutation audit อยู่ภายหลังได้', {
      auditId: identity.auditId,
      entityId: entityId,
      laterAuditCount: laterAuditCount
    });
  }

  const before = mgmtMutationParseAuditSnapshot_(item.object.before_json, 'before_json', item.sheetRow);
  const after = mgmtMutationParseAuditSnapshot_(item.object.after_json, 'after_json', item.sheetRow);
  mgmtMutationValidatePreparedUpdateSnapshots_(item, before, after);

  return {
    auditTable: auditTable,
    item: item,
    identity: identity,
    timestampMs: itemTime,
    before: before,
    after: after
  };
}

function mgmtMutationClassifyPreparedRecoveryLocked_(ss, entityId, before, after) {
  // Recovery changes audit state, but it still depends on an exact persisted
  // water_systems image. A formula-bearing row is out-of-contract and must not be
  // used to auto-resolve PREPARED based only on its current calculated values.
  const target = mgmtMutationReadSystemTargetLocked_(ss, entityId);
  mgmtMutationAssertTargetRowHasNoFormulas_(
    target.systemsTable,
    target.systemEntry.sheetRow,
    entityId
  );

  const currentCanonical = mgmtCanonicalJson_(mgmtSanitizeForAudit_(target.systemEntry.object));
  const beforeCanonical = mgmtCanonicalJson_(before);
  const afterCanonical = mgmtCanonicalJson_(after);

  if (currentCanonical === afterCanonical) return MGMT_MUTATION.AUDIT.COMMITTED;
  if (currentCanonical === beforeCanonical) return MGMT_MUTATION.AUDIT.FAILED;

  throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit มี persisted state ที่ไม่ตรง before/after', {
    auditId: '',
    entityId: entityId
  });
}

function mgmtMutationResolvePendingAuditsLocked_(ss, systemEntry) {
  const entityId = mgmtNormalizeText_(systemEntry.object.system_id);

  // First pass establishes the only candidate and validates chronology/snapshots.
  const candidate = mgmtMutationReadRecoveryCandidateLocked_(ss, entityId, null, null);
  if (!candidate) return { resolved: 0, auditId: '' };

  const firstResolution = mgmtMutationClassifyPreparedRecoveryLocked_(
    ss,
    entityId,
    candidate.before,
    candidate.after
  );

  // Direct Sheet edits bypass ScriptLock. Re-read the audit chronology and snapshots
  // immediately before transition, then classify the system a second time. Any drift
  // across these two late reads is ambiguous and leaves PREPARED untouched.
  const finalCandidate = mgmtMutationReadRecoveryCandidateLocked_(
    ss,
    entityId,
    candidate.identity,
    candidate.timestampMs
  );

  if (mgmtCanonicalJson_(finalCandidate.before) !== mgmtCanonicalJson_(candidate.before) ||
      mgmtCanonicalJson_(finalCandidate.after) !== mgmtCanonicalJson_(candidate.after) ||
      mgmtCanonicalJson_(finalCandidate.item.object.changed_fields_json) !==
        mgmtCanonicalJson_(candidate.item.object.changed_fields_json)) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'PREPARED audit snapshot เปลี่ยนระหว่าง recovery', {
      auditId: candidate.identity.auditId,
      entityId: entityId
    });
  }

  const finalResolution = mgmtMutationClassifyPreparedRecoveryLocked_(
    ss,
    entityId,
    finalCandidate.before,
    finalCandidate.after
  );

  if (finalResolution !== firstResolution) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'persisted state เปลี่ยนระหว่าง PREPARED recovery', {
      auditId: candidate.identity.auditId,
      entityId: entityId
    });
  }

  if (finalResolution === MGMT_MUTATION.AUDIT.COMMITTED) {
    mgmtMutationSetAuditStateLocked_(
      finalCandidate.auditTable,
      finalCandidate.identity,
      MGMT_MUTATION.AUDIT.COMMITTED,
      new Date(),
      ''
    );
    return {
      resolved: 1,
      auditId: finalCandidate.identity.auditId,
      resolvedAs: MGMT_MUTATION.AUDIT.COMMITTED
    };
  }

  mgmtMutationSetAuditStateLocked_(
    finalCandidate.auditTable,
    finalCandidate.identity,
    MGMT_MUTATION.AUDIT.FAILED,
    '',
    'RECOVERED_NO_MUTATION'
  );
  return {
    resolved: 1,
    auditId: finalCandidate.identity.auditId,
    resolvedAs: MGMT_MUTATION.AUDIT.FAILED
  };
}

function mgmtMutationAppendPreparedAuditLocked_(ss, context, before, after, changedFields, reason, now, clientInfo) {
  const table = mgmtMutationReadAuditTable_(ss);
  const auditId = mgmtMutationNewAuditId_();
  const transactionId = mgmtMutationNewTransactionId_();

  const object = {
    audit_id: auditId,
    transaction_id: transactionId,
    timestamp: now,
    user_id: mgmtNormalizeText_(context.userId),
    username_snapshot: mgmtNormalizeText_(context.username),
    role_snapshot: mgmtNormalizeUpper_(context.role),
    action: MGMT_MUTATION.ACTION_UPDATE,
    entity_type: MGMT_MUTATION.ENTITY_TYPE,
    entity_id: mgmtNormalizeText_(before.system_id),
    sheet_name: MGMT_DATA.SHEETS.SYSTEMS,
    before_json: mgmtCanonicalJson_(mgmtSanitizeForAudit_(before)),
    after_json: mgmtCanonicalJson_(mgmtSanitizeForAudit_(after)),
    changed_fields_json: JSON.stringify(changedFields),
    reason: mgmtMutationText_(reason),
    rollback_of_audit_id: '',
    client_info: mgmtClientInfo_(clientInfo || ''),
    audit_status: MGMT_MUTATION.AUDIT.PREPARED,
    committed_at: '',
    error_code: ''
  };

  const identity = mgmtMutationAuditIdentityFromObject_(object);
  const row = table.headers.map(function(header) {
    return mgmtMutationHasOwn_(object, header) ? object[header] : '';
  });

  const sheetRowHint = table.sheet.getLastRow() + 1;

  try {
    table.sheet.getRange(sheetRowHint, 1, 1, table.headers.length).setValues([row]);
    SpreadsheetApp.flush();

    // A human sort can move the appended row. Verify by stable identity, not row hint.
    const fresh = mgmtMutationRefreshAuditTableLocked_(table);
    const entry = mgmtMutationFindAuditEntryByIdentityLocked_(fresh, identity);
    const persistedObject = entry.object;

    if (mgmtNormalizeUpper_(persistedObject.audit_status) !== MGMT_MUTATION.AUDIT.PREPARED ||
        !mgmtMutationIsBlank_(persistedObject.committed_at) ||
        !mgmtMutationIsBlank_(persistedObject.error_code) ||
        mgmtNormalizeText_(persistedObject.entity_id) !== identity.entityId ||
        mgmtNormalizeUpper_(persistedObject.action) !== identity.action) {
      throw new Error('PREPARED_AUDIT_VERIFY_FAILED');
    }

    return {
      auditId: auditId,
      transactionId: transactionId,
      entityId: identity.entityId,
      action: identity.action,
      sheetName: identity.sheetName,
      sheetRow: entry.sheetRow
    };
  } catch (error) {
    // The append may have reached Sheets even if the RPC/flush failed. Do not
    // delete or rewrite audit history here; deterministic PREPARED recovery owns it.
    throw mgmtError_('AUDIT_PREPARE_FAILED', 'ไม่สามารถเตรียม Audit ก่อนบันทึกได้');
  }
}

function mgmtMutationMarkAuditCommittedLocked_(ss, prepared, now) {
  const table = mgmtMutationReadAuditTable_(ss);
  try {
    mgmtMutationSetAuditStateLocked_(
      table,
      prepared,
      MGMT_MUTATION.AUDIT.COMMITTED,
      now,
      ''
    );
  } catch (error) {
    if (error && error.mgmtCode === 'AUDIT_COMMIT_FAILED') throw error;
    throw mgmtError_('AUDIT_COMMIT_FAILED', 'บันทึกข้อมูลแล้วแต่ยังยืนยัน Audit commit ไม่ได้');
  }
}

function mgmtMutationMarkAuditFailedBestEffortLocked_(ss, prepared, errorCode) {
  if (!prepared || !prepared.auditId || !prepared.transactionId) return false;
  try {
    const table = mgmtMutationReadAuditTable_(ss);
    mgmtMutationSetAuditStateLocked_(
      table,
      prepared,
      MGMT_MUTATION.AUDIT.FAILED,
      '',
      errorCode || 'MUTATION_FAILED'
    );
    return true;
  } catch (ignore) {
    return false;
  }
}

// ============================================================================
// Mutation execution
// ============================================================================

function mgmtMutationReadSystemTargetLocked_(ss, systemId) {
  const systemsTable = mgmtDataReadExactTable_(
    ss,
    MGMT_DATA.SHEETS.SYSTEMS,
    MGMT_DATA.HEADERS.SYSTEMS
  );
  const systemEntry = mgmtMutationFindSystemEntryLocked_(systemsTable, systemId);
  return {
    systemsTable: systemsTable,
    systemEntry: systemEntry,
    version: mgmtRecordVersion_(systemsTable.headers, systemEntry.row)
  };
}

function mgmtMutationFinalPrewriteRecheckLocked_(ss, systemId, expectedBeforeVersion) {
  // ScriptLock protects Feature 3/Management in this Apps Script project, but it
  // cannot prevent a human from editing/sorting the Sheet directly. Re-check all
  // mutable gates immediately before setValues and resolve the current row by ID.
  mgmtAssertProcessorMutationReady_(ss, systemId);

  const target = mgmtMutationReadSystemTargetLocked_(ss, systemId);
  mgmtMutationAssertTargetRowHasNoFormulas_(
    target.systemsTable,
    target.systemEntry.sheetRow,
    systemId
  );

  if (!mgmtSecureStringEquals_(target.version, expectedBeforeVersion)) {
    throw mgmtError_('CONFLICT', 'ข้อมูลถูกแก้ไขระหว่างเตรียมการบันทึก กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก', {
      systemId: systemId
    });
  }

  return target;
}

function mgmtMutationVerifyPersistedByIdentityLocked_(ss, systemId, intendedRow) {
  const target = mgmtMutationReadSystemTargetLocked_(ss, systemId);
  mgmtMutationAssertTargetRowHasNoFormulas_(
    target.systemsTable,
    target.systemEntry.sheetRow,
    systemId
  );

  const intendedVersion = mgmtRecordVersion_(target.systemsTable.headers, intendedRow);
  if (!mgmtSecureStringEquals_(target.version, intendedVersion)) {
    throw mgmtError_('MUTATION_FAILED', 'ตรวจสอบข้อมูลหลังบันทึกไม่ผ่าน');
  }

  return target;
}

function mgmtMutationEnsureBeforeStateLocked_(ss, systemId, beforeRow, intendedRow) {
  // Compensation must never trust the old row coordinate. It may have moved due
  // to a direct Sheet sort. Restore only if current state is exactly our intended
  // after-image; if a third state exists, fail closed to avoid overwriting a human edit.
  try {
    let target = mgmtMutationReadSystemTargetLocked_(ss, systemId);
    const beforeVersion = mgmtRecordVersion_(target.systemsTable.headers, beforeRow);
    const intendedVersion = mgmtRecordVersion_(target.systemsTable.headers, intendedRow);

    try {
      mgmtMutationAssertTargetRowHasNoFormulas_(
        target.systemsTable,
        target.systemEntry.sheetRow,
        systemId
      );
    } catch (formulaError) {
      return false;
    }

    if (mgmtSecureStringEquals_(target.version, beforeVersion)) {
      return true;
    }

    if (!mgmtSecureStringEquals_(target.version, intendedVersion)) {
      return false;
    }

    let restoreWriteError = null;
    try {
      target.systemsTable.sheet
        .getRange(target.systemEntry.sheetRow, 1, 1, target.systemsTable.headers.length)
        .setValues([beforeRow]);

      SpreadsheetApp.flush();
    } catch (error) {
      restoreWriteError = error;
    }

    // Compensation outcome is decided by stable-ID read-back even when setValues/flush
    // returned ambiguously. If the exact before image is present, compensation succeeded.
    try {
      target = mgmtMutationReadSystemTargetLocked_(ss, systemId);
      mgmtMutationAssertTargetRowHasNoFormulas_(
        target.systemsTable,
        target.systemEntry.sheetRow,
        systemId
      );
    } catch (readbackError) {
      return false;
    }

    if (mgmtSecureStringEquals_(target.version, beforeVersion)) {
      return true;
    }

    // A write error plus an intended/third state is still unresolved. Never retry a
    // blind restore because an out-of-band human edit may now own the row.
    if (restoreWriteError) return false;
    return false;
  } catch (ignoreRestore) {
    return false;
  }
}

function mgmtMutationValidateRequest_(request) {
  const allowedRequestKeys = {
    systemId: true,
    expectedVersion: true,
    patch: true,
    reason: true,
    clientInfo: true
  };

  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw mgmtError_('VALIDATION_FAILED', 'รูปแบบคำขอแก้ไขไม่ถูกต้อง');
  }

  Object.keys(request).forEach(function(key) {
    if (!allowedRequestKeys[key]) {
      throw mgmtError_('VALIDATION_FAILED', 'พบ field ที่ request ไม่รองรับ', {
        field: key
      });
    }
  });

  const systemId = mgmtNormalizeText_(request.systemId);
  const expectedVersion = mgmtNormalizeText_(request.expectedVersion);

  if (!systemId) {
    throw mgmtError_('VALIDATION_FAILED', 'กรุณาระบุ systemId');
  }
  if (!expectedVersion || !/^[0-9a-f]{64}$/.test(expectedVersion)) {
    throw mgmtError_('VALIDATION_FAILED', 'expectedVersion ไม่ถูกต้อง', {
      field: 'expectedVersion'
    });
  }

  mgmtMutationNormalizePatchObject_(request.patch);

  return {
    systemId: systemId,
    expectedVersion: expectedVersion,
    patch: request.patch,
    reason: mgmtMutationText_(request.reason),
    clientInfo: mgmtClientInfo_(request.clientInfo || '')
  };
}

function mgmtMutationInternalUpdateLocked_(ss, context, request, options) {
  const opts = options || {};
  const now = opts.now instanceof Date ? opts.now : new Date();
  const parsed = mgmtMutationValidateRequest_(request);

  mgmtAssertPermission_(context, MGMT_PERMISSION.UPDATE_SYSTEM);
  mgmtAssertDistrictAssignment_(context);
  if (opts.skipTimezoneCheck !== true) mgmtAssertTimezone_();

  // Full read snapshot gives exact system/village/raw-guard state.
  let snapshot = mgmtDataBuildSnapshotLocked_(ss, { includeSources: false });
  let systemEntry = snapshot.systemIndex[parsed.systemId];

  if (!systemEntry) {
    throw mgmtError_('NOT_FOUND', 'ไม่พบระบบประปาที่ต้องการแก้ไข');
  }
  mgmtAssertDistrictAccess_(context, snapshot.villageIndex[mgmtNormalizeText_(systemEntry.object.village_id)].object.district);

  // Required order: existence -> Processor guard -> recovery -> re-read -> version.
  mgmtAssertProcessorMutationReady_(ss, parsed.systemId);

  const recovery = mgmtMutationResolvePendingAuditsLocked_(ss, systemEntry);

  // Re-read after any recovery transition. Audit-only changes do not alter row version,
  // but re-read avoids acting on stale table handles and keeps the flow explicit.
  snapshot = mgmtDataBuildSnapshotLocked_(ss, { includeSources: false });
  const snapshotSystemsTable = snapshot.systemsTable;
  systemEntry = snapshot.systemIndex[parsed.systemId];
  if (!systemEntry) {
    throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ระบบประปาหายไประหว่าง recovery/re-read', {
      systemId: parsed.systemId
    });
  }
  mgmtAssertDistrictAccess_(context, snapshot.villageIndex[mgmtNormalizeText_(systemEntry.object.village_id)].object.district);

  // First formula/version gate occurs before validation/audit. A second, later gate
  // is mandatory immediately before the actual write.
  mgmtMutationAssertTargetRowHasNoFormulas_(
    snapshotSystemsTable,
    systemEntry.sheetRow,
    parsed.systemId
  );

  const currentVersion = mgmtRecordVersion_(snapshotSystemsTable.headers, systemEntry.row);
  if (!mgmtSecureStringEquals_(currentVersion, parsed.expectedVersion)) {
    throw mgmtError_('CONFLICT', 'ข้อมูลถูกแก้ไขหลังจากที่คุณเปิดรายการนี้ กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก', {
      systemId: parsed.systemId
    });
  }

  const built = mgmtMutationBuildIntendedObject_(
    systemEntry.object,
    parsed.patch,
    snapshot,
    now
  );
  const intendedObject = built.intendedObject;
  const changedFields = mgmtMutationChangedFields_(systemEntry.object, intendedObject);

  if (changedFields.length === 0) {
    throw mgmtError_('VALIDATION_FAILED', 'ไม่มีข้อมูลที่เปลี่ยนแปลง');
  }

  const beforeRow = systemEntry.row.slice();
  const beforeObject = mgmtRowObject_(snapshotSystemsTable.headers, beforeRow);
  const intendedRow = mgmtMutationObjectToRow_(snapshotSystemsTable.headers, intendedObject);

  const prepared = mgmtMutationAppendPreparedAuditLocked_(
    ss,
    context,
    beforeObject,
    intendedObject,
    changedFields,
    parsed.reason,
    now,
    parsed.clientInfo
  );

  let mutationAttempted = false;

  try {
    // Final pre-write recheck: locate by system_id again, re-check identity/raw guard,
    // formulas and the frozen before-version after PREPARED has been persisted.
    const writeTarget = mgmtMutationFinalPrewriteRecheckLocked_(
      ss,
      parsed.systemId,
      currentVersion
    );
    mgmtOpsAssertSystemDistrictLocked_(ss, context, writeTarget.systemEntry.object);

    mutationAttempted = true;
    writeTarget.systemsTable.sheet
      .getRange(
        writeTarget.systemEntry.sheetRow,
        1,
        1,
        writeTarget.systemsTable.headers.length
      )
      .setValues([intendedRow]);

    SpreadsheetApp.flush();

    // Verify by stable system_id, never by the old row coordinate. This also
    // survives a direct Sheet sort that moves the row after setValues.
    mgmtMutationVerifyPersistedByIdentityLocked_(
      ss,
      parsed.systemId,
      intendedRow
    );

    // Re-check logical mutation eligibility before preparing the success payload.
    // Any read/projection failure at this point is still pre-COMMITTED, so the catch
    // path can compensate the row and mark the audit FAILED instead of returning a
    // client-visible failure after a committed business transaction.
      mgmtAssertProcessorMutationReady_(ss, parsed.systemId);

    const responseSnapshot = mgmtDataBuildSnapshotLocked_(ss, { includeSources: false });
    const updatedEntry = responseSnapshot.systemIndex[parsed.systemId];
    if (!updatedEntry) {
      throw mgmtError_('DATA_INTEGRITY_CONFLICT', 'ระบบประปาหายไประหว่างเตรียมผลลัพธ์ก่อน COMMITTED', {
        systemId: parsed.systemId
      });
    }
    const villageId = mgmtNormalizeText_(updatedEntry.object.village_id);
    const record = mgmtDataBuildSystemRecord_(
      updatedEntry,
      responseSnapshot.villageIndex[villageId],
      responseSnapshot.projection,
      responseSnapshot.processorIndex
    );
    const intendedVersion = mgmtRecordVersion_(responseSnapshot.systemsTable.headers, intendedRow);
    if (!mgmtSecureStringEquals_(mgmtNormalizeText_(record.recordVersion), intendedVersion)) {
      throw mgmtError_('MUTATION_FAILED', 'ข้อมูลเปลี่ยนระหว่างเตรียมผลลัพธ์ก่อน COMMITTED');
    }

    // Repeat processor eligibility and stable-ID state immediately before COMMITTED because
    // building the response projection reads multiple sheets and may take time.
      mgmtAssertProcessorMutationReady_(ss, parsed.systemId);
    mgmtMutationVerifyPersistedByIdentityLocked_(
      ss,
      parsed.systemId,
      intendedRow
    );

    mgmtMutationMarkAuditCommittedLocked_(
      ss,
      prepared,
      opts.commitNow instanceof Date ? opts.commitNow : new Date()
    );

    // No fallible spreadsheet read occurs after COMMITTED. The payload was frozen
    // from the verified intended state immediately before the audit transition.
    return {
      system: record,
      auditId: prepared.auditId,
      transactionId: prepared.transactionId,
      changedFields: changedFields,
      recoveredPendingAudit: recovery
    };

  } catch (error) {
    if (error && error.mgmtCode === 'AUDIT_COMMIT_FAILED') {
      // Row may already match intended after-state. PREPARED is intentionally retained
      // for deterministic recovery on the next mutation of this entity.
      throw error;
    }

    let restored = true;
    if (mutationAttempted) {
      restored = mgmtMutationEnsureBeforeStateLocked_(
        ss,
        parsed.systemId,
        beforeRow,
        intendedRow
      );
    }

    mgmtMutationMarkAuditFailedBestEffortLocked_(
      ss,
      prepared,
      restored ? (error && error.mgmtCode ? error.mgmtCode : 'MUTATION_FAILED') : 'COMPENSATION_FAILED'
    );

    if (!restored) {
      throw mgmtError_('MUTATION_FAILED', 'บันทึกไม่สำเร็จและไม่สามารถยืนยันการคืนค่าข้อมูลเดิมได้');
    }

    if (error && error.mgmtCode) throw error;
    throw mgmtError_('MUTATION_FAILED', 'ไม่สามารถบันทึกการแก้ไขได้');
  }
}

// ============================================================================
// Post-commit session activity
// ============================================================================

function mgmtMutationTouchSessionAfterCommittedBestEffort_(ss, rawToken, requestId) {
  try {
    mgmtDataTouchSessionAfterSuccessLocked_(ss, rawToken, new Date());
    return true;
  } catch (error) {
    // The water-system transaction is already COMMITTED at this point.
    // Never convert a committed business mutation into a client-visible failure
    // merely because the secondary session-activity write could not be confirmed.
    // The next authenticated request will re-check expiry/revocation normally.
    mgmtLogSafeFailure_('UPDATE_WATER_SYSTEM_SESSION_TOUCH', requestId, error);
    return false;
  }
}

// ============================================================================
// Production facade
// ============================================================================

function mgmtUpdateWaterSystem(token, request) {
  const requestId = mgmtNewRequestId_();
  let lock = null;

  try {
    lock = mgmtAcquireScriptLock_();
    const ss = mgmtOpenSpreadsheet_();

    const verified = mgmtVerifySessionLocked_(ss, token, {
      requestId: requestId,
      touch: false,
      allowPasswordChangeRequired: false,
      permission: MGMT_PERMISSION.UPDATE_SYSTEM
    });

    const data = mgmtMutationInternalUpdateLocked_(
      ss,
      verified.context,
      request,
      {}
    );

    mgmtMutationTouchSessionAfterCommittedBestEffort_(ss, token, requestId);
    return mgmtSuccess_(data, requestId);

  } catch (error) {
    mgmtLogSafeFailure_('UPDATE_WATER_SYSTEM', requestId, error);
    return mgmtFailureFromException_(error, requestId);
  } finally {
    mgmtReleaseScriptLock_(lock);
  }
}
