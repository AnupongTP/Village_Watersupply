import { AppState } from './state.js';
import { buildFilteredSnapshot, setFilterValue } from './filters.js';
import { normalizeQuality, normalizeQuantity, systemTypeLabel } from './labels.js';

let districtChart;
let qualityChart;
let quantityChart;
let systemTypeChart;
let narrowMode = window.matchMedia('(max-width: 767px)').matches;
let resizeTimer;
let filterChangeHandler = () => {};

const COLORS = {
  blue: '#0284c7',
  cyan: '#0891b2',
  green: '#059669',
  red: '#dc2626',
  amber: '#d97706',
  gray: '#94a3b8'
};

const FILLS = {
  blue: 'rgba(2, 132, 199, .72)',
  blueDim: 'rgba(2, 132, 199, .18)',
  cyan: 'rgba(8, 145, 178, .68)',
  cyanDim: 'rgba(8, 145, 178, .18)',
  green: 'rgba(5, 150, 105, .82)',
  greenDim: 'rgba(5, 150, 105, .18)',
  red: 'rgba(220, 38, 38, .82)',
  redDim: 'rgba(220, 38, 38, .18)',
  amber: 'rgba(217, 119, 6, .82)',
  amberDim: 'rgba(217, 119, 6, .18)',
  gray: 'rgba(148, 163, 184, .82)',
  grayDim: 'rgba(148, 163, 184, .18)'
};

export function bindChartFilterEvents(onChange) {
  filterChangeHandler = typeof onChange === 'function' ? onChange : () => {};
}

window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const next = window.matchMedia('(max-width: 767px)').matches;
    if (next !== narrowMode && AppState.data.waterSystems.length) {
      narrowMode = next;
      renderCharts();
    }
  }, 160);
}, { passive: true });

export function renderCharts() {
  if (typeof Chart === 'undefined') return;
  renderDistrictChart();
  renderQualityChart();
  renderQuantityChart();
  renderSystemTypeChart();
}

function renderDistrictChart() {
  // District is the parent of Local Authority, so exclude both from this chart's
  // own distribution. Other active filters/search still constrain the counts.
  const snapshot = buildFilteredSnapshot({ excludeKeys: ['district', 'localAuthority'] });
  const villageCounts = countVillagesByDistrict(snapshot.villages);
  const systemCounts = countSystemsByDistrict(snapshot.waterSystems);
  const labels = uniqueSorted([...Object.keys(villageCounts), ...Object.keys(systemCounts)]);
  const selected = AppState.filters.district;
  const empty = labels.length === 0;
  setChartEmpty('districtChart', empty);
  destroyChart(districtChart);
  districtChart = null;
  if (empty) return;

  const selectedIndex = labels.indexOf(selected);
  const indexAxis = narrowMode ? 'y' : 'x';
  districtChart = new Chart(document.getElementById('districtChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'หมู่บ้าน',
          data: labels.map(label => villageCounts[label] || 0),
          backgroundColor: labels.map(label => selected ? (label === selected ? FILLS.blue : FILLS.blueDim) : FILLS.blue),
          borderColor: COLORS.blue,
          borderWidth: labels.map((_, index) => selectedIndex === index ? 2 : 1),
          borderRadius: 5,
          maxBarThickness: 34
        },
        {
          label: 'ระบบประปา',
          data: labels.map(label => systemCounts[label] || 0),
          backgroundColor: labels.map(label => selected ? (label === selected ? FILLS.cyan : FILLS.cyanDim) : FILLS.cyan),
          borderColor: COLORS.cyan,
          borderWidth: labels.map((_, index) => selectedIndex === index ? 2 : 1),
          borderRadius: 5,
          maxBarThickness: 34
        }
      ]
    },
    options: baseCartesianOptions({
      indexAxis,
      legend: true,
      onElementClick: (_datasetIndex, index) => toggleChartFilter('district', labels[index])
    })
  });
}

