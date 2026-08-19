import { AppState } from './state.js';
import { systemTypeLabel } from './labels.js';

let districtChart;
let qualityChart;
let quantityChart;
let systemTypeChart;
let narrowMode = window.matchMedia('(max-width: 767px)').matches;
let resizeTimer;

const COLORS = {
  blue: '#0284c7',
  cyan: '#0891b2',
  green: '#059669',
  red: '#dc2626',
  amber: '#d97706',
  gray: '#94a3b8'
};

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
  const villageCounts = countVillagesByDistrict();
  const systemCounts = countSystemsByDistrict();
  const labels = uniqueSorted([...Object.keys(villageCounts), ...Object.keys(systemCounts)]);
  const empty = labels.length === 0;
  setChartEmpty('districtChart', empty);
  destroyChart(districtChart);
  districtChart = null;
  if (empty) return;

  const indexAxis = narrowMode ? 'y' : 'x';
  districtChart = new Chart(document.getElementById('districtChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'หมู่บ้าน', data: labels.map(l => villageCounts[l] || 0), backgroundColor: 'rgba(2, 132, 199, .72)', borderColor: COLORS.blue, borderWidth: 1, borderRadius: 5, maxBarThickness: 34 },
        { label: 'ระบบประปา', data: labels.map(l => systemCounts[l] || 0), backgroundColor: 'rgba(8, 145, 178, .68)', borderColor: COLORS.cyan, borderWidth: 1, borderRadius: 5, maxBarThickness: 34 }
      ]
    },
    options: baseCartesianOptions({ indexAxis, legend: true })
  });
}

function renderQualityChart() {
  const systems = AppState.filtered.waterSystems;
  const empty = systems.length === 0;
  setChartEmpty('qualityChart', empty);
  destroyChart(qualityChart);
  qualityChart = null;
  if (empty) return;

  const values = {
    PASS: systems.filter(s => s.drinking_water_quality === 'PASS').length,
    FAIL: systems.filter(s => s.drinking_water_quality === 'FAIL').length,
    NO_DATA: systems.filter(s => !s.drinking_water_quality || s.drinking_water_quality === 'NO_DATA' || s.drinking_water_quality === '-').length
  };

  qualityChart = new Chart(document.getElementById('qualityChart'), {
    type: 'doughnut',
    data: {
      labels: ['ผ่านเกณฑ์', 'ไม่ผ่านเกณฑ์', 'ไม่มีข้อมูล'],
      datasets: [{ data: [values.PASS, values.FAIL, values.NO_DATA], backgroundColor: [COLORS.green, COLORS.red, COLORS.gray], borderColor: '#ffffff', borderWidth: 3, hoverOffset: 4 }]
    },
    options: doughnutOptions()
  });
}

function renderQuantityChart() {
  const systems = AppState.filtered.waterSystems;
  const empty = systems.length === 0;
  setChartEmpty('quantityChart', empty);
  destroyChart(quantityChart);
  quantityChart = null;
  if (empty) return;

  const values = {
    SUFFICIENT: systems.filter(s => s.water_quantity === 'SUFFICIENT').length,
    INSUFFICIENT: systems.filter(s => s.water_quantity === 'INSUFFICIENT').length,
    NO_DATA: systems.filter(s => !s.water_quantity || s.water_quantity === 'NO_DATA' || s.water_quantity === '-').length
  };

  quantityChart = new Chart(document.getElementById('quantityChart'), {
    type: 'doughnut',
    data: {
      labels: ['เพียงพอ', 'ไม่เพียงพอ', 'ไม่มีข้อมูล'],
      datasets: [{ data: [values.SUFFICIENT, values.INSUFFICIENT, values.NO_DATA], backgroundColor: [COLORS.blue, COLORS.amber, COLORS.gray], borderColor: '#ffffff', borderWidth: 3, hoverOffset: 4 }]
    },
    options: doughnutOptions()
  });
}

function renderSystemTypeChart() {
  const counts = {};
  AppState.filtered.waterSystems.forEach(system => {
    const key = system.system_type || 'UNKNOWN';
    counts[key] = (counts[key] || 0) + 1;
  });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const empty = rows.length === 0;
  setChartEmpty('systemTypeChart', empty);
  destroyChart(systemTypeChart);
  systemTypeChart = null;
  if (empty) return;

  systemTypeChart = new Chart(document.getElementById('systemTypeChart'), {
    type: 'bar',
    data: {
      labels: rows.map(([code]) => systemTypeLabel(code)),
      datasets: [{ label: 'จำนวนระบบ', data: rows.map(([, count]) => count), backgroundColor: 'rgba(2, 132, 199, .72)', borderColor: COLORS.blue, borderWidth: 1, borderRadius: 5, maxBarThickness: 28 }]
    },
    options: baseCartesianOptions({ indexAxis: 'y', legend: false })
  });
}

function countVillagesByDistrict() {
  const counts = {};
  AppState.filtered.villages.forEach(village => {
    const key = village.district || 'ไม่ระบุ';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function countSystemsByDistrict() {
  const villageById = new Map(AppState.data.villages.map(v => [v.village_id, v]));
  const counts = {};
  AppState.filtered.waterSystems.forEach(system => {
    const key = villageById.get(system.village_id)?.district || 'ไม่ระบุ';
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function baseCartesianOptions({ indexAxis = 'x', legend = true } = {}) {
  const size = narrowMode ? 11 : 12;
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    animation: { duration: 180 },
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

function doughnutOptions() {
  const size = narrowMode ? 11 : 12;
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '66%',
    animation: { duration: 180 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14, color: '#64748b', font: { size, family: 'Sarabun' } }
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
