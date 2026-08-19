/**
 * Presentation-layer dictionary for values normalized in Google Sheets.
 *
 * Rule: raw database codes and generated internal IDs are never rendered as
 * user-facing text. Add/adjust a mapping here instead of translating ad-hoc in
 * individual components.
 */

const ENUM_LABELS = Object.freeze({
  systemType: Object.freeze({
    GROUNDWATER_SMALL: 'ประปาบาดาลขนาดเล็ก',
    GROUNDWATER_MEDIUM: 'ประปาบาดาลขนาดกลาง',
    GROUNDWATER_LARGE: 'ประปาบาดาลขนาดใหญ่',
    SURFACE_SMALL: 'ประปาผิวดินขนาดเล็ก',
    SURFACE_MEDIUM: 'ประปาผิวดินขนาดกลาง',
    SURFACE_LARGE: 'ประปาผิวดินขนาดใหญ่',
    SURFACE_VERY_LARGE: 'ประปาผิวดินขนาดใหญ่มาก',
    UNKNOWN: 'ไม่ระบุประเภท'
  }),

  operationalStatus: Object.freeze({
    WORKING: 'ใช้การได้',
    NOT_WORKING: 'ใช้การไม่ได้',
    UNKNOWN: 'ไม่มีข้อมูล'
  }),

  drinkingWaterQuality: Object.freeze({
    PASS: 'ผ่านเกณฑ์',
    FAIL: 'ไม่ผ่านเกณฑ์',
    NO_DATA: 'ไม่มีข้อมูล',
    UNKNOWN: 'ไม่มีข้อมูล'
  }),

  waterQuantity: Object.freeze({
    SUFFICIENT: 'เพียงพอ',
    INSUFFICIENT: 'ไม่เพียงพอ',
    NO_DATA: 'ไม่มีข้อมูล',
    UNKNOWN: 'ไม่มีข้อมูล'
  }),

  waterSourceType: Object.freeze({
    GROUNDWATER: 'น้ำบาดาล',
    SURFACE_WATER: 'น้ำผิวดิน',
    SURFACE: 'น้ำผิวดิน',
    MIXED: 'แหล่งน้ำผสม',
    UNKNOWN: 'ไม่ระบุแหล่งน้ำ'
  }),

  ownerType: Object.freeze({
    LOCAL_AUTHORITY: 'องค์กรปกครองส่วนท้องถิ่น (อปท.)',
    VILLAGE_OR_OTHER: 'หมู่บ้าน / หน่วยงานอื่น',
    UNKNOWN: 'ไม่ระบุกรรมสิทธิ์'
  }),

  establishmentType: Object.freeze({
    LOCAL_CREATED: 'ท้องถิ่นก่อสร้างหรือจัดตั้งเอง',
    TRANSFERRED: 'ถ่ายโอนจากหน่วยงานอื่น',
    ACCEPTED_ASSET: 'รับมอบทรัพย์สิน',
    UNKNOWN: 'ไม่ระบุรูปแบบการจัดตั้ง'
  }),

  utilityWaterQuality: Object.freeze({
    USABLE: 'ใช้เพื่อการอุปโภคได้',
    NOT_USABLE: 'ใช้เพื่อการอุปโภคไม่ได้',
    UNKNOWN: 'ไม่มีข้อมูล'
  }),

  transferDocumentStatus: Object.freeze({
    AVAILABLE: 'มีเอกสาร',
    NOT_AVAILABLE: 'ไม่มีเอกสาร',
    NO_DATA: 'ไม่มีข้อมูล',
    UNKNOWN: 'ไม่มีข้อมูล'
  }),

  usageType: Object.freeze({
    DOMESTIC: 'อุปโภคบริโภค',
    AGRICULTURE: 'การเกษตร',
    UNKNOWN: 'ไม่ระบุการใช้งาน'
  }),

  sharedWithOtherVillage: Object.freeze({
    YES: 'ใช้ร่วมกับหมู่บ้านอื่น',
    NO: 'ไม่ได้ใช้ร่วมกับหมู่บ้านอื่น',
    UNKNOWN: 'ไม่มีข้อมูล'
  }),

  villageWaterSourceType: Object.freeze({
    PWA: 'การประปาส่วนภูมิภาค',
    MWA: 'การประปานครหลวง',
    COMMERCIAL: 'แหล่งน้ำเชิงพาณิชย์',
    OTHER_VILLAGE_PIPE: 'ประปาจากหมู่บ้านอื่น',
    WATERBANK: 'ธนาคารน้ำ',
    SELF_SOURCE: 'แหล่งน้ำของครัวเรือน',
    NATURAL_SOURCE: 'แหล่งน้ำธรรมชาติ'
  })
});

