import { AppState } from './state.js';
import {
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

const SEARCH_INPUT_DEBOUNCE_MS = 180;
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
 * every other active filter. This keeps cross-filter charts switchable instead
 * of collapsing to only the currently selected bar/segment.
 */
export function buildFilteredSnapshot({ excludeKeys = [] } = {}) {
  const excluded = new Set(excludeKeys);
  const f = AppState.filters || {};

  const district = excluded.has('district') ? '' : String(f.district || '');
  const localAuthority = excluded.has('localAuthority') ? '' : String(f.localAuthority || '');
  const search = excluded.has('search') ? '' : normalizeSearchTerm(f.search);

  const areaVillages = AppState.data.villages
    .filter(village => !district || village.district === district)
    .filter(village => !localAuthority || village.local_authority === localAuthority);

  const areaVillageIds = new Set(areaVillages.map(village => village.village_id));
  const areaVillageById = new Map(areaVillages.map(village => [village.village_id, village]));

  const directlyMatchedVillageIds = new Set();
  if (search) {
    for (const village of areaVillages) {
      if (matchesVillageSearch(village, search)) directlyMatchedVillageIds.add(village.village_id);
    }
  }

  const filteredSystems = AppState.data.waterSystems
    .filter(system => areaVillageIds.has(system.village_id))
    .filter(system => {
      if (!search) return true;
      const village = areaVillageById.get(system.village_id);
      return directlyMatchedVillageIds.has(system.village_id) || matchesSystemSearch(system, village, search);
    })
    .filter(system => excluded.has('systemType') || !f.systemType || system.system_type === f.systemType)
    .filter(system => excluded.has('operationalStatus') || !f.operationalStatus || system.operational_status === f.operationalStatus)
    .filter(system => excluded.has('drinkingWaterQuality') || !f.drinkingWaterQuality || normalizeQuality(system.drinking_water_quality) === f.drinkingWaterQuality)
    .filter(system => excluded.has('waterQuantity') || !f.waterQuantity || normalizeQuantity(system.water_quantity) === f.waterQuantity);

  const hasSystemLevelFilter = ['systemType', 'operationalStatus', 'drinkingWaterQuality', 'waterQuantity']
    .some(key => !excluded.has(key) && Boolean(f[key]));
  const matchedSystemVillageIds = new Set(filteredSystems.map(system => system.village_id));

  let finalVillages = areaVillages;
  if (search || hasSystemLevelFilter) {
    finalVillages = areaVillages.filter(village => {
      if (hasSystemLevelFilter) return matchedSystemVillageIds.has(village.village_id);
      return directlyMatchedVillageIds.has(village.village_id) || matchedSystemVillageIds.has(village.village_id);
    });
  }

  const finalVillageIds = new Set(finalVillages.map(village => village.village_id));
  const waterSources = AppState.data.waterSources
    .filter(source => finalVillageIds.has(source.village_id));

  return {
    villages: finalVillages,
    waterSystems: filteredSystems,
    waterSources
  };
}

export function buildFilterOptions() {
  buildDistrictOptions();
  buildLocalAuthorityOptions();
  buildSystemTypeOptions();
  syncFilterControls();
  updateFilterUi();
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
}

/**
 * Central mutation path for dropdowns, search, chart cross-filters and chips.
 * Independent filters are preserved. District is the only parent filter, so a
 * district change clears Local Authority but does not silently clear system type,
 * status, quality, quantity or search.
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

  if (key === 'district') buildLocalAuthorityOptions();
  syncFilterControls();
  applyFilters();
  updateFilterUi();
  return resolved;
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

function includesSearchTerm(values, term) {
  return values.some(value => {
    if (value === '' || value === null || value === undefined) return false;
    return normalizeSearchTerm(value).includes(term);
  });
}

function buildDistrictOptions() {
  const select = typeof document !== 'undefined' ? document.getElementById('filterDistrict') : null;
  if (!select) return;
  const districts = uniqueSorted(AppState.data.villages.map(village => village.district));
  select.innerHTML = optionHtml('', 'ทั้งหมด') + districts.map(value => optionHtml(value, value)).join('');
}

function buildLocalAuthorityOptions() {
  const select = typeof document !== 'undefined' ? document.getElementById('filterLocalAuthority') : null;
  if (!select) return;
  const district = AppState.filters.district;
  const values = uniqueSorted(
    AppState.data.villages
      .filter(village => !district || village.district === district)
      .map(village => village.local_authority)
  );
  select.innerHTML = optionHtml('', 'ทั้งหมด') + values.map(value => optionHtml(value, value)).join('');
}

function buildSystemTypeOptions() {
  const select = typeof document !== 'undefined' ? document.getElementById('filterSystemType') : null;
  if (!select) return;

  // System type is an independent filter, not a child of District/Local Authority.
  // Keep the full option set available so changing area filters does not silently
  // drop an active type filter.
  const values = [...new Set(
    AppState.data.waterSystems
      .map(system => system.system_type)
      .filter(Boolean)
  )].sort((a, b) => systemTypeLabel(a).localeCompare(systemTypeLabel(b), 'th'));

  select.innerHTML = optionHtml('', 'ทั้งหมด') + values
    .map(value => optionHtml(value, systemTypeLabel(value)))
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
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'th'));
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
