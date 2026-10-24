// One-time deployment packaging of the exact LOCAL Candidate management function.
// Business logic and SQL contracts unchanged; module boundaries flattened because --use-api uploads only index.ts.
import {createHash} from 'node:crypto';
const __nodeCrypto = {createHash};
// Bundled unchanged module: backend/shared/security.mjs
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

return {fail:fail,sha:sha,stable:stable,requestHash:requestHash,seal:seal,open:open,jwtClaims:jwtClaims,password:password,knownError:knownError};
})();

// Bundled unchanged module: backend/shared/supabase.mjs
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

return {supabase:supabase};
})();

// Bundled unchanged module: backend/shared/canonical.mjs
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



return {MGMT_MUTATION:MGMT_MUTATION,MGMT_DATA:MGMT_DATA,buildIntended:mgmtMutationBuildIntendedObject_,changedFields:mgmtMutationChangedFields_};
})();

// Bundled unchanged module: backend/shared/public-fields.mjs
const __public_fields = (() => {

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

return {validateSourceInput:validateSourceInput,projectPublicDataset:projectPublicDataset,PUBLIC_FIELDS:PUBLIC_FIELDS,PUBLIC_PROJECTION_POLICY_REVISION:PUBLIC_PROJECTION_POLICY_REVISION};
})();

// Bundled unchanged module: backend/shared/processor-source.mjs
const __processor_source = (() => {
const {createHash} = __nodeCrypto;
const Utilities={DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,v)=>[...createHash('sha256').update(v,'utf8').digest()],getUuid:()=>crypto.randomUUID()};
const Logger={log(){}};
const PLUMBING_CONFIG = Object.freeze({
  SPREADSHEET_ID: 'ISOLATED_TRANSACTION_PLAN',
  RAW_SHEET: 'mainplumbing',
  VILLAGES_SHEET: 'villages',
  SYSTEMS_SHEET: 'water_systems',
  SOURCES_SHEET: 'village_water_sources',
  FORM_VERSION: 2,
  SUBMISSION_SOURCE: 'WEB_APP_PLUMBING_V2',
  PROVINCE: 'พะเยา'
});

const PLUMBING_DLA = Object.freeze({
  USAGE_TYPES: Object.freeze(['เกษตร', 'อุปโภค/บริโภค']),
  QUALITY_FAILURE_CATEGORIES: Object.freeze([
    'คุณภาพน้ำด้านกายภาพ',
    'คุณภาพน้ำทางเคมีทั่วไป',
    'คุณภาพน้ำทางโลหะหนักทั่วไป',
    'คุณภาพน้ำทางโลหะหนักที่เป็นพิษ',
    'คุณภาพน้ำทางแบคทีเรีย'
  ]),
  WATER_SOURCE_TYPES: Object.freeze([
    'แหล่งน้ำผิวดิน',
    'แหล่งน้ำใต้ดิน (บ่อน้ำบาดาล)',
    'แหล่งน้ำผิวดินและแหล่งน้ำใต้ดิน'
  ]),
  WATER_PRESSURES: Object.freeze([
    'น้ำไหลตลอดเวลา',
    'น้ำไหลแรงเป็นบางเวลา',
    'น้ำไหลอ่อนตลอดเวลา'
  ]),
  ESTABLISHMENT_TYPES: Object.freeze([
    'อปท. จัดตั้ง/สร้างเอง',
    'รับมอบตามระเบียบพัสดุ',
    'ถ่ายโอน',
    'ไม่ใช่ทรัพย์สินของ อปท.'
  ]),
  TRANSFER_DOCUMENT_STATUSES: Object.freeze(['มี', 'ไม่มี']),
  MONTHS: Object.freeze([
    'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
  ])
});

/**
 * Bootstrap for Add New Plumbing Form.
 * READ ONLY: returns location master + observed values with provenance.
 */
function getPlumbingFormBootstrap() {
  try {
    const ss = SpreadsheetApp.openById(PLUMBING_CONFIG.SPREADSHEET_ID);
    const villageTable = plumbingReadTable_(ss, PLUMBING_CONFIG.VILLAGES_SHEET);
    const rawTable = plumbingReadTable_(ss, PLUMBING_CONFIG.RAW_SHEET);
    const villages = plumbingBuildVillageRecords_(villageTable);
    const location = plumbingBuildLocationMaster_(villages);
    const masterCatalog = plumbingBuildObservedMasterCatalog_(rawTable);
    const pendingKeys = Object.keys(masterCatalog).filter(function(key) {
      return masterCatalog[key].complete !== true;
    });

    return {
      success: true,
      data: {
        formVersion: PLUMBING_CONFIG.FORM_VERSION,
        province: PLUMBING_CONFIG.PROVINCE,
        location: location,
        villages: villages,
        masterCatalog: masterCatalog,
        pendingOfficialMasters: pendingKeys,
        readyForProduction: pendingKeys.length === 0
      }
    };
  } catch (error) {
    Logger.log('getPlumbingFormBootstrap error: ' + error.toString());
    return {
      success: false,
      message: 'ไม่สามารถโหลดข้อมูลสำหรับฟอร์มประปาได้',
      data: null
    };
  }
}

/**
 * Read-only village lookup API. Stable village_id is returned as villageIdRef
 * for internal selection only; UI must never render it as a label.
 */
function getPlumbingVillages(filters) {
  try {
    const request = filters || {};
    const ss = SpreadsheetApp.openById(PLUMBING_CONFIG.SPREADSHEET_ID);
    const villages = plumbingBuildVillageRecords_(
      plumbingReadTable_(ss, PLUMBING_CONFIG.VILLAGES_SHEET)
    );

    const district = plumbingNormalizeComparableText_(request.district);
    const tambon = plumbingNormalizeComparableText_(request.tambon);
    const localAuthority = plumbingNormalizeComparableText_(request.localAuthority);

    const filtered = villages.filter(function(village) {
      if (district && plumbingNormalizeComparableText_(village.district) !== district) return false;
      // Tambon is an optional enrichment field in R1. A blank master value must
      // never hide an otherwise valid village from the lookup.
      if (tambon && village.tambon && plumbingNormalizeComparableText_(village.tambon) !== tambon) return false;
      if (localAuthority && plumbingNormalizeComparableText_(village.localAuthority) !== localAuthority) return false;
      return true;
    });

    return { success: true, data: filtered };
  } catch (error) {
    Logger.log('getPlumbingVillages error: ' + error.toString());
    return { success: false, message: 'ไม่สามารถโหลดรายชื่อหมู่บ้านได้', data: [] };
  }
}

function plumbingReadTable_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Missing sheet: ' + sheetName);
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    return { headers: [], rows: [] };
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values.shift().map(function(value) {
    return plumbingNormalizeText_(value);
  });

  return {
    headers: headers,
    rows: values,
    reservedIds: ss.reservedIds || []
  };
}

function plumbingHeaderIndex_(headers, name) {
  const index = headers.indexOf(name);
  if (index < 0) {
    throw new Error('Missing column: ' + name);
  }
  return index;
}

function plumbingOptionalHeaderIndex_(headers, name) {
  return (headers || []).indexOf(name);
}

function plumbingNormalizeText_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function plumbingNormalizeComparableText_(value) {
  return plumbingNormalizeText_(value).toLowerCase();
}

function plumbingNormalizeIntegerText_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  const text = plumbingNormalizeText_(value);
  if (/^\d+\.0+$/.test(text)) return text.replace(/\.0+$/, '');
  return text;
}

function plumbingBuildVillageRecords_(table) {
  const headers = table.headers || [];
  const indexes = {
    villageId: plumbingHeaderIndex_(headers, 'village_id'),
    province: plumbingHeaderIndex_(headers, 'province'),
    district: plumbingHeaderIndex_(headers, 'district'),
    tambon: plumbingHeaderIndex_(headers, 'subdistrict'),
    localAuthority: plumbingHeaderIndex_(headers, 'local_authority'),
    moo: plumbingHeaderIndex_(headers, 'village_no'),
    villageName: plumbingHeaderIndex_(headers, 'village_name'),
    communityType: plumbingOptionalHeaderIndex_(headers, 'community_type'),
    dlaVillageCode: plumbingOptionalHeaderIndex_(headers, 'dla_village_code')
  };

  return (table.rows || []).map(function(row) {
    return {
      villageIdRef: plumbingNormalizeText_(row[indexes.villageId]),
      province: plumbingNormalizeText_(row[indexes.province]),
      district: plumbingNormalizeText_(row[indexes.district]),
      tambon: plumbingNormalizeText_(row[indexes.tambon]),
      localAuthority: plumbingNormalizeText_(row[indexes.localAuthority]),
      moo: plumbingNormalizeIntegerText_(row[indexes.moo]),
      villageName: plumbingNormalizeText_(row[indexes.villageName]),
      communityType: indexes.communityType >= 0 ? plumbingNormalizeText_(row[indexes.communityType]) : '',
      dlaVillageCode: indexes.dlaVillageCode >= 0 ? plumbingNormalizeText_(row[indexes.dlaVillageCode]) : ''
    };
  }).filter(function(village) {
    return Boolean(village.villageIdRef && village.villageName);
  });
}

function plumbingBuildLocationMaster_(villages) {
  const uniqueDistricts = {};
  const uniqueTambons = {};
  const uniqueAuthorities = {};
  let withTambon = 0;

  villages.forEach(function(village) {
    if (village.district) uniqueDistricts[village.district] = true;
    if (village.tambon) {
      withTambon += 1;
      uniqueTambons[village.district + '\u0000' + village.tambon] = {
        district: village.district,
        tambon: village.tambon
      };
    }
    if (village.localAuthority) {
      uniqueAuthorities[
        village.district + '\u0000' + village.tambon + '\u0000' + village.localAuthority
      ] = {
        district: village.district,
        tambon: village.tambon,
        localAuthority: village.localAuthority
      };
    }
  });

  const districts = Object.keys(uniqueDistricts).sort(function(a, b) {
    return a.localeCompare(b, 'th');
  });
  const tambons = Object.keys(uniqueTambons).map(function(key) {
    return uniqueTambons[key];
  }).sort(function(a, b) {
    return (a.district + a.tambon).localeCompare(b.district + b.tambon, 'th');
  });
  const localAuthorities = Object.keys(uniqueAuthorities).map(function(key) {
    return uniqueAuthorities[key];
  }).sort(function(a, b) {
    return (a.district + a.localAuthority).localeCompare(b.district + b.localAuthority, 'th');
  });

  return {
    province: PLUMBING_CONFIG.PROVINCE,
    districts: districts,
    tambons: tambons,
    localAuthorities: localAuthorities,
    hasTambonData: withTambon > 0,
    tambonCoverage: villages.length ? withTambon / villages.length : 0,
    villageCount: villages.length,
    pending: withTambon === 0 ? ['tambon'] : []
  };
}

function plumbingDistinctObservedOptions_(table, columnName, allowValue) {
  const index = plumbingHeaderIndex_(table.headers || [], columnName);
  const seen = {};
  (table.rows || []).forEach(function(row) {
    const value = plumbingNormalizeText_(row[index]);
    if (!value || value === '-') return;
    if (allowValue && !allowValue(value)) return;
    seen[value] = true;
  });

  return Object.keys(seen).sort(function(a, b) {
    return a.localeCompare(b, 'th');
  }).map(function(value) {
    return { value: value, label: value };
  });
}


function plumbingConfirmedMaster_(source, values) {
  const options = (values || []).map(function(value) {
    return typeof value === 'object' && value !== null
      ? { value: plumbingNormalizeText_(value.value), label: plumbingNormalizeText_(value.label || value.value) }
      : { value: plumbingNormalizeText_(value), label: plumbingNormalizeText_(value) };
  }).filter(function(option) { return Boolean(option.value); });
  return {
    status: 'CONFIRMED',
    complete: options.length > 0,
    source: source,
    options: options
  };
}

function plumbingBuildObservedMasterCatalog_(rawTable) {
  const systemTypes = plumbingDistinctObservedOptions_(rawTable, 'system_type_raw');
  const ownership = plumbingDistinctObservedOptions_(rawTable, 'owner_raw');
  return {
    'system-type': plumbingConfirmedMaster_('mainplumbing.system_type_raw', systemTypes),
    'ownership': plumbingConfirmedMaster_('mainplumbing.owner_raw', ownership),
    'water-source-type': plumbingConfirmedMaster_('DLA/WAT002', PLUMBING_DLA.WATER_SOURCE_TYPES),
    'water-pressure': plumbingConfirmedMaster_('DLA/WAT002', PLUMBING_DLA.WATER_PRESSURES),
    'establishment-type': plumbingConfirmedMaster_('DLA/WAT002', PLUMBING_DLA.ESTABLISHMENT_TYPES),
    'transfer-document-status': plumbingConfirmedMaster_('existing-data-contract', PLUMBING_DLA.TRANSFER_DOCUMENT_STATUSES)
  };
}

/**
 * Check duplicate candidate for NEW village before any future create path.
 * READ ONLY. Exact = same area + normalized village name + village number.
 * Possible = same area + same normalized name OR same village number.
 */
function checkPlumbingVillageCandidate(payload) {
  try {
    const request = payload || {};
    const ss = SpreadsheetApp.openById(PLUMBING_CONFIG.SPREADSHEET_ID);
    const villages = plumbingBuildVillageRecords_(
      plumbingReadTable_(ss, PLUMBING_CONFIG.VILLAGES_SHEET)
    );
    return {
      success: true,
      data: plumbingFindVillageCandidates_(villages, request)
    };
  } catch (error) {
    Logger.log('checkPlumbingVillageCandidate error: ' + error.toString());
    return {
      success: false,
      message: 'ไม่สามารถตรวจหมู่บ้านที่อาจซ้ำได้',
      data: null
    };
  }
}

function plumbingFindVillageCandidates_(villages, request) {
  const district = plumbingNormalizeComparableText_(request && request.district);
  const tambon = plumbingNormalizeComparableText_(request && request.tambon);
  const localAuthority = plumbingNormalizeComparableText_(request && request.localAuthority);
  const villageName = plumbingNormalizeComparableText_(request && request.villageName);
  const moo = plumbingNormalizeIntegerText_(request && request.moo);

  if (!district || !localAuthority || !villageName || !moo) {
    return {
      status: 'INSUFFICIENT_INPUT',
      exact: [],
      possible: []
    };
  }

  const sameArea = (villages || []).filter(function(village) {
    if (plumbingNormalizeComparableText_(village.district) !== district) return false;
    if (plumbingNormalizeComparableText_(village.localAuthority) !== localAuthority) return false;
    if (tambon && village.tambon && plumbingNormalizeComparableText_(village.tambon) !== tambon) return false;
    return true;
  });

  const exact = [];
  const possible = [];
  sameArea.forEach(function(village) {
    const sameName = plumbingNormalizeComparableText_(village.villageName) === villageName;
    const sameMoo = plumbingNormalizeIntegerText_(village.moo) === moo;
    const publicCandidate = {
      villageIdRef: village.villageIdRef,
      villageName: village.villageName,
      moo: village.moo,
      district: village.district,
      tambon: village.tambon,
      localAuthority: village.localAuthority
    };

    if (sameName && sameMoo) {
      exact.push(publicCandidate);
    } else if (sameName || sameMoo) {
      possible.push(publicCandidate);
    }
  });

  return {
    status: exact.length ? 'EXACT' : (possible.length ? 'POSSIBLE' : 'NONE'),
    exact: exact,
    possible: possible
  };
}


