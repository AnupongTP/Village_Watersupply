import { loadData } from './api.js';
import { AppState } from './state.js';
import { buildTemporaryPublicScope } from './public-scope.js';
import { readPublicCache, writePublicCache } from './public-cache.js';
import { applyFilters, bindFilterEvents, buildFilterOptions } from './filters.js';
import { renderDashboard } from './dashboard.js';
import { initMap, renderMap, locateUserAutomatically } from './map.js';
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
// True while the on-screen dataset came from the browser cache and has not yet
// been replaced by a successful live fetch. Cached data is never CURRENT.
let showingCachedData = false;
let userLocationRequested = false;
const CACHE_READ_BUDGET_MS = 800;

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

  await showCachedDatasetIfAvailable();
  await reloadData();
}

// Repeat visits: paint a validated cached public dataset immediately, then let
// reloadData() refresh from the existing Public API in the background.
async function showCachedDatasetIfAvailable() {
  try {
    if (!window.L || !window.Chart || !window.Swal) return;
    const timeout = new Promise(resolve => window.setTimeout(() => resolve({ status: 'UNAVAILABLE', reason: 'READ_BUDGET' }), CACHE_READ_BUDGET_MS));
    const cached = await Promise.race([readPublicCache(), timeout]);
    if (cached.status !== 'HIT') return;
    const { record } = cached;
    applyDataset({
      villages: record.data.villages,
      waterSystems: record.data.waterSystems,
      waterSources: record.data.waterSources
    }, {
      sourceGeneratedAt: record.sourceGeneratedAt,
      lastSuccessfulLoadAt: record.savedAt,
      publicSuppression: record.suppression,
      dataOrigin: 'CACHE'
    });
    showingCachedData = true;
    setDataNotice('CACHE_PENDING');
    if (!userLocationRequested) { userLocationRequested = true; void locateUserAutomatically(); }
    scheduleLayoutSync();
  } catch (error) {
    console.warn('Public cache display skipped:', error);
    showingCachedData = false;
  }
}

async function reloadData() {
  if (dataLoadInFlight) return false;

  const keepingCache = showingCachedData;
  const isRefresh = hasSuccessfulLoad;
  dataLoadInFlight = true;
  setRefreshBusy(true);
  if (keepingCache) setDataNotice('CACHE_PENDING');

  try {
    assertCoreDependencies();
    // With a cached dataset on screen the refresh is silent: no blocking dialog.
    if (!keepingCache) showLoading(isRefresh ? 'กำลังรีเฟรชข้อมูล...' : 'กำลังโหลดข้อมูล...');

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
      publicSuppression: publicScope.suppression,
      dataOrigin: 'LIVE'
    };

    applyDataset(nextData, nextMeta);
    hasSuccessfulLoad = true;
    showingCachedData = false;
    setDataNotice('LIVE');
    if (!keepingCache) closeLoading();
    if (!isRefresh && !userLocationRequested) { userLocationRequested = true; void locateUserAutomatically(); }

    // Persist the complete projected dataset (allowlisted fields only) off the
    // critical path. A storage failure never affects what is displayed.
    void writePublicCache({ scope: publicScope, sourceGeneratedAt: nextMeta.sourceGeneratedAt }).then(result => {
      if (!result.ok) console.warn('Public cache not updated:', result.reason);
    });

    scheduleLayoutSync();
    return true;
  } catch (error) {
    console.error(error);
    if (!keepingCache) closeLoading();
    const message = error?.message || 'เกิดข้อผิดพลาดขณะโหลดข้อมูล';
    if (keepingCache) setDataNotice('CACHE_REFRESH_FAILED');
    else if (isRefresh) showRefreshError(message);
    else showError(message);
    return false;
  } finally {
    dataLoadInFlight = false;
    setRefreshBusy(false);
  }
}

function applyDataset(nextData, nextMeta) {
  AppState.data = nextData;
  AppState.meta = nextMeta;

  buildFilterOptions();
  applyFilters();
  initMap();
  renderAll();
  renderUpdatedAt();
  refreshStickyMetrics();
}

function scheduleLayoutSync() {
  requestAnimationFrame(() => {
    refreshStickyMetrics();
    syncHashNavigation({ smooth: false });
    window.setTimeout(() => {
      refreshStickyMetrics();
      syncHashNavigation({ smooth: false });
    }, 180);
  });
}

function renderAll() {
  renderDashboard();
  renderMap();
  renderCharts();
  renderProblemList();
  requestAnimationFrame(refreshStickyMetrics);
}

function formatThaiDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = number => String(number).padStart(2, '0');
  const buddhistYear = date.getFullYear() + 543;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${buddhistYear} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderUpdatedAt() {
  const el = document.getElementById('dataUpdatedAt');
  if (!el) return;
  el.textContent = formatThaiDateTime(AppState.meta.lastSuccessfulLoadAt);
}

// Cached data is only ever labelled as saved/unverified. No trusted revision
// evidence reaches the browser, so nothing here claims the data is current.
function setDataNotice(kind) {
  const notice = document.getElementById('dataSourceNotice');
  const label = document.getElementById('dataUpdatedLabel');
  const origin = kind === 'LIVE' ? 'live' : 'cache';
  document.body.dataset.dataOrigin = origin;
  if (label) label.textContent = origin === 'cache' ? 'ข้อมูลที่บันทึกไว้เมื่อ' : 'โหลดข้อมูลล่าสุด';
  if (!notice) return;
  if (kind === 'LIVE') {
    notice.hidden = true;
    notice.textContent = '';
    return;
  }
  const savedAt = formatThaiDateTime(AppState.meta.lastSuccessfulLoadAt);
  const message = kind === 'CACHE_REFRESH_FAILED'
    ? `${navigator.onLine === false ? 'ขณะนี้ออฟไลน์' : 'อัปเดตข้อมูลล่าสุดไม่สำเร็จ'} จึงยังแสดงข้อมูลที่บันทึกไว้เมื่อ ${savedAt} ซึ่งยังไม่ได้ตรวจสอบและอาจไม่เป็นปัจจุบัน กดรีเฟรชเพื่อลองอีกครั้ง`
    : `กำลังแสดงข้อมูลที่บันทึกไว้เมื่อ ${savedAt} ซึ่งยังไม่ได้ตรวจสอบกับข้อมูลล่าสุด ระบบกำลังอัปเดตเบื้องหลัง`;
  notice.textContent = message;
  notice.dataset.state = kind === 'CACHE_REFRESH_FAILED' ? 'failed' : 'pending';
  notice.hidden = false;
  requestAnimationFrame(refreshStickyMetrics);
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
