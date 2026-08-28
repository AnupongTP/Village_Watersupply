import { AppState } from './state.js';
import {
  normalizeOperationalStatus,
  normalizeQuality,
  normalizeQuantity,
  systemTypeLabel,
  operationalStatusLabel,
  qualityLabel,
  quantityLabel,
  waterSourceTypeLabel,
  ownerTypeLabel
} from './labels.js';

const FILTER_KEYS = Object.freeze([
  'search',
  'district',
  'localAuthority',
  'systemType',
  'operationalStatus',
  'drinkingWaterQuality',
  'waterQuantity'
]);

const SYSTEM_FILTER_KEYS = Object.freeze([
  'systemType',
  'operationalStatus',
  'drinkingWaterQuality',
  'waterQuantity'
]);

const SEARCH_INPUT_DEBOUNCE_MS = 180;
const FILTER_TOGGLE_SELECTOR = '[data-filter-toggle-key][data-filter-toggle-value]';
let searchTimer = 0;

export function applyFilters() {
  const snapshot = buildFilteredSnapshot();
  AppState.filtered.villages = snapshot.villages;
  AppState.filtered.waterSystems = snapshot.waterSystems;
  AppState.filtered.waterSources = snapshot.waterSources;
  return snapshot;
}

/**
 * Produce a deterministic filtered snapshot without mutating AppState.filtered.
 * Charts use excludeKeys to render their own full dimension while still honoring
 * every other active filter.
 */
export function buildFilteredSnapshot({ excludeKeys = [] } = {}) {
  return buildFilteredSnapshotFrom(
    AppState.data,
    AppState.filters,
    { excludeKeys, ignoreSearch: false }
  );
}

/**
 * Derive dropdown choices from the accepted Public Dataset and the CURRENT AREA /
 * OTHER SYSTEM FILTERS.
 *
 * Rules:
 * - District: all districts that still exist in public village data.
 * - Local Authority: only authorities in the selected district.
 * - System Type: current area + status + quality + quantity, self-excluding type.
 * - Status: current area + type + quality + quantity, self-excluding status.
 * - Drinking Quality: current area + type + status + quantity, self-excluding quality.
 * - Water Quantity: current area + type + status + quality, self-excluding quantity.
 * - Free-text Search does not shrink dropdown choices; Search remains an
 *   independent AND filter on the rendered dashboard.
 * - An already-active system value may remain visible even when OTHER system
 *   filters make the combination zero, so the state is never hidden from the user.
 *   Area changes are handled separately by reconcileAreaInvalidFilters().
 */
export function deriveFacetedFilterOptions(
  data = AppState.data,
  filters = AppState.filters
) {
  const safeData = normalizeDataShape(data);
  const safeFilters = normalizeFilterShape(filters);
  const areaFilters = { ...safeFilters, search: '' };

  const districts = uniqueSorted(
    safeData.villages.map(village => village?.district)
  );

  const localAuthorities = uniqueSorted(
    safeData.villages
      .filter(village => !areaFilters.district || village?.district === areaFilters.district)
      .map(village => village?.local_authority)
  );

  const systemTypes = optionValuesForSystemDimension(
    safeData,
    areaFilters,
    'systemType',
    system => normalizeSystemType(system?.system_type),
    systemTypeLabel
  );

  const operationalStatuses = optionValuesForSystemDimension(
    safeData,
    areaFilters,
    'operationalStatus',
    system => normalizeOperationalStatus(system?.operational_status),
    operationalStatusLabel
  );

  const drinkingWaterQualities = optionValuesForSystemDimension(
    safeData,
    areaFilters,
    'drinkingWaterQuality',
    system => normalizeQuality(system?.drinking_water_quality),
    qualityLabel
  );

  const waterQuantities = optionValuesForSystemDimension(
    safeData,
    areaFilters,
    'waterQuantity',
    system => normalizeQuantity(system?.water_quantity),
    quantityLabel
  );

  return {
    districts,
    localAuthorities,
    systemTypes,
    operationalStatuses,
    drinkingWaterQualities,
    waterQuantities
  };
}

/**
 * Upstream area changes must not leave a hidden/stale system filter behind.
 *
 * This reconciliation is intentionally AREA-BASED only. It does not break the
 * existing AND semantics between independent system dimensions. Example:
 * Status + Quality may still intentionally produce zero when both values exist
 * somewhere in the selected area but no single system has both.
 */
