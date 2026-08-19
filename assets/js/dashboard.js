import { AppState } from './state.js';
import { buildFilteredSnapshot } from './filters.js';
import { normalizeQuality, normalizeQuantity } from './labels.js';

const num = value => Number(value || 0).toLocaleString('th-TH');

export function renderDashboard() {
  const villages = AppState.filtered.villages;
  const systems = AppState.filtered.waterSystems;

  const withWaterworks = villages.filter(isWaterworksVillage).length;
  const withoutWaterworks = Math.max(0, villages.length - withWaterworks);

  const {
    notWorking,
    insufficient,
    qualityFail
  } = getMonitoringIssueCounts();

  const watchlistTotal = new Set(
    systems
      .filter(isWatchSystem)
      .map(s => s.system_id)
  ).size;

  setText('kpiVillages', num(villages.length));
  setText('kpiWithWaterworks', num(withWaterworks));
  setText('kpiWithoutWaterworks', num(withoutWaterworks));
  setText('kpiSystems', num(systems.length));

  setText('alertNotWorking', num(notWorking));
  setText('alertInsufficient', num(insufficient));
  setText('alertQualityFail', num(qualityFail));
  setText('watchlistTotal', num(watchlistTotal));
}

/**
 * Monitoring cards are both summary metrics and filter controls. Each count is
 * faceted: it ignores only its own filter dimension while honoring every other
 * active filter. This makes the number describe the result the user would get
 * by selecting that card, even when the same dropdown currently has another
 * value selected.
 */
export function getMonitoringIssueCounts() {
  const operationalScope = buildFilteredSnapshot({ excludeKeys: ['operationalStatus'] }).waterSystems;
  const quantityScope = buildFilteredSnapshot({ excludeKeys: ['waterQuantity'] }).waterSystems;
  const qualityScope = buildFilteredSnapshot({ excludeKeys: ['drinkingWaterQuality'] }).waterSystems;

  return {
    notWorking: operationalScope.filter(system => system.operational_status === 'NOT_WORKING').length,
    insufficient: quantityScope.filter(system => normalizeQuantity(system.water_quantity) === 'INSUFFICIENT').length,
    qualityFail: qualityScope.filter(system => normalizeQuality(system.drinking_water_quality) === 'FAIL').length
  };
}

function isWaterworksVillage(village) {
  return village.has_village_waterworks === true ||
         village.has_village_waterworks === 1 ||
         village.has_village_waterworks === '1' ||
         village.has_village_waterworks === 'YES' ||
         village.has_village_waterworks === 'มีประปาหมู่บ้าน';
}

function isWatchSystem(system) {
  return system.operational_status === 'NOT_WORKING' ||
         system.water_quantity === 'INSUFFICIENT' ||
         system.drinking_water_quality === 'FAIL';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
