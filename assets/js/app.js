import { loadData } from './api.js';
import { AppState } from './state.js';
import { buildTemporaryPublicScope } from './public-scope.js';
import { applyFilters, bindFilterEvents, buildFilterOptions } from './filters.js';
import { renderDashboard } from './dashboard.js';
import { initMap, renderMap, fitVisiblePoints, locateUser } from './map.js';
import { bindChartFilterEvents, renderCharts } from './charts.js';
import { renderProblemList } from './problem-list.js';
import { initDrawer } from './drawer.js';
import {
  showLoading,
  closeLoading,
  showError,
  showRefreshError,
  initMobileFilters,
  initSectionNavigation,
  initStickyMetrics,
  refreshStickyMetrics,
  syncHashNavigation,
  initBackToTop
} from './ui.js';

let dataLoadInFlight = false;
let hasSuccessfulLoad = false;

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  initDrawer();
  initMobileFilters();
  initSectionNavigation();
  initStickyMetrics();
  initBackToTop();
  bindFilterEvents(renderAll);
  bindChartFilterEvents(renderAll);

  document.getElementById('btnRefresh')?.addEventListener('click', reloadData);
  document.getElementById('btnUserLocation')?.addEventListener('click', locateUser);
  document.getElementById('btnMapFit')?.addEventListener('click', fitVisiblePoints);

  await reloadData();
}

async function reloadData() {
  if (dataLoadInFlight) return false;

  const isRefresh = hasSuccessfulLoad;
  dataLoadInFlight = true;
  setRefreshBusy(true);

  try {
    assertCoreDependencies();
    showLoading(isRefresh ? 'กำลังรีเฟรชข้อมูล...' : 'กำลังโหลดข้อมูล...');

    // loadData validates the payload shape before returning. Build the complete
    // public candidate before mutating AppState so a network/parse/validation/
    // projection failure cannot destroy the previously accepted dataset.
    const sourceData = await loadData();
    const publicScope = buildTemporaryPublicScope(sourceData);
    const acceptedAt = new Date().toISOString();

    const nextData = {
      villages: publicScope.villages,
      waterSystems: publicScope.waterSystems,
      waterSources: publicScope.waterSources
    };
    const nextMeta = {
      sourceGeneratedAt: sourceData.generatedAt || '',
      lastSuccessfulLoadAt: acceptedAt,
      publicSuppression: publicScope.suppression
    };

    AppState.data = nextData;
    AppState.meta = nextMeta;

    buildFilterOptions();
    applyFilters();
    initMap();
    renderAll();
    renderUpdatedAt();
    refreshStickyMetrics();
    hasSuccessfulLoad = true;
    closeLoading();

    requestAnimationFrame(() => {
      refreshStickyMetrics();
      syncHashNavigation({ smooth: false });
      window.setTimeout(() => {
        refreshStickyMetrics();
        syncHashNavigation({ smooth: false });
      }, 180);
    });

    return true;
  } catch (error) {
    console.error(error);
    closeLoading();
    const message = error?.message || 'เกิดข้อผิดพลาดขณะโหลดข้อมูล';
    if (isRefresh) showRefreshError(message);
    else showError(message);
    return false;
  } finally {
    dataLoadInFlight = false;
    setRefreshBusy(false);
  }
}

function renderAll() {
  renderDashboard();
  renderMap();
  renderCharts();
  renderProblemList();
  requestAnimationFrame(refreshStickyMetrics);
}

function renderUpdatedAt() {
  const el = document.getElementById('dataUpdatedAt');
  if (!el) return;

  const date = new Date(AppState.meta.lastSuccessfulLoadAt);
  if (Number.isNaN(date.getTime())) {
    el.textContent = '-';
    return;
  }

  const pad = value => String(value).padStart(2, '0');
  const buddhistYear = date.getFullYear() + 543;
  el.textContent = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${buddhistYear} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setRefreshBusy(busy) {
  const button = document.getElementById('btnRefresh');
  if (!button) return;
  button.disabled = Boolean(busy);
  button.setAttribute('aria-busy', String(Boolean(busy)));
  const icon = button.querySelector('i');
  icon?.classList.toggle('fa-spin', Boolean(busy));
}

function assertCoreDependencies() {
  const missing = [];
  if (!window.L) missing.push('Leaflet');
  if (!window.Chart) missing.push('Chart.js');
  if (!window.Swal) missing.push('SweetAlert2');
  if (missing.length) throw new Error(`โหลดไลบรารีไม่สำเร็จ: ${missing.join(', ')}`);
}