// ============================================================================
// Plumbing Form v1 — submission idempotency token
// Business duplicate detection was removed by explicit product decision on 2026-08-21.
// ============================================================================

function createPlumbingSubmissionId() {
  try {
    return {
      success: true,
      data: { submissionId: 'PLB-' + Utilities.getUuid() }
    };
  } catch (error) {
    Logger.log('createPlumbingSubmissionId error: ' + error.toString());
    return { success: false, message: 'ไม่สามารถสร้างรหัสการส่งข้อมูลได้', data: null };
  }
}

// ============================================================================
// Plumbing Form v1 — Checkpoint 8 raw write + Checkpoint 9 processor
// Raw is durable first; downstream writes are performed only by the server-side processor.
// ============================================================================

const PLUMBING_LEGACY_RAW_HEADERS = Object.freeze([
  'source_excel_row','source_order','province','district','local_authority','village_name',
  'pwa_households','mwa_households','commercial_households','other_village_pipe_households',
  'waterbank_households','self_source_households','natural_source_households','village_waterworks_status_raw',
  'water_from_raw','system_name_raw','latitude_raw','longitude_raw','owner_raw','agency_raw',
  'system_type_raw','capacity_m3_hr_raw','usage_type_raw','households_served_raw','construction_year_be_raw',
  'system_age_years_raw','operational_status_raw','utility_water_quality_raw','drinking_water_quality_raw',
  'water_quantity_raw','shared_with_other_village_raw','shared_village_name_raw','establishment_type_raw',
  'establishment_agency_raw','transfer_year_raw','transfer_agency_raw','transfer_other_raw',
  'transfer_document_raw','transfer_document_url_raw'
]);

const PLUMBING_WEB_RAW_HEADERS = Object.freeze([
  'record_id','submission_id','form_version','submission_source','received_at',
  'line_user_id_raw','line_display_name_raw','processing_status','processing_error','raw_sheet_row',
  'payload_fingerprint','duplicate_warning_shown','duplicate_override','duplicate_candidate_count','duplicate_checked_at',
  'village_mode','village_id_ref','subdistrict_raw','village_no_raw','coordinate_mode',
  'missing_coordinate_reason_raw','missing_coordinate_other_raw','service_agency_raw','system_water_source_raw',
  'system_water_source_type_raw','beneficiaries_raw','year_round_raw','problem_months_json',
  'quality_failure_reason_raw','water_pressure_raw','shared_villages_json','monthly_production_cost_raw',
  'monthly_service_revenue_raw','water_tariff_raw','note_raw','raw_payload_json'
]);

const PLUMBING_PROCESSOR_RAW_HEADERS = Object.freeze([
  'processed_village_id','processed_system_id','processed_at','processor_version'
]);

const PLUMBING_V2_RAW_HEADERS = Object.freeze([
  'usage_types_json','available_months_json','quality_failure_categories_json','quality_failure_detail_raw',
  'community_type_raw','dla_village_code_raw','surface_water_type_raw','surface_water_agency_raw'
]);

const PLUMBING_VILLAGE_BASE_HEADERS = Object.freeze([
  'village_id','source_excel_row','source_order','province','district','subdistrict','local_authority','village_no','village_name',
  'has_village_waterworks','water_from_raw','pwa_households','mwa_households','commercial_households','other_village_pipe_households',
  'waterbank_households','self_source_households','natural_source_households','created_at','updated_at'
]);

const PLUMBING_V2_VILLAGE_HEADERS = Object.freeze(['community_type','dla_village_code']);

const PLUMBING_SYSTEM_BASE_HEADERS = Object.freeze([
  'system_id','village_id','source_excel_row','system_no','system_name','latitude','longitude','owner_type','responsible_agency',
  'system_type','water_source_type','capacity_m3_hr','usage_type','households_served','construction_year_be','construction_year_ce',
  'operational_status','utility_water_quality','drinking_water_quality','water_quantity','shared_with_other_village','shared_village_name',
  'establishment_type','establishment_agency','transfer_year_be','transfer_agency','transfer_other','transfer_document_status',
  'transfer_document_url','created_at','updated_at'
]);

const PLUMBING_V2_SYSTEM_HEADERS = Object.freeze([
  'usage_types_json','quality_failure_categories_json','quality_failure_detail','water_pressure','year_round_status',
  'available_months_json','beneficiaries','monthly_production_cost','monthly_service_revenue','water_tariff',
  'service_agency','water_source_detail','surface_water_type','surface_water_agency','shared_villages_json'
]);

const PLUMBING_PROCESSOR_VERSION = 'PLUMBING_PROCESSOR_V2';

function saveNewPlumbingSystem(payload) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(30000);
    if (!locked) {
      return { success: false, code: 'BUSY', message: 'ระบบกำลังรับข้อมูลรายการอื่น กรุณาลองบันทึกอีกครั้ง', rawSaved: false };
    }

    const request = payload || {};
    const submissionId = plumbingNormalizeText_(request.submissionId);
    if (!/^PLB-[0-9a-fA-F-]{20,}$/.test(submissionId)) {
      return { success: false, code: 'SUBMISSION_ID_INVALID', message: 'รหัสการส่งข้อมูลไม่ถูกต้อง', rawSaved: false };
    }

    const ss = SpreadsheetApp.openById(PLUMBING_CONFIG.SPREADSHEET_ID);
    const rawSheet = ss.getSheetByName(PLUMBING_CONFIG.RAW_SHEET);
    if (!rawSheet) throw new Error('Missing sheet: ' + PLUMBING_CONFIG.RAW_SHEET);

    const currentHeaders = plumbingReadRawHeadersForValidation_(rawSheet);
    const existing = plumbingFindSubmissionRow_(rawSheet, currentHeaders, submissionId);
    const validation = plumbingValidateIncomingSubmission_(ss, request);
    if (!validation.valid) {
      return {
        success: false,
        code: 'VALIDATION_FAILED',
        message: 'ข้อมูลไม่ผ่านการตรวจสอบของเซิร์ฟเวอร์',
        errors: validation.errors,
        rawSaved: false
      };
    }

    const canonical = validation.data;
    const fingerprint = plumbingPayloadFingerprint_(canonical);
    if (existing) {
      const fingerprintIndex = currentHeaders.indexOf('payload_fingerprint');
      const storedFingerprint = fingerprintIndex >= 0 ? plumbingNormalizeText_(existing.values[fingerprintIndex]) : '';
      if (storedFingerprint && storedFingerprint === fingerprint) {
        const statusIndex = currentHeaders.indexOf('processing_status');
        const status = statusIndex >= 0 ? plumbingNormalizeText_(existing.values[statusIndex]) : 'RECEIVED';
        return {
          success: true,
          rawSaved: true,
          idempotent: true,
          processingStatus: status || 'RECEIVED',
          systemName: canonical.systemName,
          villageName: canonical.villageName
        };
      }
      return {
        success: false,
        code: 'SUBMISSION_ID_CONFLICT',
        message: 'พบการส่งซ้ำด้วยรหัสเดิมแต่ข้อมูลไม่ตรงกัน ระบบจึงไม่เขียนแถวใหม่',
        rawSaved: false
      };
    }

    const headers = plumbingEnsureRawSchema_(rawSheet);
    const targetRow = rawSheet.getLastRow() + 1;
    const audit = {
      recordId: 'PLB-R-' + Utilities.getUuid(),
      submissionId: submissionId,
      receivedAt: new Date(),
      rawSheetRow: targetRow,
      fingerprint: fingerprint,
      duplicateWarningShown: false,
      duplicateOverride: false,
      duplicateCandidateCount: 0,
      duplicateCheckedAt: '',
      recorder: request.recorder || {}
    };
    const rowObject = plumbingBuildMainplumbingRowObject_(canonical, audit);
    const rowValues = headers.map(function(header) {
      return Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : '';
    });
    rawSheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);

    // Raw reception is already durable. A processor failure must keep this row
    // and must be reported as a processing problem, not as a failed reception.
    const processed = plumbingProcessRawSubmissionLocked_(ss, rawSheet, headers, targetRow);
    return {
      success: true,
      rawSaved: true,
      idempotent: false,
      processingStatus: processed.processingStatus,
      systemName: canonical.systemName,
      villageName: canonical.villageName,
      message: processed.message || ''
    };
  } catch (error) {
    Logger.log('saveNewPlumbingSystem error: ' + error.toString());
    return { success: false, code: 'SERVER_ERROR', message: 'เกิดข้อผิดพลาดขณะรับข้อมูลประปา', rawSaved: false };
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (ignore) {}
    }
  }
}
function plumbingReadRawHeadersForValidation_(sheet) {
  return plumbingEnsureRawSchema_(sheet);
}

function plumbingEnsureRawSchema_(sheet) {
  const expected = PLUMBING_LEGACY_RAW_HEADERS
    .concat(PLUMBING_WEB_RAW_HEADERS)
    .concat(PLUMBING_PROCESSOR_RAW_HEADERS)
    .concat(PLUMBING_V2_RAW_HEADERS);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < expected.length) {
    throw new Error('mainplumbing schema missing DLA R1 columns: expected at least ' + expected.length + ', found ' + lastColumn);
  }
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(plumbingNormalizeText_);
  plumbingAssertHeaderPrefix_(headers, expected, 'mainplumbing');
  return headers;
}


function plumbingAssertHeaderPrefix_(headers, expected, sheetName) {
  const counts = {};
  (headers || []).forEach(function(header) {
    if (header) counts[header] = (counts[header] || 0) + 1;
  });
  expected.forEach(function(header, index) {
    if (headers[index] !== header) {
      throw new Error(sheetName + ' schema mismatch at column ' + (index + 1) + ': expected ' + header + ', found ' + plumbingNormalizeText_(headers[index]));
    }
    if ((counts[header] || 0) !== 1) {
      throw new Error(sheetName + ' duplicate/missing required header: ' + header);
    }
  });
}

function plumbingAssertVillageSchema_(headers) {
  plumbingAssertHeaderPrefix_(headers, PLUMBING_VILLAGE_BASE_HEADERS.concat(PLUMBING_V2_VILLAGE_HEADERS), PLUMBING_CONFIG.VILLAGES_SHEET);
}

function plumbingAssertSystemSchema_(headers) {
  plumbingAssertHeaderPrefix_(headers, PLUMBING_SYSTEM_BASE_HEADERS.concat(PLUMBING_V2_SYSTEM_HEADERS), PLUMBING_CONFIG.SYSTEMS_SHEET);
}

function plumbingCanonicalAllowedArrayServer_(value, allowed) {
  if (!Array.isArray(value)) return { ok: false, value: [], invalid: '', reason: 'TYPE' };
  const seen = {};
  const submitted = [];
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== 'string' && typeof value[i] !== 'number') {
      return { ok: false, value: [], invalid: '', reason: 'ITEM_TYPE' };
    }
    const text = plumbingNormalizeText_(value[i]);
    if (!text) continue;
    if (allowed.indexOf(text) < 0) return { ok: false, value: [], invalid: text, reason: 'ENUM' };
    if (!seen[text]) {
      seen[text] = true;
      submitted.push(text);
    }
  }
  const ordered = allowed.filter(function(item) { return Boolean(seen[item]); });
  return { ok: true, value: ordered, invalid: '', reason: '' };
}

function plumbingWaterSourceIncludesSurfaceServer_(value) {
  const text = plumbingNormalizeText_(value);
  return text === 'แหล่งน้ำผิวดิน' || text === 'แหล่งน้ำผิวดินและแหล่งน้ำใต้ดิน';
}

function plumbingObservedMasterValues_(rawTable, columnName, allowValue) {
  return plumbingDistinctObservedOptions_(rawTable, columnName, allowValue).map(function(option) {
    return plumbingNormalizeText_(option.value);
  });
}

function plumbingFindSubmissionRow_(sheet, headers, submissionId) {
  const index = headers.indexOf('submission_id');
  if (index < 0 || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (plumbingNormalizeText_(values[i][index]) === submissionId) {
      return { sheetRow: i + 2, values: values[i] };
    }
  }
  return null;
}