const DEFAULTS = Object.freeze({
  systemType: 'ไม่ระบุประเภท',
  operationalStatus: 'ไม่มีข้อมูล',
  drinkingWaterQuality: 'ไม่มีข้อมูล',
  waterQuantity: 'ไม่มีข้อมูล',
  waterSourceType: 'ไม่ระบุแหล่งน้ำ',
  ownerType: 'ไม่ระบุกรรมสิทธิ์',
  establishmentType: 'ไม่ระบุรูปแบบการจัดตั้ง',
  utilityWaterQuality: 'ไม่มีข้อมูล',
  transferDocumentStatus: 'ไม่มีข้อมูล',
  usageType: 'ไม่ระบุการใช้งาน',
  sharedWithOtherVillage: 'ไม่มีข้อมูล',
  villageWaterSourceType: 'ไม่ระบุแหล่งน้ำ'
});

export function enumLabel(domain, value) {
  const fallback = DEFAULTS[domain] || 'ไม่ระบุ';
  if (isBlank(value) || value === '-') return fallback;

  const normalized = String(value).trim();
  const mapped = ENUM_LABELS[domain]?.[normalized];
  if (mapped) return mapped;

  // Some legacy/source records may already contain a Thai/free-text label.
  // Preserve readable text, but never expose a normalized database token.
  if (isInternalId(normalized) || looksLikeDatabaseCode(normalized)) return fallback;
  return normalized;
}

export const systemTypeLabel = value => enumLabel('systemType', value);
export const operationalStatusLabel = value => enumLabel('operationalStatus', value);
export const qualityLabel = value => enumLabel('drinkingWaterQuality', value);
export const quantityLabel = value => enumLabel('waterQuantity', value);
export const waterSourceTypeLabel = value => enumLabel('waterSourceType', value);
export const ownerTypeLabel = value => enumLabel('ownerType', value);
export const establishmentTypeLabel = value => enumLabel('establishmentType', value);
export const utilityWaterQualityLabel = value => enumLabel('utilityWaterQuality', value);
export const transferDocumentStatusLabel = value => enumLabel('transferDocumentStatus', value);
export const usageTypeLabel = value => enumLabel('usageType', value);
export const sharedWithOtherVillageLabel = value => enumLabel('sharedWithOtherVillage', value);
export const villageWaterSourceTypeLabel = value => enumLabel('villageWaterSourceType', value);

export function normalizeQuality(value) {
  return isBlank(value) || value === '-' ? 'NO_DATA' : String(value).trim();
}

export function normalizeQuantity(value) {
  return isBlank(value) || value === '-' ? 'NO_DATA' : String(value).trim();
}

export function normalizeOperationalStatus(value) {
  return isBlank(value) || value === '-' ? 'UNKNOWN' : String(value).trim();
}

/**
 * Human-readable system name. Generated IDs are deliberately excluded.
 */
export function systemDisplayName(system, village = null) {
  const rawName = String(system?.system_name || '').trim();
  if (rawName && !isInternalId(rawName) && !looksLikeDatabaseCode(rawName)) {
    return rawName;
  }

  const villageName = villageDisplayName(village, '');
  return villageName ? `ระบบประปา ${villageName}` : 'ระบบประปาหมู่บ้าน';
}

export function villageDisplayName(village, fallback = 'ไม่ระบุชื่อหมู่บ้าน') {
  const rawName = String(village?.village_name || '').trim();
  if (rawName && !isInternalId(rawName) && !looksLikeDatabaseCode(rawName)) {
    return rawName;
  }
  return fallback;
}

/**
 * Sanitize arbitrary user-facing scalar text when a record can contain either
 * free text or a technical placeholder. This does not translate enum fields;
 * enumLabel()/specific mappers must be used for those.
 */
export function safeDisplayText(value, fallback = '-') {
  if (isBlank(value)) return fallback;
  const text = String(value).trim();
  if (!text || isInternalId(text) || looksLikeDatabaseCode(text)) return fallback;
  return text;
}

export function isInternalId(value) {
  if (isBlank(value)) return false;
  return /^PY-[A-Z0-9]+-\d+$/i.test(String(value).trim());
}

export function looksLikeDatabaseCode(value) {
  if (isBlank(value)) return false;
  const text = String(value).trim();
  // Normalized enums are ASCII uppercase tokens. Include short codes such as
  // PWA/MWA while avoiding mixed-case UI acronyms like Dashboard/GIS.
  return /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(text) && text.length >= 2;
}

export function presentationDictionary() {
  // QA/introspection only. Return copies so callers cannot mutate source maps.
  return Object.fromEntries(
    Object.entries(ENUM_LABELS).map(([domain, values]) => [domain, { ...values }])
  );
}

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}
