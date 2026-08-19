import { loadData } from './api.js';
import { AppState } from './state.js';
import { applyFilters, bindFilterEvents, buildFilterOptions } from './filters.js';
import { renderDashboard } from './dashboard.js';
import { initMap, renderMap, goHome, fitVisiblePoints } from './map.js';
import { renderCharts } from './charts.js';
import { renderProblemList } from './problem-list.js';
import { renderDataCompleteness } from './data-quality.js';
import { initDrawer } from './drawer.js';
import {
  showLoading,
  closeLoading,
  showError,
  initMobileFilters,
  initSectionNavigation,
  initStickyMetrics,
  refreshStickyMetrics,
  syncHashNavigation
} from './ui.js';

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  initDrawer();
  initMobileFilters();
  initSectionNavigation();
  initStickyMetrics();
  bindFilterEvents(renderAll);

  document.getElementById('btnRefresh')?.addEventListener('click', reloadData);
  document.getElementById('btnMapHome')?.addEventListener('click', goHome);
  document.getElementById('btnMapFit')?.addEventListener('click', fitVisiblePoints);

  await reloadData();
}

async function reloadData() {
  try {
    assertCoreDependencies();
    showLoading();
    const data = await loadData();

    AppState.meta.generatedAt = data.generatedAt || new Date().toISOString();
    AppState.data.villages = Array.isArray(data.villages) ? data.villages : [];
    AppState.data.waterSystems = Array.isArray(data.waterSystems) ? data.waterSystems : [];
    AppState.data.waterSources = Array.isArray(data.waterSources) ? data.waterSources : [];

    buildFilterOptions();
    applyFilters();
    initMap();
    renderAll();
    renderUpdatedAt();
    refreshStickyMetrics();
    closeLoading();

    // Layout changes after charts/map/data rendering; resolve direct hash again after paint.
    requestAnimationFrame(() => {
      refreshStickyMetrics();
      syncHashNavigation({ smooth: false });
      window.setTimeout(() => {
        refreshStickyMetrics();
        syncHashNavigation({ smooth: false });
      }, 180);
    });
  } catch (error) {
    console.error(error);
    closeLoading();
    showError(error?.message || 'เกิดข้อผิดพลาดขณะโหลดข้อมูล');
  }
}

function renderAll() {
  renderDashboard();
  renderMap();
  renderCharts();
  renderProblemList();
  renderDataCompleteness();
  requestAnimationFrame(refreshStickyMetrics);
}

function renderUpdatedAt() {
  const el = document.getElementById('dataUpdatedAt');
  if (!el) return;

  const date = new Date(AppState.meta.generatedAt);
  if (Number.isNaN(date.getTime())) {
    el.textContent = '-';
    return;
  }

  const pad = value => String(value).padStart(2, '0');
  const buddhistYear = date.getFullYear() + 543;
  el.textContent = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${buddhistYear} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function assertCoreDependencies() {
  const missing = [];
  if (!window.L) missing.push('Leaflet');
  if (!window.Chart) missing.push('Chart.js');
  if (!window.Swal) missing.push('SweetAlert2');
  if (missing.length) throw new Error(`โหลดไลบรารีไม่สำเร็จ: ${missing.join(', ')}`);
}