export function reconcileAreaInvalidFilters(
  data = AppState.data,
  filters = AppState.filters
) {
  const safeData = normalizeDataShape(data);
  const next = normalizeFilterShape(filters);

  const districts = new Set(
    safeData.villages
      .map(village => normalizeTextValue(village?.district))
      .filter(Boolean)
  );

  if (next.district && !districts.has(next.district)) {
    next.district = '';
    next.localAuthority = '';
  }

  const authorities = new Set(
    safeData.villages
      .filter(village => !next.district || village?.district === next.district)
      .map(village => normalizeTextValue(village?.local_authority))
      .filter(Boolean)
  );

  if (next.localAuthority && !authorities.has(next.localAuthority)) {
    next.localAuthority = '';
  }

  const areaSystems = systemsInArea(safeData, next);

  for (const key of SYSTEM_FILTER_KEYS) {
    const active = String(next[key] || '');
    if (!active) continue;

    const available = new Set(
      areaSystems
        .map(system => normalizedSystemFilterValue(key, system))
        .filter(Boolean)
    );

    if (!available.has(active)) next[key] = '';
  }

  return next;
}

export function buildFilterOptions() {
  const reconciled = reconcileAreaInvalidFilters(AppState.data, AppState.filters);
  Object.assign(AppState.filters, reconciled);

  const options = deriveFacetedFilterOptions(AppState.data, AppState.filters);

  replaceSelectOptions('filterDistrict', options.districts, value => value);
  replaceSelectOptions('filterLocalAuthority', options.localAuthorities, value => value);
  replaceSelectOptions('filterSystemType', options.systemTypes, systemTypeLabel);
  replaceSelectOptions('filterOperationalStatus', options.operationalStatuses, operationalStatusLabel);
  replaceSelectOptions('filterDrinkingWaterQuality', options.drinkingWaterQualities, qualityLabel);
  replaceSelectOptions('filterWaterQuantity', options.waterQuantities, quantityLabel);

  syncFilterControls();
  updateFilterUi();
  return options;
}

export function bindFilterEvents(onChange) {
  const search = document.getElementById('filterSearch');
  const district = document.getElementById('filterDistrict');
  const localAuthority = document.getElementById('filterLocalAuthority');
  const systemType = document.getElementById('filterSystemType');
  const operationalStatus = document.getElementById('filterOperationalStatus');
  const drinkingQuality = document.getElementById('filterDrinkingWaterQuality');
  const waterQuantity = document.getElementById('filterWaterQuantity');
  const clearButton = typeof document !== 'undefined' ? document.getElementById('btnClearFilters') : null;
  const chips = document.getElementById('activeFilterChips');
  const monitoringFilters = document.getElementById('alerts');

  search?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      setFilterValue('search', search.value);
      onChange();
    }, SEARCH_INPUT_DEBOUNCE_MS);
  });

  district?.addEventListener('change', () => {
    setFilterValue('district', district.value);
    onChange();
  });

  localAuthority?.addEventListener('change', () => {
    setFilterValue('localAuthority', localAuthority.value);
    onChange();
  });

  systemType?.addEventListener('change', () => {
    setFilterValue('systemType', systemType.value);
    onChange();
  });

  operationalStatus?.addEventListener('change', () => {
    setFilterValue('operationalStatus', operationalStatus.value);
    onChange();
  });

  drinkingQuality?.addEventListener('change', () => {
    setFilterValue('drinkingWaterQuality', drinkingQuality.value);
    onChange();
  });

  waterQuantity?.addEventListener('change', () => {
    setFilterValue('waterQuantity', waterQuantity.value);
    onChange();
  });

  clearButton?.addEventListener('click', () => {
    window.clearTimeout(searchTimer);
    clearFilters();
    buildFilterOptions();
    applyFilters();
    onChange();
  });

  chips?.addEventListener('click', event => {
    const button = event.target.closest('[data-filter-remove]');
    if (!button || !chips.contains(button)) return;
    const key = button.dataset.filterRemove;
    if (!FILTER_KEYS.includes(key)) return;
    setFilterValue(key, '');
    onChange();
  });

  monitoringFilters?.addEventListener('click', event => {
    const button = event.target.closest(FILTER_TOGGLE_SELECTOR);
    if (!button || !monitoringFilters.contains(button) || button.disabled) return;

    const key = button.dataset.filterToggleKey;
    const value = String(button.dataset.filterToggleValue || '');
    if (!FILTER_KEYS.includes(key) || !value) return;

    setFilterValue(key, value, { toggle: true });
    onChange();
  });
}