function plumbingValidateIncomingSubmission_(ss, request) {
  const errors = [];
  function add(field, code, message) { errors.push({ field: field, code: code, message: message }); }

  if (Number(request && request.formVersion) !== PLUMBING_CONFIG.FORM_VERSION) {
    add('formVersion', 'FORM_VERSION_INVALID', 'เวอร์ชันฟอร์มไม่ตรงกับเซิร์ฟเวอร์ปัจจุบัน');
  }

  const source = request && request.data;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { valid: false, errors: [{ field: 'form', code: 'MALFORMED_PAYLOAD', message: 'รูปแบบข้อมูลฟอร์มไม่ถูกต้อง' }], data: null };
  }

  const allowedKeys = new Set([
    'systemName','serviceAgency','systemType','ownership','responsibleOrganization','province','district','tambon','localAuthority',
    'communityType','dlaVillageCode','villageMode','villageIdRef','villageName','moo',
    'coordinateMode','latitude','longitude','missingCoordinateReason','missingCoordinateOther',
    'waterSource','waterSourceType','surfaceWaterType','surfaceWaterAgency','constructionYear','capacity','households','beneficiaries',
    'usageTypes','yearRound','availableMonths','operationalStatus','drinkingQuality','qualityFailureCategories','qualityFailureReason',
    'waterQuantity','waterPressure','hasSharedVillages','sharedVillages','establishmentType','relatedAgency','transferYear','transferAgency',
    'transferDocumentStatus','transferDocumentUrl','monthlyProductionCost','monthlyServiceRevenue','waterTariff','note'
  ]);
  Object.keys(source).forEach(function(key) {
    if (!allowedKeys.has(key)) add(key, 'UNSUPPORTED_FIELD', 'พบ field ที่ฟอร์มนี้ไม่รองรับ');
  });

  const textFields = [
    'systemName','serviceAgency','systemType','ownership','responsibleOrganization','province','district','tambon','localAuthority',
    'communityType','dlaVillageCode','villageMode','villageIdRef','villageName','moo','coordinateMode','latitude','longitude',
    'missingCoordinateReason','missingCoordinateOther','waterSource','waterSourceType','surfaceWaterType','surfaceWaterAgency',
    'constructionYear','capacity','households','beneficiaries','yearRound','operationalStatus','drinkingQuality','qualityFailureReason',
    'waterQuantity','waterPressure','hasSharedVillages','establishmentType','relatedAgency','transferYear','transferAgency',
    'transferDocumentStatus','transferDocumentUrl','monthlyProductionCost','monthlyServiceRevenue','waterTariff','note'
  ];
  const data = {};
  textFields.forEach(function(key) {
    const value = source[key];
    if (value !== undefined && value !== null && typeof value !== 'string' && typeof value !== 'number') {
      add(key, 'MALFORMED_FIELD', 'รูปแบบข้อมูล field นี้ไม่ถูกต้อง');
      data[key] = '';
    } else {
      data[key] = plumbingNormalizeText_(value);
    }
  });

  const usageResult = plumbingCanonicalAllowedArrayServer_(source.usageTypes, PLUMBING_DLA.USAGE_TYPES);
  if (!usageResult.ok) add('usageTypes', 'USAGE_TYPES_INVALID', 'ประเภทการใช้ประโยชน์ต้องเป็นรายการจากแบบ DLA ที่รองรับ');
  data.usageTypes = usageResult.value;

  const monthResult = plumbingCanonicalAllowedArrayServer_(source.availableMonths, PLUMBING_DLA.MONTHS);
  if (!monthResult.ok) add('availableMonths', 'AVAILABLE_MONTHS_INVALID', 'เดือนที่มีน้ำใช้มีรูปแบบหรือค่าที่ไม่รองรับ');
  data.availableMonths = monthResult.value;

  const qualityResult = plumbingCanonicalAllowedArrayServer_(source.qualityFailureCategories, PLUMBING_DLA.QUALITY_FAILURE_CATEGORIES);
  if (!qualityResult.ok) add('qualityFailureCategories', 'QUALITY_FAILURE_CATEGORIES_INVALID', 'หมวดคุณภาพน้ำที่ไม่ผ่านมีรูปแบบหรือค่าที่ไม่รองรับ');
  data.qualityFailureCategories = qualityResult.value;

  if (!Array.isArray(source.sharedVillages)) {
    add('sharedVillages', 'SHARED_VILLAGES_INVALID_TYPE', 'รายการหมู่บ้านที่ใช้น้ำร่วมต้องเป็นรายการข้อมูล');
    data.sharedVillages = [];
  } else {
    data.sharedVillages = source.sharedVillages;
  }

  data.province = PLUMBING_CONFIG.PROVINCE;

  if (data.villageMode !== 'existing' && data.villageMode !== 'new') {
    add('villageMode', 'VILLAGE_MODE_REQUIRED', 'กรุณาเลือกหมู่บ้านเดิมหรือเพิ่มหมู่บ้านใหม่');
  }

  const villageTable = plumbingReadTable_(ss, PLUMBING_CONFIG.VILLAGES_SHEET);
  const villages = plumbingBuildVillageRecords_(villageTable);
  const villageById = {};
  villages.forEach(function(village) { villageById[village.villageIdRef] = village; });
  const location = plumbingBuildLocationMaster_(villages);

  if (data.villageMode === 'existing') {
    const submittedTambon = data.tambon;
    const village = villageById[data.villageIdRef];
    if (!village) {
      add('villageIdRef', 'VILLAGE_REF_INVALID', 'หมู่บ้านที่เลือกไม่พบในฐานข้อมูลปัจจุบัน');
    } else {
      data.province = village.province || PLUMBING_CONFIG.PROVINCE;
      data.district = village.district;
      data.localAuthority = village.localAuthority;
      data.villageName = village.villageName;
      data.moo = village.moo;
      if (
        submittedTambon && village.tambon &&
        plumbingNormalizeComparableText_(submittedTambon) !== plumbingNormalizeComparableText_(village.tambon)
      ) {
        add('tambon', 'TAMBON_CONFLICT', 'ตำบลที่กรอกไม่ตรงกับตำบลที่มีอยู่ของหมู่บ้านนี้');
      }
      data.tambon = submittedTambon || village.tambon || '';

      const submittedCommunityType = data.communityType;
      const submittedDlaVillageCode = data.dlaVillageCode;
      if (
        submittedCommunityType && village.communityType &&
        plumbingNormalizeComparableText_(submittedCommunityType) !== plumbingNormalizeComparableText_(village.communityType)
      ) {
        add('communityType', 'COMMUNITY_TYPE_CONFLICT', 'ประเภทชุมชน/หมู่บ้านไม่ตรงกับข้อมูลเดิมของหมู่บ้านนี้');
      }
      if (
        submittedDlaVillageCode && village.dlaVillageCode &&
        plumbingNormalizeComparableText_(submittedDlaVillageCode) !== plumbingNormalizeComparableText_(village.dlaVillageCode)
      ) {
        add('dlaVillageCode', 'DLA_VILLAGE_CODE_CONFLICT', 'รหัสหมู่บ้าน/ชุมชน DLA ไม่ตรงกับข้อมูลเดิมของหมู่บ้านนี้');
      }
      data.communityType = submittedCommunityType || village.communityType || '';
      data.dlaVillageCode = submittedDlaVillageCode || village.dlaVillageCode || '';
    }
  } else if (data.villageMode === 'new') {
    if (!data.district) add('district', 'NEW_VILLAGE_DISTRICT_REQUIRED', 'กรุณาระบุอำเภอของหมู่บ้านใหม่');
    if (!data.localAuthority) add('localAuthority', 'NEW_VILLAGE_LOCAL_AUTHORITY_REQUIRED', 'กรุณาระบุ อปท. ของหมู่บ้านใหม่');
    if (!data.villageName) add('villageName', 'NEW_VILLAGE_NAME_REQUIRED', 'กรุณาระบุชื่อหมู่บ้านใหม่');
    const moo = plumbingParseOptionalNumberServer_(data.moo, { integer: true, min: 0 });
    if (data.moo === '') add('moo', 'NEW_VILLAGE_MOO_REQUIRED', 'กรุณาระบุหมู่ที่ของหมู่บ้านใหม่');
    else if (!moo.ok) add('moo', 'NEW_VILLAGE_MOO_INVALID', moo.message);
    else data.moo = String(moo.value);

    if (data.district && location.districts.indexOf(data.district) < 0) {
      add('district', 'DISTRICT_INVALID', 'อำเภอไม่อยู่ในข้อมูลพื้นที่ปัจจุบัน');
    }
    const authorityExists = villages.some(function(village) {
      return plumbingNormalizeComparableText_(village.district) === plumbingNormalizeComparableText_(data.district) &&
        plumbingNormalizeComparableText_(village.localAuthority) === plumbingNormalizeComparableText_(data.localAuthority);
    });
    if (data.localAuthority && !authorityExists) {
      add('localAuthority', 'LOCAL_AUTHORITY_INVALID', 'อปท. ไม่สัมพันธ์กับอำเภอในฐานข้อมูลปัจจุบัน');
    }

    const villageCandidate = plumbingFindVillageCandidates_(villages, {
      district: data.district,
      tambon: data.tambon,
      localAuthority: data.localAuthority,
      villageName: data.villageName,
      moo: data.moo
    });
    if (villageCandidate.status === 'EXACT') {
      add('villageName', 'NEW_VILLAGE_EXACT_CANDIDATE', 'พบหมู่บ้านตรงกับฐานข้อมูลเดิม กรุณาเลือกหมู่บ้านเดิม');
    }
    data.villageIdRef = '';
  }

  if (data.coordinateMode !== 'has-coordinate' && data.coordinateMode !== 'no-coordinate') {
    add('coordinateMode', 'COORDINATE_MODE_REQUIRED', 'กรุณาเลือกว่ามีพิกัดหรือไม่มีพิกัด');
  } else if (data.coordinateMode === 'has-coordinate') {
    const lat = plumbingParseCoordinateServer_(data.latitude, 'latitude');
    const lng = plumbingParseCoordinateServer_(data.longitude, 'longitude');
    if (!lat.ok) add('latitude', 'LATITUDE_INVALID', lat.message);
    if (!lng.ok) add('longitude', 'LONGITUDE_INVALID', lng.message);
    if (lat.ok) data.latitude = lat.value;
    if (lng.ok) data.longitude = lng.value;
    if (data.missingCoordinateReason || data.missingCoordinateOther) {
      add('missingCoordinateReason', 'COORDINATE_STALE_REASON', 'เมื่อมีพิกัด เหตุผลไม่มีพิกัดต้องว่าง');
    }
    data.missingCoordinateReason = '';
    data.missingCoordinateOther = '';
  } else {
    if (data.latitude || data.longitude) add('coordinateMode', 'NO_COORDINATE_STALE_VALUES', 'เมื่อไม่มีพิกัด Latitude/Longitude ต้องว่าง');
    data.latitude = '';
    data.longitude = '';
    if (data.missingCoordinateReason === 'อื่น ๆ') data.missingCoordinateReason = data.missingCoordinateOther;
    data.missingCoordinateOther = '';
    if (!data.missingCoordinateReason) add('missingCoordinateReason', 'MISSING_COORDINATE_REASON_REQUIRED', 'กรุณาระบุเหตุผลที่ไม่มีพิกัด');
  }

  if (data.yearRound) {
    if (data.yearRound !== 'yes' && data.yearRound !== 'no') {
      add('yearRound', 'YEAR_ROUND_INVALID', 'ค่าการมีน้ำตลอดปีไม่ถูกต้อง');
    } else if (data.yearRound === 'no' && data.availableMonths.length === 0) {
      add('availableMonths', 'AVAILABLE_MONTH_REQUIRED', 'เมื่อระบุว่าไม่ตลอดปี กรุณาเลือกเดือนที่มีน้ำใช้อย่างน้อย 1 เดือน');
    } else if (data.yearRound === 'yes' && data.availableMonths.length) {
      add('availableMonths', 'YEAR_ROUND_STALE_MONTHS', 'เดือนที่มีน้ำใช้ต้องว่างเมื่อเลือกตลอดปี');
    }
  } else if (data.availableMonths.length) {
    add('availableMonths', 'AVAILABLE_MONTH_WITHOUT_YEAR_ROUND', 'ต้องระบุสถานะการมีน้ำก่อนเลือกเดือน');
  }

  if (data.waterSourceType && PLUMBING_DLA.WATER_SOURCE_TYPES.indexOf(data.waterSourceType) < 0) {
    add('waterSourceType', 'WATER_SOURCE_TYPE_INVALID', 'ชนิดแหล่งน้ำไม่อยู่ในรายการ DLA/WAT002 ที่รองรับ');
  }
  if (!plumbingWaterSourceIncludesSurfaceServer_(data.waterSourceType) && (data.surfaceWaterType || data.surfaceWaterAgency)) {
    add('surfaceWaterType', 'SURFACE_WATER_STALE_VALUES', 'ข้อมูลแหล่งน้ำผิวดินต้องว่างเมื่อไม่ได้เลือกแหล่งน้ำผิวดิน');
  }

  if (data.operationalStatus && ['ใช้การได้', 'ใช้การไม่ได้'].indexOf(data.operationalStatus) < 0) {
    add('operationalStatus', 'OPERATIONAL_STATUS_INVALID', 'ค่าสถานะระบบไม่ถูกต้อง');
  }
  if (data.drinkingQuality && ['ผ่านเกณฑ์', 'ไม่ผ่านเกณฑ์'].indexOf(data.drinkingQuality) < 0) {
    add('drinkingQuality', 'DRINKING_QUALITY_INVALID', 'ค่าคุณภาพน้ำดื่มไม่ถูกต้อง');
  }
  if (data.drinkingQuality === 'ไม่ผ่านเกณฑ์') {
    if (data.qualityFailureCategories.length === 0) {
      add('qualityFailureCategories', 'QUALITY_FAILURE_CATEGORY_REQUIRED', 'กรุณาเลือกหมวดคุณภาพน้ำที่ไม่ผ่านอย่างน้อย 1 รายการ');
    }
  } else if (data.qualityFailureCategories.length || data.qualityFailureReason) {
    add('qualityFailureCategories', 'QUALITY_STALE_VALUES', 'หมวดและรายละเอียดคุณภาพน้ำไม่ผ่านต้องว่างเมื่อไม่ได้เลือก “ไม่ผ่านเกณฑ์”');
  }

  if (data.waterQuantity && ['เพียงพอ', 'ไม่เพียงพอ'].indexOf(data.waterQuantity) < 0) {
    add('waterQuantity', 'WATER_QUANTITY_INVALID', 'ค่าความเพียงพอของปริมาณน้ำไม่ถูกต้อง');
  }
  if (data.waterPressure && PLUMBING_DLA.WATER_PRESSURES.indexOf(data.waterPressure) < 0) {
    add('waterPressure', 'WATER_PRESSURE_INVALID', 'ค่าแรงดันน้ำไม่อยู่ในรายการ DLA/WAT002 ที่รองรับ');
  }

  if (data.hasSharedVillages && ['yes', 'no'].indexOf(data.hasSharedVillages) < 0) {
    add('hasSharedVillages', 'SHARED_MODE_INVALID', 'ค่าการใช้ระบบร่วมไม่ถูกต้อง');
  }
  const canonicalShared = [];
  if (data.hasSharedVillages === 'yes') {
    if (!data.sharedVillages.length) add('sharedVillages', 'SHARED_VILLAGE_REQUIRED', 'กรุณาเพิ่มหมู่บ้านที่ใช้น้ำร่วมอย่างน้อย 1 รายการ');
    const seen = {};
    const primaryIdentity = [
      plumbingNormalizeComparableText_(data.district),
      plumbingNormalizeComparableText_(data.localAuthority),
      plumbingNormalizeComparableText_(data.villageName),
      plumbingNormalizeIntegerText_(data.moo)
    ].join('|');

    data.sharedVillages.forEach(function(row, index) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        add('sharedVillages', 'SHARED_VILLAGE_ROW_INVALID', 'หมู่บ้านที่ใช้น้ำร่วมรายการที่ ' + (index + 1) + ' มีรูปแบบไม่ถูกต้อง');
        return;
      }

      const sharedAllowedKeys = new Set(['key','villageMode','villageIdRef','district','tambon','localAuthority','villageName','moo','communityType','dlaVillageCode']);
      const unsupportedSharedKey = Object.keys(row).find(function(key) { return !sharedAllowedKeys.has(key); });
      if (unsupportedSharedKey) {
        add('sharedVillages', 'SHARED_VILLAGE_UNSUPPORTED_FIELD', 'หมู่บ้านที่ใช้น้ำร่วมรายการที่ ' + (index + 1) + ' มี field ที่ไม่รองรับ: ' + unsupportedSharedKey);
        return;
      }

      const ref = plumbingNormalizeText_(row.villageIdRef);
      const mode = plumbingNormalizeText_(row.villageMode) || (ref ? 'existing' : 'new');
      const prefix = 'หมู่บ้านที่ใช้น้ำร่วมรายการที่ ' + (index + 1) + ': ';

      if (mode === 'existing') {
        const village = villageById[ref];
        if (!ref || !village) {
          add('sharedVillages', 'SHARED_VILLAGE_INVALID', prefix + 'ไม่พบหมู่บ้านเดิมในฐานข้อมูล');
          return;
        }
        if (data.villageMode === 'existing' && ref === data.villageIdRef) {
          add('sharedVillages', 'SHARED_VILLAGE_IS_PRIMARY', 'หมู่บ้านที่ใช้น้ำร่วมต้องไม่ซ้ำกับหมู่บ้านหลัก');
          return;
        }
        const key = 'id:' + ref;
        if (seen[key]) {
          add('sharedVillages', 'SHARED_VILLAGE_DUPLICATE', 'พบหมู่บ้านที่ใช้น้ำร่วมซ้ำกัน');
          return;
        }
        seen[key] = true;
        canonicalShared.push({
          villageMode: 'existing',
          villageIdRef: ref,
          district: village.district,
          tambon: village.tambon,
          localAuthority: village.localAuthority,
          villageName: village.villageName,
          moo: village.moo,
          communityType: plumbingNormalizeText_(row.communityType),
          dlaVillageCode: plumbingNormalizeText_(row.dlaVillageCode)
        });
        return;
      }

      if (mode !== 'new') {
        add('sharedVillages', 'SHARED_VILLAGE_MODE_INVALID', prefix + 'สถานะหมู่บ้านไม่ถูกต้อง');
        return;
      }
      if (ref) {
        add('sharedVillages', 'SHARED_VILLAGE_NEW_STALE_REF', prefix + 'หมู่บ้านใหม่ต้องไม่ส่ง reference เดิม');
        return;
      }

      const district = plumbingNormalizeText_(row.district);
      const tambon = plumbingNormalizeText_(row.tambon);
      const localAuthority = plumbingNormalizeText_(row.localAuthority);
      const villageName = plumbingNormalizeText_(row.villageName);
      const mooResult = plumbingParseOptionalNumberServer_(row.moo, { integer: true, min: 0 });
      if (!district || !localAuthority || !villageName || plumbingNormalizeText_(row.moo) === '') {
        add('sharedVillages', 'SHARED_VILLAGE_INCOMPLETE', prefix + 'กรอกข้อมูลไม่ครบ');
        return;
      }
      if (!mooResult.ok) {
        add('sharedVillages', 'SHARED_VILLAGE_MOO_INVALID', prefix + mooResult.message);
        return;
      }
      const moo = String(mooResult.value);
      if (location.districts.indexOf(district) < 0) {
        add('sharedVillages', 'SHARED_VILLAGE_DISTRICT_INVALID', prefix + 'อำเภอไม่อยู่ในข้อมูลพื้นที่ปัจจุบัน');
        return;
      }
      const authorityExists = villages.some(function(village) {
        return plumbingNormalizeComparableText_(village.district) === plumbingNormalizeComparableText_(district) &&
          plumbingNormalizeComparableText_(village.localAuthority) === plumbingNormalizeComparableText_(localAuthority);
      });
      if (!authorityExists) {
        add('sharedVillages', 'SHARED_VILLAGE_LOCAL_AUTHORITY_INVALID', prefix + 'อปท. ไม่สัมพันธ์กับอำเภอในฐานข้อมูลปัจจุบัน');
        return;
      }

      const identity = [
        plumbingNormalizeComparableText_(district),
        plumbingNormalizeComparableText_(localAuthority),
        plumbingNormalizeComparableText_(villageName),
        plumbingNormalizeIntegerText_(moo)
      ].join('|');
      if (identity === primaryIdentity) {
        add('sharedVillages', 'SHARED_VILLAGE_IS_PRIMARY', 'หมู่บ้านที่ใช้น้ำร่วมต้องไม่ซ้ำกับหมู่บ้านหลัก');
        return;
      }
      const identityKey = 'identity:' + identity;
      if (seen[identityKey]) {
        add('sharedVillages', 'SHARED_VILLAGE_DUPLICATE', 'พบหมู่บ้านที่ใช้น้ำร่วมซ้ำกัน');
        return;
      }

      const candidate = plumbingFindVillageCandidates_(villages, {
        district: district,
        tambon: tambon,
        localAuthority: localAuthority,
        villageName: villageName,
        moo: moo
      });
      if (candidate.status === 'EXACT') {
        add('sharedVillages', 'SHARED_VILLAGE_EXACT_CANDIDATE', prefix + 'พบหมู่บ้านตรงกับฐานข้อมูลเดิม กรุณาเลือกหมู่บ้านเดิม');
        return;
      }

      seen[identityKey] = true;
      canonicalShared.push({
        villageMode: 'new',
        villageIdRef: '',
        district: district,
        tambon: tambon,
        localAuthority: localAuthority,
        villageName: villageName,
        moo: moo,
        communityType: plumbingNormalizeText_(row.communityType),
        dlaVillageCode: ''
      });
    });
  } else if (data.sharedVillages.length) {
    add('sharedVillages', 'SHARED_VILLAGE_STALE_ARRAY', 'รายการหมู่บ้านร่วมต้องว่างเมื่อไม่ได้เลือกใช้ร่วม');
  }
  data.sharedVillages = canonicalShared;

  if (data.establishmentType && PLUMBING_DLA.ESTABLISHMENT_TYPES.indexOf(data.establishmentType) < 0) {
    add('establishmentType', 'ESTABLISHMENT_TYPE_INVALID', 'รูปแบบการจัดตั้งไม่อยู่ในรายการ DLA/WAT002 ที่รองรับ');
  }
  const acceptedAsset = plumbingNormalizeComparableText_(data.establishmentType) === plumbingNormalizeComparableText_('รับมอบตามระเบียบพัสดุ');
  const transferred = plumbingNormalizeComparableText_(data.establishmentType) === plumbingNormalizeComparableText_('ถ่ายโอน');

  if (acceptedAsset) {
    if (!data.relatedAgency) add('relatedAgency', 'ACCEPTED_ASSET_AGENCY_REQUIRED', 'กรุณาระบุหน่วยงานที่เกี่ยวข้องสำหรับกรณีรับมอบตามระเบียบพัสดุ');
  } else if (data.relatedAgency) {
    add('relatedAgency', 'RELATED_AGENCY_STALE', 'หน่วยงานที่เกี่ยวข้องต้องว่างเมื่อรูปแบบการจัดตั้งไม่ใช่รับมอบตามระเบียบพัสดุ');
  }

  if (transferred) {
    if (!data.transferAgency) add('transferAgency', 'TRANSFER_AGENCY_REQUIRED', 'กรุณาระบุหน่วยงานที่ถ่ายโอน');
  } else if (data.transferYear || data.transferAgency || data.transferDocumentStatus || data.transferDocumentUrl) {
    add('establishmentType', 'TRANSFER_STALE_VALUES', 'ข้อมูลถ่ายโอนต้องว่างเมื่อรูปแบบการจัดตั้งไม่ใช่ถ่ายโอน');
  }

  if (data.transferDocumentStatus && PLUMBING_DLA.TRANSFER_DOCUMENT_STATUSES.indexOf(data.transferDocumentStatus) < 0) {
    add('transferDocumentStatus', 'TRANSFER_DOCUMENT_STATUS_INVALID', 'สถานะเอกสารไม่อยู่ในรายการที่รองรับ');
  }
  if (data.transferDocumentUrl && !plumbingHttpUrlAllowed_(data.transferDocumentUrl)) {
    add('transferDocumentUrl', 'TRANSFER_URL_INVALID', 'URL เอกสารต้องเป็น http:// หรือ https:// เท่านั้น');
  }

  const numericRules = [
    ['households', { integer: true, min: 0 }],
    ['beneficiaries', { integer: true, min: 0 }],
    ['capacity', { min: 0 }],
    ['monthlyProductionCost', { min: 0 }],
    ['monthlyServiceRevenue', { min: 0 }],
    ['waterTariff', { min: 0 }]
  ];
  numericRules.forEach(function(item) {
    const parsed = plumbingParseOptionalNumberServer_(data[item[0]], item[1]);
    if (!parsed.ok) add(item[0], 'NUMERIC_INVALID', parsed.message);
    else data[item[0]] = parsed.value === null ? '' : parsed.value;
  });
  [['constructionYear', 'CONSTRUCTION_YEAR_INVALID'], ['transferYear', 'TRANSFER_YEAR_INVALID']].forEach(function(item) {
    const parsed = plumbingParseOptionalNumberServer_(data[item[0]], { integer: true });
    if (!parsed.ok) add(item[0], item[1], parsed.message);
    else data[item[0]] = parsed.value === null ? '' : parsed.value;
  });

  const rawTable = plumbingReadTable_(ss, PLUMBING_CONFIG.RAW_SHEET);
  const systemTypes = plumbingObservedMasterValues_(rawTable, 'system_type_raw');
  const ownershipValues = plumbingObservedMasterValues_(rawTable, 'owner_raw');
  if (data.systemType && systemTypes.indexOf(data.systemType) < 0) {
    add('systemType', 'SYSTEM_TYPE_NOT_ALLOWED', 'ประเภทระบบประปาไม่อยู่ในรายการอ้างอิงปัจจุบัน');
  }
  if (data.ownership && ownershipValues.indexOf(data.ownership) < 0) {
    add('ownership', 'OWNERSHIP_NOT_ALLOWED', 'เจ้าของกรรมสิทธิ์ไม่อยู่ในรายการอ้างอิงปัจจุบัน');
  }

  const recorder = request.recorder && typeof request.recorder === 'object' && !Array.isArray(request.recorder) ? request.recorder : {};
  data.recorder = {
    lineUserId: plumbingNormalizeText_(recorder.lineUserId),
    lineDisplayName: plumbingNormalizeText_(recorder.lineDisplayName)
  };

  return { valid: errors.length === 0, errors: errors, data: data };
}