function renderQualityChart() {
  const snapshot = buildFilteredSnapshot({ excludeKeys: ['drinkingWaterQuality'] });
  const systems = snapshot.waterSystems;
  const empty = systems.length === 0;
  setChartEmpty('qualityChart', empty);
  destroyChart(qualityChart);
  qualityChart = null;
  if (empty) return;

  const codes = ['PASS', 'FAIL', 'NO_DATA'];
  const values = countByNormalizedValue(systems, 'drinking_water_quality', normalizeQuality, codes);
  const selected = AppState.filters.drinkingWaterQuality;
  const baseFills = [FILLS.green, FILLS.red, FILLS.gray];
  const dimFills = [FILLS.greenDim, FILLS.redDim, FILLS.grayDim];

  qualityChart = new Chart(document.getElementById('qualityChart'), {
    type: 'doughnut',
    data: {
      labels: ['ผ่านเกณฑ์', 'ไม่ผ่านเกณฑ์', 'ไม่มีข้อมูล'],
      datasets: [{
        data: codes.map(code => values[code] || 0),
        backgroundColor: codes.map((code, index) => selected ? (code === selected ? baseFills[index] : dimFills[index]) : baseFills[index]),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 4
      }]
    },
    options: doughnutOptions((_datasetIndex, index) => toggleChartFilter('drinkingWaterQuality', codes[index]))
  });
}

function renderQuantityChart() {
  const snapshot = buildFilteredSnapshot({ excludeKeys: ['waterQuantity'] });
  const systems = snapshot.waterSystems;
  const empty = systems.length === 0;
  setChartEmpty('quantityChart', empty);
  destroyChart(quantityChart);
  quantityChart = null;
  if (empty) return;

  const codes = ['SUFFICIENT', 'INSUFFICIENT', 'NO_DATA'];
  const values = countByNormalizedValue(systems, 'water_quantity', normalizeQuantity, codes);
  const selected = AppState.filters.waterQuantity;
  const baseFills = [FILLS.blue, FILLS.amber, FILLS.gray];
  const dimFills = [FILLS.blueDim, FILLS.amberDim, FILLS.grayDim];

  quantityChart = new Chart(document.getElementById('quantityChart'), {
    type: 'doughnut',
    data: {
      labels: ['เพียงพอ', 'ไม่เพียงพอ', 'ไม่มีข้อมูล'],
      datasets: [{
        data: codes.map(code => values[code] || 0),
        backgroundColor: codes.map((code, index) => selected ? (code === selected ? baseFills[index] : dimFills[index]) : baseFills[index]),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 4
      }]
    },
    options: doughnutOptions((_datasetIndex, index) => toggleChartFilter('waterQuantity', codes[index]))
  });
}

function renderSystemTypeChart() {
  const snapshot = buildFilteredSnapshot({ excludeKeys: ['systemType'] });
  const counts = {};
  snapshot.waterSystems.forEach(system => {
    const key = system.system_type || 'UNKNOWN';
    counts[key] = (counts[key] || 0) + 1;
  });

  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const empty = rows.length === 0;
  setChartEmpty('systemTypeChart', empty);
  destroyChart(systemTypeChart);
  systemTypeChart = null;
  if (empty) return;

  const selected = AppState.filters.systemType;
  const codes = rows.map(([code]) => code);
  systemTypeChart = new Chart(document.getElementById('systemTypeChart'), {
    type: 'bar',
    data: {
      labels: rows.map(([code]) => systemTypeLabel(code)),
      datasets: [{
        label: 'จำนวนระบบ',
        data: rows.map(([, count]) => count),
        backgroundColor: codes.map(code => selected ? (code === selected ? FILLS.blue : FILLS.blueDim) : FILLS.blue),
        borderColor: COLORS.blue,
        borderWidth: codes.map(code => selected && code === selected ? 2 : 1),
        borderRadius: 5,
        maxBarThickness: 28
      }]
    },
    options: baseCartesianOptions({
      indexAxis: 'y',
      legend: false,
      onElementClick: (_datasetIndex, index) => toggleChartFilter('systemType', codes[index])
    })
  });
}