/**
 * Central mutation path for dropdowns, Search, chart cross-filters, Monitoring
 * quick filters and chips.
 *
 * District remains the parent of Local Authority. Changing District clears Local
 * Authority immediately. After every mutation the option lists are rebuilt so
 * unavailable alternatives disappear from the UI.
 */
export function setFilterValue(key, value, { toggle = false } = {}) {
  if (!FILTER_KEYS.includes(key)) throw new Error(`Unknown filter key: ${key}`);

  const next = key === 'search'
    ? String(value ?? '').trim()
    : String(value ?? '');
  const current = String(AppState.filters[key] || '');
  const resolved = toggle && current === next ? '' : next;

  if (key === 'district' && current !== resolved) {
    AppState.filters.localAuthority = '';
  }

  AppState.filters[key] = resolved;

  buildFilterOptions();
  applyFilters();
  updateFilterUi();
  return String(AppState.filters[key] || '');
}

export function clearFilters() {
  Object.assign(AppState.filters, {
    search: '',
    district: '',
    localAuthority: '',
    systemType: '',
    operationalStatus: '',
    drinkingWaterQuality: '',
    waterQuantity: ''
  });
}

export function activeFilterCount() {
  return FILTER_KEYS.filter(key => Boolean(String(AppState.filters[key] || '').trim())).length;
}