function plumbingParseOptionalNumberServer_(value, options) {
  const opts = options || {};
  const raw = plumbingNormalizeText_(value);
  if (raw === '') return { ok: true, value: null, message: '' };
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return { ok: false, value: null, message: 'กรุณากรอกเป็นตัวเลข' };
  const number = Number(raw);
  if (!isFinite(number)) return { ok: false, value: null, message: 'ค่าตัวเลขไม่ถูกต้อง' };
  if (opts.integer && !Number.isInteger(number)) return { ok: false, value: null, message: 'กรุณากรอกเป็นจำนวนเต็ม' };
  if (typeof opts.min === 'number' && number < opts.min) return { ok: false, value: null, message: 'ค่าต้องไม่น้อยกว่า ' + opts.min };
  if (typeof opts.max === 'number' && number > opts.max) return { ok: false, value: null, message: 'ค่าต้องไม่มากกว่า ' + opts.max };
  return { ok: true, value: number, message: '' };
}

function plumbingParseCoordinateServer_(value, axis) {
  const parsed = plumbingParseOptionalNumberServer_(value, {});
  if (!parsed.ok || parsed.value === null) return { ok: false, value: null, message: 'กรุณาระบุพิกัดที่ถูกต้อง' };
  const min = axis === 'latitude' ? -90 : -180;
  const max = axis === 'latitude' ? 90 : 180;
  if (parsed.value < min || parsed.value > max) return { ok: false, value: null, message: axis === 'latitude' ? 'Latitude ต้องอยู่ระหว่าง -90 ถึง 90' : 'Longitude ต้องอยู่ระหว่าง -180 ถึง 180' };
  return { ok: true, value: parsed.value, message: '' };
}

function plumbingHttpUrlAllowed_(value) {
  const raw = plumbingNormalizeText_(value);
  if (!raw) return true;
  return /^https?:\/\//i.test(raw);
}

function plumbingPayloadFingerprint_(data) {
  const canonical = {
    systemName:data.systemName,serviceAgency:data.serviceAgency,systemType:data.systemType,ownership:data.ownership,responsibleOrganization:data.responsibleOrganization,
    province:data.province,district:data.district,tambon:data.tambon,localAuthority:data.localAuthority,communityType:data.communityType,dlaVillageCode:data.dlaVillageCode,
    villageMode:data.villageMode,villageIdRef:data.villageIdRef,villageName:data.villageName,moo:data.moo,
    coordinateMode:data.coordinateMode,latitude:data.latitude,longitude:data.longitude,missingCoordinateReason:data.missingCoordinateReason,missingCoordinateOther:data.missingCoordinateOther,
    waterSource:data.waterSource,waterSourceType:data.waterSourceType,surfaceWaterType:data.surfaceWaterType,surfaceWaterAgency:data.surfaceWaterAgency,
    constructionYear:data.constructionYear,capacity:data.capacity,households:data.households,beneficiaries:data.beneficiaries,usageTypes:data.usageTypes,
    yearRound:data.yearRound,availableMonths:data.availableMonths,operationalStatus:data.operationalStatus,drinkingQuality:data.drinkingQuality,
    qualityFailureCategories:data.qualityFailureCategories,qualityFailureReason:data.qualityFailureReason,waterQuantity:data.waterQuantity,waterPressure:data.waterPressure,
    hasSharedVillages:data.hasSharedVillages,sharedVillages:data.sharedVillages,establishmentType:data.establishmentType,relatedAgency:data.relatedAgency,
    transferYear:data.transferYear,transferAgency:data.transferAgency,transferDocumentStatus:data.transferDocumentStatus,transferDocumentUrl:data.transferDocumentUrl,
    monthlyProductionCost:data.monthlyProductionCost,monthlyServiceRevenue:data.monthlyServiceRevenue,waterTariff:data.waterTariff,note:data.note
  };
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(canonical), Utilities.Charset.UTF_8);
  return digest.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function plumbingLegacyUsageRawFromV2_(usageTypes) {
  const values = Array.isArray(usageTypes) ? usageTypes : [];
  if (values.length !== 1) return '';
  if (values[0] === 'เกษตร') return 'การเกษตร';
  if (values[0] === 'อุปโภค/บริโภค') return 'อุปโภคบริโภค';
  return '';
}

