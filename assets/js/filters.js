import { AppState } from './state.js';
import { normalizeQuality, systemTypeLabel } from './labels.js';

export function applyFilters() {
  const f = AppState.filters;

  const areaVillages = AppState.data.villages
    .filter(v => !f.district || v.district === f.district)
    .filter(v => !f.localAuthority || v.local_authority === f.localAuthority);

  const areaVillageIds = new Set(areaVillages.map(v => v.village_id));

  const filteredSystems = AppState.data.waterSystems
    .filter(s => areaVillageIds.has(s.village_id))
    .filter(s => !f.systemType || s.system_type === f.systemType)
    .filter(s => !f.operationalStatus || s.operational_status === f.operationalStatus)
    .filter(s => !f.drinkingWaterQuality || normalizeQuality(s.drinking_water_quality) === f.drinkingWaterQuality);

  const hasSystemLevelFilter = Boolean(
    f.systemType || f.operationalStatus || f.drinkingWaterQuality
  );

  let finalVillages = areaVillages;
  if (hasSystemLevelFilter) {
    const matchedVillageIds = new Set(filteredSystems.map(s => s.village_id));
    finalVillages = areaVillages.filter(v => matchedVillageIds.has(v.village_id));
  }

  const finalVillageIds = new Set(finalVillages.map(v => v.village_id));

  AppState.filtered.villages = finalVillages;
  AppState.filtered.waterSystems = filteredSystems;
  AppState.filtered.waterSources = AppState.data.waterSources
    .filter(source => finalVillageIds.has(source.village_id));
}

export function buildFilterOptions() {
  buildDistrictOptions();
  buildLocalAuthorityOptions();
  buildSystemTypeOptions();
  syncFilterControls();
  updateFilterUi();
}

export function bindFilterEvents(onChange) {
  const district = document.getElementById('filterDistrict');
  const localAuthority = document.getElementById('filterLocalAuthority');
  const systemType = document.getElementById('filterSystemType');
  const operationalStatus = document.getElementById('filterOperationalStatus');
  const drinkingQuality = document.getElementById('filterDrinkingWaterQuality');
  const clearButton = document.getElementById('btnClearFilters');

  district?.addEventListener('change', () => {
    AppState.filters.district = district.value;
    AppState.filters.localAuthority = '';
    AppState.filters.systemType = '';
    buildLocalAuthorityOptions();
    buildSystemTypeOptions();
    syncFilterControls();
    applyFilters();
    updateFilterUi();
    onChange();
  });

  localAuthority?.addEventListener('change', () => {
    AppState.filters.localAuthority = localAuthority.value;
    AppState.filters.systemType = '';
    buildSystemTypeOptions();
    syncFilterControls();
    applyFilters();
    updateFilterUi();
    onChange();
  });

  systemType?.addEventListener('change', () => {
    AppState.filters.systemType = systemType.value;
    applyFilters();
    updateFilterUi();
    onChange();
  });

  operationalStatus?.addEventListener('change', () => {
    AppState.filters.operationalStatus = operationalStatus.value;
    applyFilters();
    updateFilterUi();
    onChange();
  });

  drinkingQuality?.addEventListener('change', () => {
    AppState.filters.drinkingWaterQuality = drinkingQuality.value;
    applyFilters();
    updateFilterUi();
    onChange();
  });

  clearButton?.addEventListener('click', () => {
    clearFilters();
    buildFilterOptions();
    applyFilters();
    onChange();
  });
}

export function clearFilters() {
  Object.assign(AppState.filters, {
    district: '',
    localAuthority: '',
    systemType: '',
    operationalStatus: '',
    drinkingWaterQuality: ''
  });
}

function buildDistrictOptions() {
  const select = document.getElementById('filterDistrict');
  if (!select) return;
  const districts = uniqueSorted(AppState.data.villages.map(v => v.district));
  select.innerHTML = optionHtml('', 'ทั้งหมด') + districts.map(v => optionHtml(v, v)).join('');
}

function buildLocalAuthorityOptions() {
  const select = document.getElementById('filterLocalAuthority');
  if (!select) return;
  const district = AppState.filters.district;
  const values = uniqueSorted(
    AppState.data.villages
      .filter(v => !district || v.district === district)
      .map(v => v.local_authority)
  );
  select.innerHTML = optionHtml('', 'ทั้งหมด') + values.map(v => optionHtml(v, v)).join('');
}

function buildSystemTypeOptions() {
  const select = document.getElementById('filterSystemType');
  if (!select) return;
  const f = AppState.filters;
  const villageIds = new Set(
    AppState.data.villages
      .filter(v => !f.district || v.district === f.district)
      .filter(v => !f.localAuthority || v.local_authority === f.localAuthority)
      .map(v => v.village_id)
  );

  const values = [...new Set(
    AppState.data.waterSystems
      .filter(s => villageIds.has(s.village_id))
      .map(s => s.system_type)
      .filter(Boolean)
  )].sort((a, b) => systemTypeLabel(a).localeCompare(systemTypeLabel(b), 'th'));

  select.innerHTML = optionHtml('', 'ทั้งหมด') + values
    .map(value => optionHtml(value, systemTypeLabel(value)))
    .join('');
}

function syncFilterControls() {
  setValue('filterDistrict', AppState.filters.district);
  setValue('filterLocalAuthority', AppState.filters.localAuthority);
  setValue('filterSystemType', AppState.filters.systemType);
  setValue('filterOperationalStatus', AppState.filters.operationalStatus);
  setValue('filterDrinkingWaterQuality', AppState.filters.drinkingWaterQuality);
}

function updateFilterUi() {
  const filters = AppState.filters;
  const count = [
    filters.district,
    filters.localAuthority,
    filters.systemType,
    filters.operationalStatus,
    filters.drinkingWaterQuality
  ].filter(Boolean).length;

  const countEl = document.getElementById('filterCount');
  if (countEl) countEl.textContent = String(count);

  const scopeEl = document.getElementById('scopeLabel');
  if (scopeEl) {
    if (filters.localAuthority) {
      scopeEl.textContent = `${filters.localAuthority}${filters.district ? ` • อ.${filters.district}` : ''}`;
    } else if (filters.district) {
      scopeEl.textContent = `อ.${filters.district} จังหวัดพะเยา`;
    } else {
      scopeEl.textContent = 'จังหวัดพะเยา';
    }
  }
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'th'));
}

function optionHtml(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function setValue(id, value) {
  const el = document.getElementById(id);
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