export function normalizeSearchTerm(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('th-TH')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesVillageSearch(village, normalizedTerm) {
  const term = normalizeSearchTerm(normalizedTerm);
  if (!term) return true;

  return includesSearchTerm([
    village?.village_name,
    village?.district,
    village?.subdistrict,
    village?.local_authority,
    village?.province
  ], term);
}

export function matchesSystemSearch(system, village, normalizedTerm) {
  const term = normalizeSearchTerm(normalizedTerm);
  if (!term) return true;

  return includesSearchTerm([
    system?.system_name,
    village?.village_name,
    village?.district,
    village?.subdistrict,
    village?.local_authority,
    system?.responsible_agency,
    system?.establishment_agency,
    system?.transfer_agency,
    system?.shared_village_name,
    systemTypeLabel(system?.system_type),
    operationalStatusLabel(system?.operational_status),
    qualityLabel(system?.drinking_water_quality),
    quantityLabel(system?.water_quantity),
    waterSourceTypeLabel(system?.water_source_type),
    ownerTypeLabel(system?.owner_type)
  ], term);
}

function buildFilteredSnapshotFrom(
  data,
  filters,
  { excludeKeys = [], ignoreSearch = false } = {}
) {
  const safeData = normalizeDataShape(data);
  const f = normalizeFilterShape(filters);
  const excluded = new Set(excludeKeys);

  const district = excluded.has('district') ? '' : String(f.district || '');
  const localAuthority = excluded.has('localAuthority') ? '' : String(f.localAuthority || '');
  const search = ignoreSearch || excluded.has('search') ? '' : normalizeSearchTerm(f.search);

  const areaVillages = safeData.villages
    .filter(village => !district || village?.district === district)
    .filter(village => !localAuthority || village?.local_authority === localAuthority);

  const areaVillageIds = new Set(areaVillages.map(village => village?.village_id));
  const areaVillageById = new Map(areaVillages.map(village => [village?.village_id, village]));

  const directlyMatchedVillageIds = new Set();
  if (search) {
    for (const village of areaVillages) {
      if (matchesVillageSearch(village, search)) directlyMatchedVillageIds.add(village?.village_id);
    }
  }

  const filteredSystems = safeData.waterSystems
    .filter(system => areaVillageIds.has(system?.village_id))
    .filter(system => {
      if (!search) return true;
      const village = areaVillageById.get(system?.village_id);
      return directlyMatchedVillageIds.has(system?.village_id) ||
        matchesSystemSearch(system, village, search);
    })
    .filter(system => excluded.has('systemType') ||
      !f.systemType ||
      normalizeSystemType(system?.system_type) === f.systemType)
    .filter(system => excluded.has('operationalStatus') ||
      !f.operationalStatus ||
      normalizeOperationalStatus(system?.operational_status) === f.operationalStatus)
    .filter(system => excluded.has('drinkingWaterQuality') ||
      !f.drinkingWaterQuality ||
      normalizeQuality(system?.drinking_water_quality) === f.drinkingWaterQuality)
    .filter(system => excluded.has('waterQuantity') ||
      !f.waterQuantity ||
      normalizeQuantity(system?.water_quantity) === f.waterQuantity);

  const hasSystemLevelFilter = SYSTEM_FILTER_KEYS
    .some(key => !excluded.has(key) && Boolean(f[key]));
  const matchedSystemVillageIds = new Set(filteredSystems.map(system => system?.village_id));

  let finalVillages = areaVillages;
  if (search || hasSystemLevelFilter) {
    finalVillages = areaVillages.filter(village => {
      if (hasSystemLevelFilter) return matchedSystemVillageIds.has(village?.village_id);
      return directlyMatchedVillageIds.has(village?.village_id) ||
        matchedSystemVillageIds.has(village?.village_id);
    });
  }

  const finalVillageIds = new Set(finalVillages.map(village => village?.village_id));
  const waterSources = safeData.waterSources
    .filter(source => finalVillageIds.has(source?.village_id));

  return {
    villages: finalVillages,
    waterSystems: filteredSystems,
    waterSources
  };
}

function optionValuesForSystemDimension(data, filters, key, normalizer, labelFn) {
  const snapshot = buildFilteredSnapshotFrom(
    data,
    filters,
    { excludeKeys: [key], ignoreSearch: true }
  );

  const values = snapshot.waterSystems
    .map(system => normalizer(system))
    .map(normalizeTextValue)
    .filter(Boolean);

  const active = String(filters[key] || '');
  if (active && !values.includes(active) && isSystemValuePresentInArea(data, filters, key, active)) {
    values.push(active);
  }

  return uniqueSortedByLabel(values, labelFn);
}

function isSystemValuePresentInArea(data, filters, key, value) {
  if (!value) return false;
  return systemsInArea(data, filters)
    .some(system => normalizedSystemFilterValue(key, system) === value);
}

function systemsInArea(data, filters) {
  const safeData = normalizeDataShape(data);
  const f = normalizeFilterShape(filters);

  const villageIds = new Set(
    safeData.villages
      .filter(village => !f.district || village?.district === f.district)
      .filter(village => !f.localAuthority || village?.local_authority === f.localAuthority)
      .map(village => village?.village_id)
  );

  return safeData.waterSystems.filter(system => villageIds.has(system?.village_id));
}

function normalizedSystemFilterValue(key, system) {
  if (key === 'systemType') return normalizeSystemType(system?.system_type);
  if (key === 'operationalStatus') return normalizeOperationalStatus(system?.operational_status);
  if (key === 'drinkingWaterQuality') return normalizeQuality(system?.drinking_water_quality);
  if (key === 'waterQuantity') return normalizeQuantity(system?.water_quantity);
  return '';
}

function normalizeSystemType(value) {
  if (value === '' || value === null || value === undefined || value === '-') return '';
  return String(value).trim();
}

function normalizeDataShape(data) {
  return {
    villages: Array.isArray(data?.villages) ? data.villages : [],
    waterSystems: Array.isArray(data?.waterSystems) ? data.waterSystems : [],
    waterSources: Array.isArray(data?.waterSources) ? data.waterSources : []
  };
}

function normalizeFilterShape(filters) {
  return {
    search: String(filters?.search || ''),
    district: String(filters?.district || ''),
    localAuthority: String(filters?.localAuthority || ''),
    systemType: String(filters?.systemType || ''),
    operationalStatus: String(filters?.operationalStatus || ''),
    drinkingWaterQuality: String(filters?.drinkingWaterQuality || ''),
    waterQuantity: String(filters?.waterQuantity || '')
  };
}

function includesSearchTerm(values, term) {
  return values.some(value => {
    if (value === '' || value === null || value === undefined) return false;
    return normalizeSearchTerm(value).includes(term);
  });
}

function replaceSelectOptions(id, values, labelFn) {
  const select = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (!select) return;

  select.innerHTML = optionHtml('', 'ทั้งหมด') + values
    .map(value => optionHtml(value, labelFn(value)))
    .join('');
}

function syncFilterControls() {
  setValue('filterSearch', AppState.filters.search);
  setValue('filterDistrict', AppState.filters.district);
  setValue('filterLocalAuthority', AppState.filters.localAuthority);
  setValue('filterSystemType', AppState.filters.systemType);
  setValue('filterOperationalStatus', AppState.filters.operationalStatus);
  setValue('filterDrinkingWaterQuality', AppState.filters.drinkingWaterQuality);
  setValue('filterWaterQuantity', AppState.filters.waterQuantity);
}

function updateFilterUi() {
  const filters = AppState.filters;
  const count = activeFilterCount();

  const countEl = typeof document !== 'undefined' ? document.getElementById('filterCount') : null;
  if (countEl) countEl.textContent = String(count);

  const clearButton = typeof document !== 'undefined' ? document.getElementById('btnClearFilters') : null;
  if (clearButton) clearButton.disabled = count === 0;

  const scopeEl = typeof document !== 'undefined' ? document.getElementById('scopeLabel') : null;
  if (scopeEl) {
    if (filters.localAuthority) {
      scopeEl.textContent = `${filters.localAuthority}${filters.district ? ` • อ.${filters.district}` : ''}`;
    } else if (filters.district) {
      scopeEl.textContent = `อ.${filters.district} จังหวัดพะเยา`;
    } else {
      scopeEl.textContent = 'จังหวัดพะเยา';
    }
  }

  renderActiveFilterChips();
  syncDeclarativeFilterToggles();
}

function syncDeclarativeFilterToggles() {
  if (typeof document === 'undefined') return;

  document.querySelectorAll(FILTER_TOGGLE_SELECTOR).forEach(control => {
    const key = control.dataset.filterToggleKey;
    const value = String(control.dataset.filterToggleValue || '');
    const pressed = FILTER_KEYS.includes(key) &&
      value &&
      String(AppState.filters[key] || '') === value;
    control.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  });
}

function renderActiveFilterChips() {
  const root = typeof document !== 'undefined' ? document.getElementById('activeFilterChips') : null;
  if (!root) return;

  const chips = filterChipRows();
  if (!chips.length) {
    root.classList.add('hidden');
    root.innerHTML = '';
    return;
  }

  root.classList.remove('hidden');
  root.innerHTML = `
    <span class="text-[10px] font-semibold text-slate-400">ตัวกรองที่ใช้งาน</span>
    ${chips.map(({ key, text }) => `
      <button
        class="btn btn-outline"
        type="button"
        data-filter-remove="${escapeHtml(key)}"
        aria-label="ล้างตัวกรอง ${escapeHtml(text)}"
      >
        <span>${escapeHtml(text)}</span>
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>`).join('')}`;
}

function filterChipRows() {
  const f = AppState.filters;
  const rows = [];

  if (f.search) rows.push({ key: 'search', text: `ค้นหา: “${f.search}”` });
  if (f.district) rows.push({ key: 'district', text: `อำเภอ: ${f.district}` });
  if (f.localAuthority) rows.push({ key: 'localAuthority', text: `อปท.: ${f.localAuthority}` });
  if (f.systemType) rows.push({ key: 'systemType', text: `ประเภทระบบ: ${systemTypeLabel(f.systemType)}` });
  if (f.operationalStatus) rows.push({ key: 'operationalStatus', text: `สถานะ: ${operationalStatusLabel(f.operationalStatus)}` });
  if (f.drinkingWaterQuality) rows.push({ key: 'drinkingWaterQuality', text: `คุณภาพน้ำดื่ม: ${qualityLabel(f.drinkingWaterQuality)}` });
  if (f.waterQuantity) rows.push({ key: 'waterQuantity', text: `ความเพียงพอของน้ำ: ${quantityLabel(f.waterQuantity)}` });

  return rows;
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizeTextValue).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'th'));
}

function uniqueSortedByLabel(values, labelFn) {
  return [...new Set(values.map(normalizeTextValue).filter(Boolean))]
    .sort((a, b) => String(labelFn(a)).localeCompare(String(labelFn(b)), 'th'));
}

function normalizeTextValue(value) {
  if (value === '' || value === null || value === undefined) return '';
  return String(value).trim();
}

function optionHtml(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function setValue(id, value) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (el) el.value = value || '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