function plumbingBuildMainplumbingRowObject_(data, audit) {
  const nowYearBE = new Date().getFullYear() + 543;
  const age = data.constructionYear !== '' && typeof data.constructionYear === 'number' && data.constructionYear <= nowYearBE
    ? nowYearBE - data.constructionYear
    : '';
  const drinkingLegacy = data.drinkingQuality === 'ผ่านเกณฑ์'
    ? 'ผ่านเกณฑ์คุณภาพน้ำประปาดื่มได้'
    : (data.drinkingQuality === 'ไม่ผ่านเกณฑ์' ? 'ไม่ผ่านเกณฑ์คุณภาพน้ำประปาดื่มได้' : '');
  const sharedNames = (data.sharedVillages || []).map(function(item) {
    return item.villageName + (item.moo ? ' หมู่ ' + item.moo : '');
  }).join('; ');
  const yearRoundLabel = data.yearRound === 'yes' ? 'ตลอดปี' : (data.yearRound === 'no' ? 'ไม่ตลอดปี' : '');
  const villageModeCode = data.villageMode === 'existing' ? 'EXISTING' : 'NEW';
  const coordinateModeCode = data.coordinateMode === 'has-coordinate' ? 'HAS_COORDINATE' : 'NO_COORDINATE';
  const recorder = audit.recorder || {};
  const legacyUsageRaw = plumbingLegacyUsageRawFromV2_(data.usageTypes || []);

  return {
    source_excel_row:'', source_order:'', province:data.province, district:data.district, local_authority:data.localAuthority, village_name:data.villageName,
    pwa_households:'', mwa_households:'', commercial_households:'', other_village_pipe_households:'', waterbank_households:'', self_source_households:'', natural_source_households:'',
    village_waterworks_status_raw:'มีประปาหมู่บ้าน', water_from_raw:'', system_name_raw:data.systemName,
    latitude_raw:data.latitude === '' ? '' : data.latitude, longitude_raw:data.longitude === '' ? '' : data.longitude,
    owner_raw:data.ownership, agency_raw:data.responsibleOrganization, system_type_raw:data.systemType,
    capacity_m3_hr_raw:data.capacity, usage_type_raw:legacyUsageRaw, households_served_raw:data.households,
    construction_year_be_raw:data.constructionYear, system_age_years_raw:age, operational_status_raw:data.operationalStatus,
    utility_water_quality_raw:'', drinking_water_quality_raw:drinkingLegacy, water_quantity_raw:data.waterQuantity,
    shared_with_other_village_raw:data.hasSharedVillages === 'yes' ? 'มี' : (data.hasSharedVillages === 'no' ? 'ไม่มี' : ''),
    shared_village_name_raw:sharedNames, establishment_type_raw:data.establishmentType, establishment_agency_raw:data.relatedAgency,
    transfer_year_raw:data.transferYear, transfer_agency_raw:data.transferAgency, transfer_other_raw:'',
    transfer_document_raw:data.transferDocumentStatus, transfer_document_url_raw:data.transferDocumentUrl,

    record_id:audit.recordId, submission_id:audit.submissionId, form_version:PLUMBING_CONFIG.FORM_VERSION,
    submission_source:PLUMBING_CONFIG.SUBMISSION_SOURCE, received_at:audit.receivedAt,
    line_user_id_raw:plumbingNormalizeText_(recorder.lineUserId), line_display_name_raw:plumbingNormalizeText_(recorder.lineDisplayName),
    processing_status:'RECEIVED', processing_error:'', raw_sheet_row:audit.rawSheetRow,
    payload_fingerprint:audit.fingerprint, duplicate_warning_shown:Boolean(audit.duplicateWarningShown), duplicate_override:Boolean(audit.duplicateOverride),
    duplicate_candidate_count:audit.duplicateCandidateCount, duplicate_checked_at:audit.duplicateCheckedAt,
    village_mode:villageModeCode, village_id_ref:data.villageIdRef, subdistrict_raw:data.tambon, village_no_raw:data.moo, coordinate_mode:coordinateModeCode,
    missing_coordinate_reason_raw:data.missingCoordinateReason, missing_coordinate_other_raw:data.missingCoordinateOther,
    service_agency_raw:data.serviceAgency, system_water_source_raw:data.waterSource, system_water_source_type_raw:data.waterSourceType,
    beneficiaries_raw:data.beneficiaries, year_round_raw:yearRoundLabel, problem_months_json:'[]',
    quality_failure_reason_raw:data.qualityFailureReason, water_pressure_raw:data.waterPressure,
    shared_villages_json:JSON.stringify(data.sharedVillages || []), monthly_production_cost_raw:data.monthlyProductionCost,
    monthly_service_revenue_raw:data.monthlyServiceRevenue, water_tariff_raw:data.waterTariff, note_raw:data.note,
    raw_payload_json:JSON.stringify(data),

    usage_types_json:JSON.stringify(data.usageTypes || []), available_months_json:JSON.stringify(data.availableMonths || []),
    quality_failure_categories_json:JSON.stringify(data.qualityFailureCategories || []), quality_failure_detail_raw:data.qualityFailureReason,
    community_type_raw:data.communityType, dla_village_code_raw:data.dlaVillageCode,
    surface_water_type_raw:data.surfaceWaterType, surface_water_agency_raw:data.surfaceWaterAgency
  };
}

// ============================================================================
// Plumbing Form v1 — Checkpoint 9 Processor
// Server-side only. Writes villages + water_systems after raw is durable.
// This processor NEVER writes village_water_sources.
// ============================================================================

function processPlumbingSubmission(submissionId) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(30000);
    if (!locked) {
      return { success: false, code: 'BUSY', message: 'ระบบกำลังประมวลผลรายการอื่น กรุณาลองใหม่ภายหลัง' };
    }
    const normalizedSubmissionId = plumbingNormalizeText_(submissionId);
    if (!/^PLB-[0-9a-fA-F-]{20,}$/.test(normalizedSubmissionId)) {
      return { success: false, code: 'SUBMISSION_ID_INVALID', message: 'รหัสการส่งข้อมูลไม่ถูกต้อง' };
    }

    const ss = SpreadsheetApp.openById(PLUMBING_CONFIG.SPREADSHEET_ID);
    const rawSheet = ss.getSheetByName(PLUMBING_CONFIG.RAW_SHEET);
    if (!rawSheet) throw new Error('Missing sheet: ' + PLUMBING_CONFIG.RAW_SHEET);
    const headers = plumbingEnsureRawSchema_(rawSheet);
    const raw = plumbingFindSubmissionRow_(rawSheet, headers, normalizedSubmissionId);
    if (!raw) {
      return { success: false, code: 'SUBMISSION_NOT_FOUND', message: 'ไม่พบข้อมูลที่รับไว้สำหรับรหัสนี้' };
    }
    return plumbingProcessRawSubmissionLocked_(ss, rawSheet, headers, raw.sheetRow);
  } catch (error) {
    Logger.log('processPlumbingSubmission error: ' + error.toString());
    return { success: false, code: 'PROCESSOR_ERROR', message: 'ไม่สามารถประมวลผลข้อมูลประปารายการนี้ได้' };
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (ignore) {}
    }
  }
}

function plumbingProcessRawSubmissionLocked_(ss, rawSheet, headers, rawSheetRow) {
  let rawObject = null;
  try {
    rawObject = plumbingReadRawRowObject_(rawSheet, headers, rawSheetRow);
    const status = plumbingNormalizeText_(rawObject.processing_status);
    if (status === 'PROCESSED') {
      return {
        success: true,
        rawSaved: true,
        idempotent: true,
        processingStatus: 'PROCESSED',
        systemName: plumbingNormalizeText_(rawObject.system_name_raw),
        villageName: plumbingNormalizeText_(rawObject.village_name)
      };
    }

    plumbingUpdateRawFields_(rawSheet, headers, rawSheetRow, {
      processing_status: 'PROCESSING',
      processing_error: ''
    });
    rawObject = plumbingReadRawRowObject_(rawSheet, headers, rawSheetRow);

    const payload = plumbingParseRawPayloadForProcessing_(rawObject);
    const villageResult = plumbingResolveVillageForProcessing_(ss, rawSheet, headers, rawSheetRow, rawObject, payload);
    payload.sharedVillages = plumbingResolveSharedVillagesForProcessing_(ss, payload, villageResult.villageId);
    rawObject = plumbingReadRawRowObject_(rawSheet, headers, rawSheetRow);

    const systemResult = plumbingResolveSystemForProcessing_(ss, rawSheet, headers, rawSheetRow, rawObject, payload, villageResult.villageId);
    const completedAt = new Date();
    plumbingUpdateRawFields_(rawSheet, headers, rawSheetRow, {
      processing_status: 'PROCESSED',
      processing_error: '',
      processed_village_id: villageResult.villageId,
      processed_system_id: systemResult.systemId,
      processed_at: completedAt,
      processor_version: PLUMBING_PROCESSOR_VERSION
    });

    return {
      success: true,
      rawSaved: true,
      processingStatus: 'PROCESSED',
      systemName: plumbingNormalizeText_(rawObject.system_name_raw),
      villageName: plumbingNormalizeText_(rawObject.village_name),
      message: 'รับข้อมูลและประมวลผลเข้าสู่ฐานข้อมูลระบบประปาแล้ว'
    };
  } catch (error) {
    const safeError = plumbingProcessorErrorText_(error);
    try {
      plumbingUpdateRawFields_(rawSheet, headers, rawSheetRow, {
        processing_status: 'FAILED',
        processing_error: safeError,
        processor_version: PLUMBING_PROCESSOR_VERSION
      });
    } catch (statusError) {
      Logger.log('Processor status update failed: ' + statusError.toString());
    }
    Logger.log('plumbingProcessRawSubmissionLocked_ error row ' + rawSheetRow + ': ' + error.toString());
    return {
      success: true,
      rawSaved: true,
      processingStatus: 'FAILED',
      systemName: rawObject ? plumbingNormalizeText_(rawObject.system_name_raw) : '',
      villageName: rawObject ? plumbingNormalizeText_(rawObject.village_name) : '',
      message: 'รับข้อมูลแล้ว แต่ประมวลผลต่อมีปัญหา'
    };
  }
}
function plumbingProcessorErrorText_(error) {
  const text = plumbingNormalizeText_(error && error.message ? error.message : error);
  return text ? text.slice(0, 500) : 'UNKNOWN_PROCESSOR_ERROR';
}

function plumbingReadRawRowObject_(sheet, headers, sheetRow) {
  if (sheetRow < 2 || sheetRow > sheet.getLastRow()) throw new Error('RAW_ROW_OUT_OF_RANGE');
  const values = sheet.getRange(sheetRow, 1, 1, headers.length).getValues()[0];
  const object = {};
  headers.forEach(function(header, index) {
    if (header) object[header] = values[index];
  });
  return object;
}

function plumbingUpdateRawFields_(sheet, headers, sheetRow, updates) {
  Object.keys(updates || {}).forEach(function(header) {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error('Missing processor raw column: ' + header);
    sheet.getRange(sheetRow, index + 1).setValue(updates[header]);
  });
}

