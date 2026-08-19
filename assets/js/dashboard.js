import { AppState } from './state.js';

const num = value => Number(value || 0).toLocaleString('th-TH');

export function renderDashboard() {
  const villages = AppState.filtered.villages;
  const systems = AppState.filtered.waterSystems;

  const withWaterworks = villages.filter(isWaterworksVillage).length;
  const withoutWaterworks = Math.max(0, villages.length - withWaterworks);

  const notWorking = systems.filter(
    s => s.operational_status === 'NOT_WORKING'
  ).length;

  const insufficient = systems.filter(
    s => s.water_quantity === 'INSUFFICIENT'
  ).length;

  const qualityFail = systems.filter(
    s => s.drinking_water_quality === 'FAIL'
  ).length;

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