function toggleChartFilter(key, value) {
  if (value === undefined || value === null || value === '') return;
  setFilterValue(key, value, { toggle: true });
  filterChangeHandler();
}

function countVillagesByDistrict(villages) {
  const counts = {};
  villages.forEach(village => {
    const key = village.district || 'ไม่ระบุ';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function countSystemsByDistrict(systems) {
  const villageById = new Map(AppState.data.villages.map(village => [village.village_id, village]));
  const counts = {};
  systems.forEach(system => {
    const key = villageById.get(system.village_id)?.district || 'ไม่ระบุ';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function countByNormalizedValue(rows, field, normalizer, codes) {
  const counts = Object.fromEntries(codes.map(code => [code, 0]));
  rows.forEach(row => {
    const normalized = normalizer(row[field]);
    if (Object.hasOwn(counts, normalized)) counts[normalized] += 1;
    else counts.NO_DATA += 1;
  });
  return counts;
}

function baseCartesianOptions({ indexAxis = 'x', legend = true, onElementClick = null } = {}) {
  const size = narrowMode ? 11 : 12;
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    animation: { duration: 180 },
    onClick: onElementClick
      ? (_event, elements) => {
          const hit = elements?.[0];
          if (hit) onElementClick(hit.datasetIndex, hit.index);
        }
      : undefined,
    onHover: (event, elements) => {
      const canvas = event?.native?.target;
      if (canvas?.style) canvas.style.cursor = elements?.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: {
        display: legend,
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, color: '#64748b', font: { size }, padding: 14 }
      },
      tooltip: { displayColors: true, titleFont: { family: 'Sarabun' }, bodyFont: { family: 'Sarabun' } }
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: 'rgba(226, 232, 240, .75)' },
        ticks: { color: '#64748b', font: { size, family: 'Sarabun' }, maxRotation: indexAxis === 'x' ? 30 : 0, minRotation: 0 },
        border: { color: '#e2e8f0' }
      },
      y: {
        beginAtZero: true,
        grid: { color: indexAxis === 'y' ? 'transparent' : 'rgba(226, 232, 240, .75)' },
        ticks: { color: '#64748b', font: { size, family: 'Sarabun' } },
        border: { color: '#e2e8f0' }
      }
    }
  };
}

function doughnutOptions(onElementClick) {
  const size = narrowMode ? 11 : 12;
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '66%',
    animation: { duration: 180 },
    onClick: (_event, elements) => {
      const hit = elements?.[0];
      if (hit) onElementClick(hit.datasetIndex, hit.index);
    },
    onHover: (event, elements) => {
      const canvas = event?.native?.target;
      if (canvas?.style) canvas.style.cursor = elements?.length ? 'pointer' : 'default';
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14, color: '#64748b', font: { size, family: 'Sarabun' } },
        // Doughnut legends are dimension labels. Make them use the same filter
        // semantics as clicking the segment instead of Chart.js' default hide/show.
        onClick: (_event, legendItem) => {
          if (Number.isInteger(legendItem?.index)) onElementClick(0, legendItem.index);
        }
      },
      tooltip: { titleFont: { family: 'Sarabun' }, bodyFont: { family: 'Sarabun' } }
    }
  };
}

function setChartEmpty(canvasId, empty) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas?.parentElement;
  if (!canvas || !wrap) return;

  const existing = wrap.querySelector('.chart-empty');
  if (!empty) {
    existing?.remove();
    canvas.removeAttribute('hidden');
    return;
  }

  canvas.setAttribute('hidden', '');
  if (!existing) {
    const message = document.createElement('div');
    message.className = 'chart-empty';
    message.textContent = 'ไม่พบข้อมูลตามตัวกรองที่เลือก';
    wrap.appendChild(message);
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'th'));
}

function destroyChart(chart) {
  if (chart && typeof chart.destroy === 'function') chart.destroy();
}