function plumbingParseRawPayloadForProcessing_(rawObject) {
  const json = plumbingNormalizeText_(rawObject.raw_payload_json);
  if (!json) throw new Error('RAW_PAYLOAD_MISSING');
  let payload;
  try {
    payload = JSON.parse(json);
  } catch (error) {
    throw new Error('RAW_PAYLOAD_INVALID_JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('RAW_PAYLOAD_INVALID');
  }
  return payload;
}

function plumbingResolveVillageForProcessing_(ss, rawSheet, headers, rawSheetRow, rawObject, payload) {
  const villagesSheet = ss.getSheetByName(PLUMBING_CONFIG.VILLAGES_SHEET);
  if (!villagesSheet) throw new Error('Missing sheet: ' + PLUMBING_CONFIG.VILLAGES_SHEET);
  const table = plumbingReadTable_(ss, PLUMBING_CONFIG.VILLAGES_SHEET);
  plumbingAssertVillageSchema_(table.headers);
  const reservedId = plumbingNormalizeText_(rawObject.processed_village_id);
  const mode = plumbingNormalizeText_(rawObject.village_mode);

  if (mode === 'EXISTING') {
    const villageId = plumbingNormalizeText_(rawObject.village_id_ref);
    if (!villageId) throw new Error('EXISTING_VILLAGE_ID_MISSING');
    const found = plumbingFindTableRowById_(table, 'village_id', villageId);
    if (!found) throw new Error('EXISTING_VILLAGE_NOT_FOUND');
    plumbingUpdateExistingVillageWaterworks_(villagesSheet, table.headers, found.sheetRow, found.object, payload);
    if (reservedId && reservedId !== villageId) throw new Error('RESERVED_VILLAGE_ID_CONFLICT');
    if (!reservedId) plumbingUpdateRawFields_(rawSheet, headers, rawSheetRow, { processed_village_id: villageId });
    return { villageId: villageId, created: false };
  }

  if (mode !== 'NEW') throw new Error('VILLAGE_MODE_INVALID_FOR_PROCESSOR');

  if (reservedId) {
    const existingReserved = plumbingFindTableRowById_(table, 'village_id', reservedId);
    if (existingReserved) {
      plumbingVerifyVillageIdentity_(existingReserved.object, payload);
      plumbingUpdateExistingVillageWaterworks_(villagesSheet, table.headers, existingReserved.sheetRow, existingReserved.object, payload);
      return { villageId: reservedId, created: false, resumed: true };
    }
    const exactAfterReservation = plumbingFindExactVillageObject_(table, payload);
    if (exactAfterReservation) {
      plumbingUpdateRawFields_(rawSheet, headers, rawSheetRow, { processed_village_id: exactAfterReservation.object.village_id });
      plumbingUpdateExistingVillageWaterworks_(villagesSheet, table.headers, exactAfterReservation.sheetRow, exactAfterReservation.object, payload);
      return { villageId: exactAfterReservation.object.village_id, created: false, resumed: true, matchedAtRetry: true };
    }
    const inserted = plumbingAppendNewVillage_(villagesSheet, table.headers, reservedId, payload);
    return { villageId: reservedId, created: true, resumed: true, sheetRow: inserted.sheetRow };
  }

  const exactExisting = plumbingFindExactVillageObject_(table, payload);
  if (exactExisting) {
    plumbingUpdateRawFields_(rawSheet, headers, rawSheetRow, { processed_village_id: exactExisting.object.village_id });
    plumbingUpdateExistingVillageWaterworks_(villagesSheet, table.headers, exactExisting.sheetRow, exactExisting.object, payload);
    return { villageId: exactExisting.object.village_id, created: false, matchedAtProcessor: true };
  }

  const newVillageId = plumbingGenerateNextReservedId_(
    ss, rawSheet, headers,
    PLUMBING_CONFIG.VILLAGES_SHEET, 'village_id', 'processed_village_id',
    /^PY-V-(\d{4,})$/, 'PY-V-', 4
  );
  plumbingUpdateRawFields_(rawSheet, headers, rawSheetRow, { processed_village_id: newVillageId });
  const inserted = plumbingAppendNewVillage_(villagesSheet, table.headers, newVillageId, payload);
  return { villageId: newVillageId, created: true, sheetRow: inserted.sheetRow };
}

function plumbingResolveSharedVillagesForProcessing_(ss, payload, primaryVillageId) {
  const rows = payload && Array.isArray(payload.sharedVillages) ? payload.sharedVillages : [];
  if (!rows.length) return [];

  const villagesSheet = ss.getSheetByName(PLUMBING_CONFIG.VILLAGES_SHEET);
  if (!villagesSheet) throw new Error('Missing sheet: ' + PLUMBING_CONFIG.VILLAGES_SHEET);
  let table = plumbingReadTable_(ss, PLUMBING_CONFIG.VILLAGES_SHEET);
  plumbingAssertVillageSchema_(table.headers);
  const resolved = [];
  const seen = {};

  rows.forEach(function(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('PROCESSOR_SHARED_VILLAGE_INVALID');
    const ref = plumbingNormalizeText_(row.villageIdRef);
    const mode = plumbingNormalizeText_(row.villageMode) || (ref ? 'existing' : 'new');
    let found = null;

    if (mode === 'existing') {
      if (!ref) throw new Error('PROCESSOR_SHARED_VILLAGE_ID_MISSING');
      found = plumbingFindTableRowById_(table, 'village_id', ref);
      if (!found) throw new Error('PROCESSOR_SHARED_VILLAGE_NOT_FOUND');
      plumbingVerifyVillageIdentity_(found.object, row);
    } else if (mode === 'new') {
      found = plumbingFindExactVillageObject_(table, row);
      if (!found) {
        const newVillageId = plumbingGenerateNextVillageIdFromTable_(table);
        plumbingAppendNewVillage_(villagesSheet, table.headers, newVillageId, row);
        table = plumbingReadTable_(ss, PLUMBING_CONFIG.VILLAGES_SHEET);
        found = plumbingFindTableRowById_(table, 'village_id', newVillageId);
        if (!found) throw new Error('PROCESSOR_SHARED_VILLAGE_CREATE_FAILED');
      }
    } else {
      throw new Error('PROCESSOR_SHARED_VILLAGE_MODE_INVALID');
    }

    const villageId = plumbingNormalizeText_(found.object.village_id);
    if (!villageId) throw new Error('PROCESSOR_SHARED_VILLAGE_ID_MISSING');
    if (villageId === plumbingNormalizeText_(primaryVillageId)) throw new Error('PROCESSOR_SHARED_VILLAGE_IS_PRIMARY');
    if (seen[villageId]) throw new Error('PROCESSOR_SHARED_VILLAGE_DUPLICATE');
    seen[villageId] = true;

    plumbingUpdateExistingVillageWaterworks_(villagesSheet, table.headers, found.sheetRow, found.object, row);
    table = plumbingReadTable_(ss, PLUMBING_CONFIG.VILLAGES_SHEET);
    const refreshed = plumbingFindTableRowById_(table, 'village_id', villageId);
    const object = refreshed ? refreshed.object : found.object;
    resolved.push({
      villageMode: 'existing',
      villageIdRef: villageId,
      district: plumbingNormalizeText_(object.district),
      tambon: plumbingNormalizeText_(object.subdistrict),
      localAuthority: plumbingNormalizeText_(object.local_authority),
      villageName: plumbingNormalizeText_(object.village_name),
      moo: plumbingNormalizeIntegerText_(object.village_no),
      communityType: plumbingNormalizeText_(row.communityType || object.community_type),
      dlaVillageCode: plumbingNormalizeText_(row.dlaVillageCode || object.dla_village_code)
    });
  });

  return resolved;
}

function plumbingGenerateNextVillageIdFromTable_(table) {
  const idIndex = plumbingHeaderIndex_(table.headers || [], 'village_id');
  let maxNumber = 0;
  (table.rows || []).forEach(function(row) {
    const match = plumbingNormalizeText_(row[idIndex]).match(/^PY-V-(\d{4,})$/);
    if (match) maxNumber = Math.max(maxNumber, Number(match[1]) || 0);
  });
  const next = String(maxNumber + 1);
  const reservedMax=(table.reservedIds||[]).reduce((n,id)=>{const m=String(id).match(/^PY-V-(\d{4,})$/);return Math.max(n,m?Number(m[1]):0);},maxNumber);
  return 'PY-V-' + String(reservedMax+1).padStart(4,'0');
}

function plumbingFindTableRowById_(table, idHeader, idValue) {
  const index = plumbingHeaderIndex_(table.headers || [], idHeader);
  for (let i = 0; i < (table.rows || []).length; i += 1) {
    if (plumbingNormalizeText_(table.rows[i][index]) === idValue) {
      return { sheetRow: i + 2, values: table.rows[i], object: plumbingRowObject_(table.headers, table.rows[i]) };
    }
  }
  return null;
}

function plumbingRowObject_(headers, row) {
  const object = {};
  (headers || []).forEach(function(header, index) { if (header) object[header] = row[index]; });
  return object;
}

function plumbingFindExactVillageObject_(table, payload) {
  const target = {
    province: plumbingNormalizeComparableText_(payload.province || PLUMBING_CONFIG.PROVINCE),
    district: plumbingNormalizeComparableText_(payload.district),
    subdistrict: plumbingNormalizeComparableText_(payload.tambon),
    localAuthority: plumbingNormalizeComparableText_(payload.localAuthority),
    moo: plumbingNormalizeIntegerText_(payload.moo),
    villageName: plumbingNormalizeComparableText_(payload.villageName)
  };
  for (let i = 0; i < (table.rows || []).length; i += 1) {
    const object = plumbingRowObject_(table.headers, table.rows[i]);
    const objectTambon = plumbingNormalizeComparableText_(object.subdistrict);
    const tambonCompatible = !target.subdistrict || !objectTambon || objectTambon === target.subdistrict;
    if (
      plumbingNormalizeComparableText_(object.province) === target.province &&
      plumbingNormalizeComparableText_(object.district) === target.district &&
      tambonCompatible &&
      plumbingNormalizeComparableText_(object.local_authority) === target.localAuthority &&
      plumbingNormalizeIntegerText_(object.village_no) === target.moo &&
      plumbingNormalizeComparableText_(object.village_name) === target.villageName
    ) return { sheetRow: i + 2, object: object };
  }
  return null;
}

function plumbingVerifyVillageIdentity_(object, payload) {
  const expected = {
    province: plumbingNormalizeComparableText_(payload.province || PLUMBING_CONFIG.PROVINCE),
    district: plumbingNormalizeComparableText_(payload.district),
    subdistrict: plumbingNormalizeComparableText_(payload.tambon),
    localAuthority: plumbingNormalizeComparableText_(payload.localAuthority),
    moo: plumbingNormalizeIntegerText_(payload.moo),
    villageName: plumbingNormalizeComparableText_(payload.villageName)
  };
  const objectTambon = plumbingNormalizeComparableText_(object.subdistrict);
  const tambonConflict = expected.subdistrict && objectTambon && objectTambon !== expected.subdistrict;
  if (
    plumbingNormalizeComparableText_(object.province) !== expected.province ||
    plumbingNormalizeComparableText_(object.district) !== expected.district ||
    tambonConflict ||
    plumbingNormalizeComparableText_(object.local_authority) !== expected.localAuthority ||
    plumbingNormalizeIntegerText_(object.village_no) !== expected.moo ||
    plumbingNormalizeComparableText_(object.village_name) !== expected.villageName
  ) throw new Error('RESERVED_VILLAGE_ID_IDENTITY_CONFLICT');
}

function plumbingUpdateExistingVillageWaterworks_(sheet, headers, sheetRow, currentObject, payload) {
  plumbingAssertVillageSchema_(headers);
  const current = currentObject || {};
  const changes = {};

  const alreadyTrue = current.has_village_waterworks === true || plumbingNormalizeComparableText_(current.has_village_waterworks) === 'true';
  if (!alreadyTrue) changes.has_village_waterworks = true;

  const enrichment = [
    ['subdistrict', plumbingNormalizeText_(payload && payload.tambon)],
    ['community_type', plumbingNormalizeText_(payload && payload.communityType)],
    ['dla_village_code', plumbingNormalizeText_(payload && payload.dlaVillageCode)]
  ];
  enrichment.forEach(function(item) {
    const header = item[0];
    const incoming = item[1];
    if (!incoming) return;
    const existing = plumbingNormalizeText_(current[header]);
    if (existing && plumbingNormalizeComparableText_(existing) !== plumbingNormalizeComparableText_(incoming)) {
      throw new Error('EXISTING_VILLAGE_ENRICHMENT_CONFLICT_' + header.toUpperCase());
    }
    if (!existing) changes[header] = incoming;
  });

  const changedHeaders = Object.keys(changes);
  if (!changedHeaders.length) return;
  changedHeaders.forEach(function(header) {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error('villages missing ' + header);
    sheet.getRange(sheetRow, index + 1).setValue(changes[header]);
  });
  const updatedIndex = headers.indexOf('updated_at');
  if (updatedIndex >= 0) sheet.getRange(sheetRow, updatedIndex + 1).setValue(new Date());
}

function plumbingAppendNewVillage_(sheet, headers, villageId, payload) {
  plumbingAssertVillageSchema_(headers);
  const rowObject = {
    village_id: villageId, source_excel_row: '', source_order: '',
    province: plumbingNormalizeText_(payload.province || PLUMBING_CONFIG.PROVINCE),
    district: plumbingNormalizeText_(payload.district),
    subdistrict: plumbingNormalizeText_(payload.tambon),
    local_authority: plumbingNormalizeText_(payload.localAuthority),
    village_no: plumbingNormalizeIntegerText_(payload.moo),
    village_name: plumbingNormalizeText_(payload.villageName),
    has_village_waterworks: true, water_from_raw: '',
    pwa_households: '', mwa_households: '', commercial_households: '',
    other_village_pipe_households: '', waterbank_households: '',
    self_source_households: '', natural_source_households: '',
    created_at: new Date(), updated_at: new Date(),
    community_type: plumbingNormalizeText_(payload.communityType),
    dla_village_code: plumbingNormalizeText_(payload.dlaVillageCode)
  };
  const values = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : '';
  });
  const sheetRow = sheet.getLastRow() + 1;
  sheet.getRange(sheetRow, 1, 1, headers.length).setValues([values]);
  return { sheetRow: sheetRow };
}

function plumbingResolveSystemForProcessing_(ss, rawSheet, headers, rawSheetRow, rawObject, payload, villageId) {
  const systemsSheet = ss.getSheetByName(PLUMBING_CONFIG.SYSTEMS_SHEET);
  if (!systemsSheet) throw new Error('Missing sheet: ' + PLUMBING_CONFIG.SYSTEMS_SHEET);
  let table = plumbingReadTable_(ss, PLUMBING_CONFIG.SYSTEMS_SHEET);
  plumbingAssertSystemSchema_(table.headers);
  const reservedId = plumbingNormalizeText_(rawObject.processed_system_id);
  if (reservedId) {
    let existingReserved = plumbingFindTableRowById_(table, 'system_id', reservedId);
    if (existingReserved) {
      plumbingVerifySystemIdentity_(existingReserved.object, villageId, payload);
      return { systemId: reservedId, created: false, resumed: true };
    }

    // A Management hard-delete may have physically removed the system while
    // its SYSTEM_DELETE audit is still PREPARED because the audit-commit write
    // was uncertain.  Resolve that deterministic state under the same
    // ScriptLock before deciding whether the old reservation may be reused.
    // The guard is optional so Feature 3 remains backward-compatible when the
    // Management v2 backend is not installed in this Apps Script project.
    if (typeof mgmtOpsRecoverPreparedDeletesLocked_ === 'function') {
      mgmtOpsRecoverPreparedDeletesLocked_(ss);

      // Recovery and direct Sheet edits can change the normalized table after
      // the first read. Re-read before the tombstone/append decision so a
      // restored or manually reintroduced stable ID cannot be duplicated.
      table = plumbingReadTable_(ss, PLUMBING_CONFIG.SYSTEMS_SHEET);
      plumbingAssertSystemSchema_(table.headers);
      existingReserved = plumbingFindTableRowById_(table, 'system_id', reservedId);
      if (existingReserved) {
        plumbingVerifySystemIdentity_(existingReserved.object, villageId, payload);
        return { systemId: reservedId, created: false, resumed: true };
      }
    }

    // Management v2 can hard-delete a normalized system while preserving the
    // original raw submission as immutable evidence. If somebody later
    // retries/resets that raw row, the old reservation must NOT resurrect an
    // intentionally deleted system. The COMMITTED SYSTEM_DELETE audit row is
    // the durable tombstone for that decision.
    if (plumbingHasCommittedManagementDeleteTombstone_(ss, reservedId)) {
      throw new Error('RESERVED_SYSTEM_ID_INTENTIONALLY_DELETED');
    }

    plumbingAppendNewSystem_(systemsSheet, table, reservedId, villageId, rawObject, payload);
    return { systemId: reservedId, created: true, resumed: true };
  }

  const newSystemId = plumbingGenerateNextReservedId_(
    ss, rawSheet, headers,
    PLUMBING_CONFIG.SYSTEMS_SHEET, 'system_id', 'processed_system_id',
    /^PY-W-(\d{6,})$/, 'PY-W-', 6
  );
  plumbingUpdateRawFields_(rawSheet, headers, rawSheetRow, { processed_system_id: newSystemId });
  plumbingAppendNewSystem_(systemsSheet, table, newSystemId, villageId, rawObject, payload);
  return { systemId: newSystemId, created: true };
}

function plumbingHasCommittedManagementDeleteTombstone_(ss, systemId) {
  const normalizedSystemId = plumbingNormalizeText_(systemId);
  if (!normalizedSystemId) return false;

  const auditSheet = ss.getSheetByName('audit_log');
  // Backward compatibility: Feature 3 existed before Management.  If the
  // Management audit sheet is not installed yet, preserve the original retry
  // behavior instead of breaking Feature 3.
  if (!auditSheet) return false;

  const lastRow = auditSheet.getLastRow();
  const lastColumn = auditSheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    throw new Error('MANAGEMENT_DELETE_AUDIT_SCHEMA_INVALID');
  }

  const headers = auditSheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return plumbingNormalizeText_(value);
  });
  const required = ['action', 'entity_type', 'entity_id', 'audit_status'];
  const counts = {};
  headers.forEach(function(header) {
    if (header) counts[header] = (counts[header] || 0) + 1;
  });
  required.forEach(function(header) {
    if ((counts[header] || 0) !== 1) {
      throw new Error('MANAGEMENT_DELETE_AUDIT_SCHEMA_INVALID');
    }
  });

  if (lastRow < 2) return false;
  const rows = auditSheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  return plumbingFindCommittedManagementDeleteTombstoneInRows_(headers, rows, normalizedSystemId);
}

function plumbingFindCommittedManagementDeleteTombstoneInRows_(headers, rows, systemId) {
  const normalizedSystemId = plumbingNormalizeText_(systemId);
  if (!normalizedSystemId) return false;
  const actionIndex = headers.indexOf('action');
  const entityTypeIndex = headers.indexOf('entity_type');
  const entityIdIndex = headers.indexOf('entity_id');
  const auditStatusIndex = headers.indexOf('audit_status');
  if (actionIndex < 0 || entityTypeIndex < 0 || entityIdIndex < 0 || auditStatusIndex < 0) {
    throw new Error('MANAGEMENT_DELETE_AUDIT_SCHEMA_INVALID');
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (plumbingNormalizeText_(row[actionIndex]).toUpperCase() !== 'SYSTEM_DELETE') continue;
    if (plumbingNormalizeText_(row[entityTypeIndex]).toUpperCase() !== 'WATER_SYSTEM') continue;
    if (plumbingNormalizeText_(row[entityIdIndex]) !== normalizedSystemId) continue;
    if (plumbingNormalizeText_(row[auditStatusIndex]).toUpperCase() !== 'COMMITTED') continue;
    return true;
  }
  return false;
}

function plumbingVerifySystemIdentity_(object, villageId, payload) {
  if (
    plumbingNormalizeText_(object.village_id) !== plumbingNormalizeText_(villageId) ||
    plumbingNormalizeComparableText_(object.system_name) !== plumbingNormalizeComparableText_(payload.systemName)
  ) throw new Error('RESERVED_SYSTEM_ID_IDENTITY_CONFLICT');
}

function plumbingGenerateNextReservedId_(ss, rawSheet, rawHeaders, downstreamSheetName, downstreamIdHeader, reservationHeader, pattern, prefix, width) {
  let maxNumber = 0;
  const downstream = plumbingReadTable_(ss, downstreamSheetName);
  const downstreamIndex = plumbingHeaderIndex_(downstream.headers || [], downstreamIdHeader);
  (downstream.rows || []).forEach(function(row) {
    const match = plumbingNormalizeText_(row[downstreamIndex]).match(pattern);
    if (match) maxNumber = Math.max(maxNumber, Number(match[1]) || 0);
  });
  const reservationIndex = rawHeaders.indexOf(reservationHeader);
  if (reservationIndex < 0) throw new Error('Missing reservation column: ' + reservationHeader);
  if (rawSheet.getLastRow() >= 2) {
    const values = rawSheet.getRange(2, reservationIndex + 1, rawSheet.getLastRow() - 1, 1).getValues();
    values.forEach(function(row) {
      const match = plumbingNormalizeText_(row[0]).match(pattern);
      if (match) maxNumber = Math.max(maxNumber, Number(match[1]) || 0);
    });
  }
  const next = String(maxNumber + 1);
  return prefix + ('000000000000' + next).slice(-Math.max(width, next.length));
}

function plumbingAppendNewSystem_(sheet, table, systemId, villageId, rawObject, payload) {
  const normalized = plumbingBuildNormalizedSystemRow_(table, systemId, villageId, rawObject, payload);
  const values = table.headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(normalized, header) ? normalized[header] : '';
  });
  const sheetRow = sheet.getLastRow() + 1;
  sheet.getRange(sheetRow, 1, 1, table.headers.length).setValues([values]);
  return { sheetRow: sheetRow };
}

function plumbingRawFormVersion_(rawObject) {
  const raw = plumbingNormalizeText_(rawObject && rawObject.form_version);
  if (!raw) return 1;
  const version = Number(raw);
  return isFinite(version) && version >= 1 ? Math.floor(version) : 1;
}

function plumbingParseJsonArrayForProcessor_(value, fieldName) {
  const raw = plumbingNormalizeText_(value);
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('PROCESSOR_JSON_INVALID_' + fieldName);
  }
  if (!Array.isArray(parsed)) throw new Error('PROCESSOR_JSON_NOT_ARRAY_' + fieldName);
  return parsed;
}

function plumbingCanonicalCodesForProcessor_(labels, labelToCode, fieldName) {
  const result = [];
  const seen = {};
  (labels || []).forEach(function(label) {
    const normalized = plumbingNormalizeText_(label);
    const code = labelToCode[normalized];
    if (!code) throw new Error('PROCESSOR_ENUM_INVALID_' + fieldName);
    if (seen[code]) throw new Error('PROCESSOR_ENUM_DUPLICATE_' + fieldName);
    seen[code] = true;
    result.push(code);
  });
  return result;
}

function plumbingNormalizeUsageTypesForProcessor_(rawObject, formVersion) {
  const map = {
    'เกษตร': 'AGRICULTURE',
    'การเกษตร': 'AGRICULTURE',
    'อุปโภค/บริโภค': 'DOMESTIC',
    'อุปโภคบริโภค': 'DOMESTIC'
  };
  if (formVersion >= 2) {
    return plumbingCanonicalCodesForProcessor_(
      plumbingParseJsonArrayForProcessor_(rawObject.usage_types_json, 'USAGE_TYPES'),
      map,
      'USAGE_TYPES'
    );
  }
  const legacy = plumbingNormalizeText_(rawObject.usage_type_raw);
  return legacy && map[legacy] ? [map[legacy]] : [];
}

function plumbingNormalizeQualityCategoriesForProcessor_(rawObject, formVersion) {
  if (formVersion < 2) return [];
  const map = {
    'คุณภาพน้ำด้านกายภาพ': 'PHYSICAL',
    'คุณภาพน้ำทางเคมีทั่วไป': 'GENERAL_CHEMICAL',
    'คุณภาพน้ำทางโลหะหนักทั่วไป': 'GENERAL_HEAVY_METALS',
    'คุณภาพน้ำทางโลหะหนักที่เป็นพิษ': 'TOXIC_HEAVY_METALS',
    'คุณภาพน้ำทางแบคทีเรีย': 'BACTERIA'
  };
  return plumbingCanonicalCodesForProcessor_(
    plumbingParseJsonArrayForProcessor_(rawObject.quality_failure_categories_json, 'QUALITY_FAILURE_CATEGORIES'),
    map,
    'QUALITY_FAILURE_CATEGORIES'
  );
}

function plumbingNormalizeAvailableMonthsForProcessor_(rawObject, formVersion) {
  if (formVersion < 2) return [];
  const map = {
    'มกราคม':'JAN','กุมภาพันธ์':'FEB','มีนาคม':'MAR','เมษายน':'APR','พฤษภาคม':'MAY','มิถุนายน':'JUN',
    'กรกฎาคม':'JUL','สิงหาคม':'AUG','กันยายน':'SEP','ตุลาคม':'OCT','พฤศจิกายน':'NOV','ธันวาคม':'DEC'
  };
  return plumbingCanonicalCodesForProcessor_(
    plumbingParseJsonArrayForProcessor_(rawObject.available_months_json, 'AVAILABLE_MONTHS'),
    map,
    'AVAILABLE_MONTHS'
  );
}

function plumbingNormalizeWaterPressure_(value) {
  const map = {
    'น้ำไหลตลอดเวลา': 'FLOW_CONTINUOUS',
    'น้ำไหลแรงเป็นบางเวลา': 'FLOW_STRONG_SOMETIMES',
    'น้ำไหลอ่อนตลอดเวลา': 'FLOW_WEAK_CONTINUOUS'
  };
  const text = plumbingNormalizeText_(value);
  return text ? (map[text] || 'UNKNOWN') : '';
}

function plumbingNormalizeYearRoundStatus_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'ตลอดปี' || text === 'yes') return 'YEAR_ROUND';
  if (text === 'ไม่ตลอดปี' || text === 'no') return 'SEASONAL';
  return '';
}

function plumbingNormalizeDlaWaterSourceType_(value, fallbackSystemType) {
  const text = plumbingNormalizeText_(value);
  if (text === 'แหล่งน้ำผิวดิน') return 'SURFACE_WATER';
  if (text === 'แหล่งน้ำใต้ดิน (บ่อน้ำบาดาล)') return 'GROUNDWATER';
  if (text === 'แหล่งน้ำผิวดินและแหล่งน้ำใต้ดิน') return 'MIXED';
  return plumbingNormalizeWaterSourceType_(fallbackSystemType);
}

function plumbingNormalizeSharedVillagesForProcessor_(value) {
  const rows = Array.isArray(value) ? value : plumbingParseJsonArrayForProcessor_(value, 'SHARED_VILLAGES');
  return rows.map(function(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('PROCESSOR_SHARED_VILLAGE_INVALID');
    return {
      village_id: plumbingNormalizeText_(item.villageIdRef || item.village_id),
      district: plumbingNormalizeText_(item.district),
      subdistrict: plumbingNormalizeText_(item.tambon || item.subdistrict),
      local_authority: plumbingNormalizeText_(item.localAuthority || item.local_authority),
      community_type: plumbingNormalizeText_(item.communityType || item.community_type),
      village_name: plumbingNormalizeText_(item.villageName || item.village_name),
      dla_village_code: plumbingNormalizeText_(item.dlaVillageCode || item.dla_village_code),
      village_no: plumbingNormalizeIntegerText_(item.moo || item.village_no)
    };
  });
}

function plumbingBuildNormalizedSystemRow_(systemsTable, systemId, villageId, rawObject, payload) {
  const formVersion = plumbingRawFormVersion_(rawObject);
  const systemType = plumbingNormalizeSystemType_(rawObject.system_type_raw);
  const constructionYearBE = plumbingOptionalIntegerForProcessor_(rawObject.construction_year_be_raw);
  const transferYearBE = plumbingOptionalIntegerForProcessor_(rawObject.transfer_year_raw);
  const usageTypes = plumbingNormalizeUsageTypesForProcessor_(rawObject, formVersion);
  const qualityCategories = plumbingNormalizeQualityCategoriesForProcessor_(rawObject, formVersion);
  const availableMonths = plumbingNormalizeAvailableMonthsForProcessor_(rawObject, formVersion);
  const sharedVillages = plumbingNormalizeSharedVillagesForProcessor_(payload && Array.isArray(payload.sharedVillages) ? payload.sharedVillages : rawObject.shared_villages_json);
  const now = new Date();

  const scalarUsageType = usageTypes.length === 1 ? usageTypes[0] : 'UNKNOWN';
  const qualityDetail = plumbingNormalizeText_(
    formVersion >= 2 ? (rawObject.quality_failure_detail_raw || rawObject.quality_failure_reason_raw) : rawObject.quality_failure_reason_raw
  );

  return {
    system_id: systemId, village_id: villageId, source_excel_row: '',
    system_no: plumbingNextSystemNo_(systemsTable, villageId),
    system_name: plumbingNormalizeText_(rawObject.system_name_raw || payload.systemName),
    latitude: plumbingOptionalNumberForProcessor_(rawObject.latitude_raw),
    longitude: plumbingOptionalNumberForProcessor_(rawObject.longitude_raw),
    owner_type: plumbingNormalizeOwnerType_(rawObject.owner_raw),
    responsible_agency: plumbingNormalizeText_(rawObject.agency_raw),
    system_type: systemType,
    water_source_type: formVersion >= 2
      ? plumbingNormalizeDlaWaterSourceType_(rawObject.system_water_source_type_raw, systemType)
      : plumbingNormalizeWaterSourceType_(systemType),
    capacity_m3_hr: plumbingOptionalNumberForProcessor_(rawObject.capacity_m3_hr_raw),
    usage_type: scalarUsageType,
    households_served: plumbingOptionalIntegerForProcessor_(rawObject.households_served_raw),
    construction_year_be: constructionYearBE,
    construction_year_ce: constructionYearBE !== '' && constructionYearBE >= 2400 ? constructionYearBE - 543 : '',
    operational_status: plumbingNormalizeOperationalStatus_(rawObject.operational_status_raw),
    utility_water_quality: plumbingNormalizeUtilityWaterQuality_(rawObject.utility_water_quality_raw),
    drinking_water_quality: plumbingNormalizeDrinkingQuality_(rawObject.drinking_water_quality_raw),
    water_quantity: plumbingNormalizeWaterQuantity_(rawObject.water_quantity_raw),
    shared_with_other_village: plumbingNormalizeSharedFlag_(rawObject.shared_with_other_village_raw),
    shared_village_name: plumbingNormalizeText_(rawObject.shared_village_name_raw),
    establishment_type: plumbingNormalizeEstablishmentType_(rawObject.establishment_type_raw),
    establishment_agency: plumbingNormalizeText_(rawObject.establishment_agency_raw),
    transfer_year_be: transferYearBE,
    transfer_agency: plumbingNormalizeText_(rawObject.transfer_agency_raw),
    transfer_other: plumbingNormalizeText_(rawObject.transfer_other_raw),
    transfer_document_status: plumbingNormalizeTransferDocumentStatus_(rawObject.transfer_document_raw),
    transfer_document_url: plumbingNormalizeText_(rawObject.transfer_document_url_raw),
    created_at: now, updated_at: now,

    usage_types_json: JSON.stringify(usageTypes),
    quality_failure_categories_json: JSON.stringify(qualityCategories),
    quality_failure_detail: qualityDetail,
    water_pressure: plumbingNormalizeWaterPressure_(rawObject.water_pressure_raw),
    year_round_status: plumbingNormalizeYearRoundStatus_(rawObject.year_round_raw),
    available_months_json: JSON.stringify(availableMonths),
    beneficiaries: plumbingOptionalIntegerForProcessor_(rawObject.beneficiaries_raw),
    monthly_production_cost: plumbingOptionalNumberForProcessor_(rawObject.monthly_production_cost_raw),
    monthly_service_revenue: plumbingOptionalNumberForProcessor_(rawObject.monthly_service_revenue_raw),
    water_tariff: plumbingOptionalNumberForProcessor_(rawObject.water_tariff_raw),
    service_agency: plumbingNormalizeText_(rawObject.service_agency_raw),
    water_source_detail: plumbingNormalizeText_(rawObject.system_water_source_raw),
    surface_water_type: formVersion >= 2 ? plumbingNormalizeText_(rawObject.surface_water_type_raw) : '',
    surface_water_agency: formVersion >= 2 ? plumbingNormalizeText_(rawObject.surface_water_agency_raw) : '',
    shared_villages_json: JSON.stringify(sharedVillages)
  };
}

function plumbingNextSystemNo_(systemsTable, villageId) {
  const villageIndex = plumbingHeaderIndex_(systemsTable.headers || [], 'village_id');
  const numberIndex = plumbingHeaderIndex_(systemsTable.headers || [], 'system_no');
  let maxNo = 0;
  (systemsTable.rows || []).forEach(function(row) {
    if (plumbingNormalizeText_(row[villageIndex]) !== villageId) return;
    const parsed = plumbingOptionalIntegerForProcessor_(row[numberIndex]);
    if (parsed !== '') maxNo = Math.max(maxNo, parsed);
  });
  return maxNo + 1;
}

function plumbingOptionalNumberForProcessor_(value) {
  if (value === null || value === undefined || plumbingNormalizeText_(value) === '') return '';
  const number = typeof value === 'number' ? value : Number(plumbingNormalizeText_(value));
  if (!isFinite(number)) throw new Error('PROCESSOR_NUMERIC_INVALID');
  return number;
}

function plumbingOptionalIntegerForProcessor_(value) {
  const number = plumbingOptionalNumberForProcessor_(value);
  if (number === '') return '';
  if (!Number.isInteger(number)) throw new Error('PROCESSOR_INTEGER_INVALID');
  return number;
}

function plumbingNormalizeOwnerType_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'อปท.') return 'LOCAL_AUTHORITY';
  if (text === 'หมู่บ้าน/หน่วยงานอื่นๆ') return 'VILLAGE_OR_OTHER';
  return 'UNKNOWN';
}

function plumbingNormalizeSystemType_(value) {
  const map = {
    'ประปาบาดาลขนาดเล็ก': 'GROUNDWATER_SMALL',
    'ประปาบาดาลขนาดกลาง': 'GROUNDWATER_MEDIUM',
    'ประปาบาดาลขนาดใหญ่': 'GROUNDWATER_LARGE',
    'ประปาผิวดินขนาดเล็ก': 'SURFACE_SMALL',
    'ประปาผิวดินขนาดกลาง': 'SURFACE_MEDIUM',
    'ประปาผิวดินขนาดใหญ่': 'SURFACE_LARGE',
    'ประปาผิวดินขนาดใหญ่มาก': 'SURFACE_VERY_LARGE'
  };
  return map[plumbingNormalizeText_(value)] || 'UNKNOWN';
}

function plumbingNormalizeWaterSourceType_(systemType) {
  if (/^GROUNDWATER_/.test(systemType)) return 'GROUNDWATER';
  if (/^SURFACE_/.test(systemType)) return 'SURFACE_WATER';
  return 'UNKNOWN';
}

function plumbingNormalizeUsageType_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'อุปโภคบริโภค' || text === 'อุปโภค/บริโภค') return 'DOMESTIC';
  if (text === 'การเกษตร' || text === 'เกษตร') return 'AGRICULTURE';
  return 'UNKNOWN';
}

function plumbingNormalizeOperationalStatus_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'ใช้การได้') return 'WORKING';
  if (text === 'ใช้การไม่ได้') return 'NOT_WORKING';
  return 'UNKNOWN';
}

function plumbingNormalizeUtilityWaterQuality_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'ใช้การได้') return 'USABLE';
  if (text === 'ใช้การไม่ได้') return 'NOT_USABLE';
  return 'UNKNOWN';
}

function plumbingNormalizeDrinkingQuality_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'ผ่านเกณฑ์คุณภาพน้ำประปาดื่มได้') return 'PASS';
  if (text === 'ไม่ผ่านเกณฑ์คุณภาพน้ำประปาดื่มได้') return 'FAIL';
  return 'NO_DATA';
}

function plumbingNormalizeWaterQuantity_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'เพียงพอ') return 'SUFFICIENT';
  if (text === 'ไม่เพียงพอ') return 'INSUFFICIENT';
  return 'NO_DATA';
}

function plumbingNormalizeSharedFlag_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'มี') return 'YES';
  if (text === 'ไม่มี') return 'NO';
  return 'UNKNOWN';
}

function plumbingNormalizeEstablishmentType_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'ถ่ายโอน') return 'TRANSFERRED';
  if (text === 'รับมอบตามระเบียบพัสดุ') return 'ACCEPTED_ASSET';
  if (text === 'อปท. จัดตั้ง/สร้างเอง') return 'LOCAL_CREATED';
  if (text === 'ไม่ใช่ทรัพย์สินของ อปท.') return 'NOT_LOCAL_AUTHORITY_ASSET';
  return 'UNKNOWN';
}

function plumbingNormalizeTransferDocumentStatus_(value) {
  const text = plumbingNormalizeText_(value);
  if (text === 'มี') return 'AVAILABLE';
  if (text === 'ไม่มี') return 'NOT_AVAILABLE';
  return 'NO_DATA';
}

/**
 * DashboardWaterResources -> Netlify Blob sync
 * READS the WaterResources sheet only. It does not modify sheet cells.
 *
 * Required Script Properties:
 *   WATER_DASHBOARD_SYNC_URL    e.g. https://YOUR-SITE.netlify.app/api/waterresources/sync
 *   WATER_DASHBOARD_SYNC_SECRET same secret as Netlify WATER_SYNC_SECRET
 */



return {validateSubmission:plumbingValidateIncomingSubmission_,fingerprint:plumbingPayloadFingerprint_,rawRow:plumbingBuildMainplumbingRowObject_,processLocked:plumbingProcessRawSubmissionLocked_,villageRecords:plumbingBuildVillageRecords_,locationMaster:plumbingBuildLocationMaster_,observedCatalog:plumbingBuildObservedMasterCatalog_,PLUMBING_CONFIG:PLUMBING_CONFIG};
})();

// Bundled unchanged module: backend/shared/processor.mjs
const __processor = (() => {
const {validateSubmission,fingerprint,rawRow,processLocked,villageRecords,locationMaster,observedCatalog} = __processor_source;
const {fail,stable} = __security;
class MemorySheet{
 constructor(name,headers,objects=[]){this.name=name;this.cells=[headers,...objects.map(o=>headers.map(k=>o[k]??''))];}
 getLastRow(){return this.cells.length;}getLastColumn(){return this.cells[0]?.length||0;}
 getRange(row,col,n=1,m=1){const self=this;return{getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.cells[row-1+i]?.[col-1+j]??'')),
 setValue(v){return this.setValues([[v]]);},setValues(values){if(values.length!==n||values.some(r=>r.length!==m))throw fail('INVALID_RANGE');for(let i=0;i<n;i++){self.cells[row-1+i]||=[];for(let j=0;j<m;j++)self.cells[row-1+i][col-1+j]=values[i][j];}return this;}};}
 getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn());}
 objects(){return this.cells.slice(1).map(r=>Object.fromEntries(this.cells[0].map((k,i)=>[k,r[i]??''])));}
}
function workbook(snapshot,columns){const sheets={};for(const n of['villages','water_systems','mainplumbing'])sheets[n]=new MemorySheet(n,columns[n],snapshot[n]||[]);
 for(const r of snapshot.reservedIds||[]){if(r.entity_type==='WATER_SYSTEM'&&!sheets.mainplumbing.objects().some(x=>x.processed_system_id===r.entity_id))sheets.mainplumbing.cells.push(columns.mainplumbing.map(k=>k==='processed_system_id'?r.entity_id:k==='processing_status'?'PROCESSED':''));}
 sheets.audit_log=new MemorySheet('audit_log',columns.audit_log,snapshot.tombstones||[]);return{getSheetByName:n=>sheets[n]||null,sheets,reservedIds:(snapshot.reservedIds||[]).filter(r=>r.entity_type==='VILLAGE').map(r=>r.entity_id)};}
const numeric=new Set(['latitude','longitude','capacity_m3_hr','monthly_production_cost','monthly_service_revenue','water_tariff','households_served','beneficiaries','construction_year_be','construction_year_ce','transfer_year_be','system_no','source_excel_row','source_order','village_no','pwa_households','mwa_households','commercial_households','other_village_pipe_households','waterbank_households','self_source_households','natural_source_households']);
const dbrow=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,v===''&&(numeric.has(k)||['created_at','updated_at'].includes(k))?null:v]));
function createProcessor({rpc,columns}){
 async function load(){return rpc('processor_read',{});}
 async function bootstrap(user){const s=await load();if(user?.role==='TECHNICIAN')s.villages=s.villages.filter(v=>v.district===user.district);const book=workbook(s,columns),villages=villageRecords({headers:columns.villages,rows:book.sheets.villages.cells.slice(1)});
  const catalog=observedCatalog({headers:columns.mainplumbing,rows:book.sheets.mainplumbing.cells.slice(1)});return{formVersion:2,province:'พะเยา',villages,location:locationMaster(villages),masterCatalog:catalog,pendingOfficialMasters:Object.keys(catalog).filter(k=>catalog[k].complete!==true),readyForProduction:false};}
 async function process(receiptId,user){for(let attempt=0;attempt<3;attempt++){
  const receipt=await rpc('processor_receipt',{receipt_id:receiptId});if(!receipt)throw fail('NOT_FOUND');
  if(user?.role==='TECHNICIAN'&&receipt.raw_payload.district!==user.district)throw fail('FORBIDDEN');
  if(receipt.status==='PROCESSED')return{rawSaved:true,processingStatus:'PROCESSED',receiptId,systemId:receipt.processed_system_id};
  const snapshot=await load(),book=workbook(snapshot,columns),sheet=book.sheets.mainplumbing;
  const index=sheet.objects().findIndex(o=>o.submission_id===receipt.submission_id);if(index<0)throw fail('DATA_INTEGRITY_CONFLICT');
  const before=new Map(book.sheets.villages.objects().map(v=>[v.village_id,JSON.stringify(stable(v))]));
  const result=processLocked(book,sheet,columns.mainplumbing,index+2);
  if(result.processingStatus!=='PROCESSED'){await rpc('processor_failure',{receipt_id:receiptId,code:'NORMALIZATION_FAILED'});return{rawSaved:true,processingStatus:'FAILED',receiptId};}
  const raw=sheet.objects()[index];
  const villages=book.sheets.villages.objects().filter(v=>JSON.stringify(stable(v))!==before.get(v.village_id)).map(dbrow);
  if(user?.role==='TECHNICIAN'&&villages.some(v=>v.district!==user.district))throw fail('FORBIDDEN');
  const system=book.sheets.water_systems.objects().find(s=>s.system_id===raw.processed_system_id);
  if(!system)throw fail('DATA_INTEGRITY_CONFLICT');
  const processingFields=Object.fromEntries(['processing_status','processing_error','processed_village_id','processed_system_id','processed_at','processor_version'].map(k=>[k,raw[k]]));
  try{return await rpc('processor_commit',{p:{receiptId,baseRevision:snapshot.revision,villages,system:dbrow(system),processingFields,...(user?.authTokenHash?{authTokenHash:user.authTokenHash}:{})}});}catch(e){if(!String(e.message).includes('CONFLICT')){await rpc('processor_failure',{receipt_id:receiptId,code:'COMMIT_FAILED'});throw e;}}
 }throw fail('CONFLICT');}
 return async(action,p,user)=>{
  // Only the authenticated Management boundary may invoke operational intake.
  if(!user?.authTokenHash)throw fail('SESSION_INVALID');
  if(action==='feature3.bootstrap')return bootstrap(user);
  if(action==='feature3.retry')return process(p.receiptId,user);
  const snapshot=await load(),book=workbook(snapshot,columns);const validation=validateSubmission(book,p.request||p);
  if(!validation.valid)throw Object.assign(fail('VALIDATION_FAILED'),{details:validation.errors});
  if(user?.role==='TECHNICIAN'&&validation.data.district!==user.district)throw fail('FORBIDDEN');
  const data=validation.data,hash=fingerprint(data),submissionId=p.submissionId||p.request?.submissionId;
  const raw=rawRow(data,{recordId:'REC-'+crypto.randomUUID(),submissionId,receivedAt:new Date().toISOString(),fingerprint:hash,rawSheetRow:'',duplicateCandidateCount:0,recorder:{}});
  const receipt=await rpc('intake',{p:{submissionId,hash,data,raw,...(user?.authTokenHash?{authTokenHash:user.authTokenHash}:{})}});return process(receipt.receiptId,user);
 };
}

return {MemorySheet:MemorySheet,workbook:workbook,createProcessor:createProcessor};
})();

// Bundled unchanged module: backend/shared/engine.mjs
const __engine = (() => {
const {MGMT_DATA,MGMT_MUTATION,buildIntended} = __canonical;
const {sha,requestHash,seal,open,jwtClaims,password,fail,knownError} = __security;
const {PUBLIC_FIELDS} = __public_fields;
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
 mid=begin.jobId||mid; // Resume the server-authoritative job after refresh.
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

return {intended:intended,publicProjection:publicProjection,createEngine:createEngine};
})();

const __columns = {"mainplumbing":["source_excel_row","source_order","province","district","local_authority","village_name","pwa_households","mwa_households","commercial_households","other_village_pipe_households","waterbank_households","self_source_households","natural_source_households","village_waterworks_status_raw","water_from_raw","system_name_raw","latitude_raw","longitude_raw","owner_raw","agency_raw","system_type_raw","capacity_m3_hr_raw","usage_type_raw","households_served_raw","construction_year_be_raw","system_age_years_raw","operational_status_raw","utility_water_quality_raw","drinking_water_quality_raw","water_quantity_raw","shared_with_other_village_raw","shared_village_name_raw","establishment_type_raw","establishment_agency_raw","transfer_year_raw","transfer_agency_raw","transfer_other_raw","transfer_document_raw","transfer_document_url_raw","record_id","submission_id","form_version","submission_source","received_at","line_user_id_raw","line_display_name_raw","processing_status","processing_error","raw_sheet_row","payload_fingerprint","duplicate_warning_shown","duplicate_override","duplicate_candidate_count","duplicate_checked_at","village_mode","village_id_ref","subdistrict_raw","village_no_raw","coordinate_mode","missing_coordinate_reason_raw","missing_coordinate_other_raw","service_agency_raw","system_water_source_raw","system_water_source_type_raw","beneficiaries_raw","year_round_raw","problem_months_json","quality_failure_reason_raw","water_pressure_raw","shared_villages_json","monthly_production_cost_raw","monthly_service_revenue_raw","water_tariff_raw","note_raw","raw_payload_json","processed_village_id","processed_system_id","processed_at","processor_version","usage_types_json","available_months_json","quality_failure_categories_json","quality_failure_detail_raw","community_type_raw","dla_village_code_raw","surface_water_type_raw","surface_water_agency_raw"],"villages":["village_id","source_excel_row","source_order","province","district","subdistrict","local_authority","village_no","village_name","has_village_waterworks","water_from_raw","pwa_households","mwa_households","commercial_households","other_village_pipe_households","waterbank_households","self_source_households","natural_source_households","created_at","updated_at","community_type","dla_village_code"],"water_systems":["system_id","village_id","source_excel_row","system_no","system_name","latitude","longitude","owner_type","responsible_agency","system_type","water_source_type","capacity_m3_hr","usage_type","households_served","construction_year_be","construction_year_ce","operational_status","utility_water_quality","drinking_water_quality","water_quantity","shared_with_other_village","shared_village_name","establishment_type","establishment_agency","transfer_year_be","transfer_agency","transfer_other","transfer_document_status","transfer_document_url","created_at","updated_at","usage_types_json","quality_failure_categories_json","quality_failure_detail","water_pressure","year_round_status","available_months_json","beneficiaries","monthly_production_cost","monthly_service_revenue","water_tariff","service_agency","water_source_detail","surface_water_type","surface_water_agency","shared_villages_json"],"village_water_sources":["source_id","village_id","source_excel_row","source_type","households"],"users":["user_id","username","password","display_name","role","status","must_change_password","failed_login_count","locked_until","password_changed_at","last_login_at","created_at","created_by","updated_at","updated_by","deleted_at","district"],"auth_sessions":["session_id","user_id","token_hash","created_at","expires_at","last_activity_at","revoked_at","client_info"],"audit_log":["audit_id","transaction_id","timestamp","user_id","username_snapshot","role_snapshot","action","entity_type","entity_id","sheet_name","before_json","after_json","changed_fields_json","reason","rollback_of_audit_id","client_info","audit_status","committed_at","error_code"],"record_control":["control_id","entity_type","entity_id","record_status","deleted_at","deleted_by","delete_reason","created_at","updated_at","updated_by"]};
const {supabase} = __supabase;
const {createEngine} = __engine;
const {createProcessor} = __processor;
const columns = __columns;
const env=Deno.env.toObject();const services=supabase(env);const processor=createProcessor({rpc:services.rpc,columns});const engine=createEngine({...services,env,processor});
const origins=new Set((env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
Deno.serve(async(req:Request)=>{const origin=req.headers.get('origin');if(origin&&!origins.has(origin))return new Response('Origin denied',{status:403});
 const cors:Record<string,string>=origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return new Response('Method denied',{status:405});
 const response=await engine.handle(req);for(const[k,v]of Object.entries(cors))response.headers.set(k,v);return response;});
