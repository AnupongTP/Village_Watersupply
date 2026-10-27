import { AppState } from './state.js';
import { focusSystem, hasUsableCoordinate } from './map.js';
import { openDrawer } from './drawer.js';
import { buildSystemDetailHtml } from './system-detail.js';
import {
  systemDisplayName,
  villageDisplayName,
  safeDisplayText,
  systemTypeLabel,
  operationalStatusLabel,
  normalizeOperationalStatus
} from './labels.js';

const PAGE_SIZE = 20;
const listState = { search: '', page: 1, scopeKey: '' };

export function renderProblemList() {
  const root = document.getElementById('problemList');
  if (!root) return;

  const villageById = new Map(AppState.data.villages.map(v => [v.village_id, v]));
  const scopeKey = JSON.stringify([AppState.meta.lastSuccessfulLoadAt, AppState.filters]);
  if (scopeKey !== listState.scopeKey) {
    listState.page = 1;
    listState.scopeKey = scopeKey;
  }
  const scopeSystems = AppState.filtered.waterSystems;
  bindListControlsOnce();

  const search = listState.search.trim().toLocaleLowerCase('th');
  const rows = scopeSystems
    .map(system => ({ system, village: villageById.get(system.village_id) }))
    .filter(({ system, village }) => (
      (!search || [system.system_id, systemDisplayName(system, village), villageDisplayName(village), village?.district, village?.subdistrict, village?.local_authority]
        .some(value => String(value || '').toLocaleLowerCase('th').includes(search)))
    ))
    .sort(compareName);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  listState.page = Math.min(listState.page, pageCount);
  const pageRows = rows.slice((listState.page - 1) * PAGE_SIZE, listState.page * PAGE_SIZE);

  if (!rows.length) {
    root.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <strong>ไม่พบระบบประปา</strong>
        <span>ตามขอบเขตและตัวกรองปัจจุบัน</span>
      </div>`;
    bindActionsOnce(root, villageById);
    return;
  }

  root.innerHTML = `
    <div class="problem-summary">
      <div>พบ <strong>${formatNumber(rows.length)}</strong> ระบบ ตามตัวกรองรายการ</div>
      <span>เลื่อนดูรายการภายในกล่อง และเปลี่ยนหน้าด้านล่าง</span>
    </div>

    <div class="hidden lg:block">
      <div class="watchlist-scroll" role="region" aria-label="ตารางรายการระบบประปา" tabindex="0">
        <table class="problem-table">
          <thead>
            <tr>
              <th>หมู่บ้าน / ระบบ</th>
              <th>อำเภอ</th>
              <th>ประเด็นเฝ้าระวัง</th>
              <th>ครัวเรือน</th>
              <th class="align-right">ดูข้อมูล</th>
            </tr>
          </thead>
          <tbody>${pageRows.map(({ system, village }) => tableRow(system, village)).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="watchlist-mobile lg:hidden" role="region" aria-label="รายการระบบประปา" tabindex="0">
      ${pageRows.map(({ system, village }) => mobileCard(system, village)).join('')}
    </div>
    <div class="public-list-pager" role="group" aria-label="เปลี่ยนหน้ารายการระบบประปา">
      <span id="publicListPageStatus" class="public-list-page-status">หน้า ${listState.page}/${pageCount}</span>
      <button id="publicListPrevious" class="action-button" type="button" data-list-page="previous" ${listState.page === 1 ? 'disabled' : ''}>ก่อนหน้า</button>
      <button id="publicListNext" class="action-button" type="button" data-list-page="next" ${listState.page === pageCount ? 'disabled' : ''}>ถัดไป</button>
    </div>`;

  bindActionsOnce(root, villageById);
}

function bindListControlsOnce() {
  const search = document.getElementById('publicListSearch');
  if (search.dataset.bound === '1') return;
  search.dataset.bound = '1';
  search.addEventListener('input', event => {
    listState.search = event.target.value;
    listState.page = 1;
    renderProblemList();
  });

}

function compareName(a, b) {
  return villageDisplayName(a.village, '').localeCompare(villageDisplayName(b.village, ''), 'th') ||
    systemDisplayName(a.system, a.village).localeCompare(systemDisplayName(b.system, b.village), 'th');
}

function tableRow(system, village) {
  const coordUsable = hasUsableCoordinate(system);
  const villageName = villageDisplayName(village);
  const displayName = systemDisplayName(system, village);

  return `
    <tr data-watch-system-id="${escapeHtml(system.system_id)}">
      <td>
        <span class="system-main">${escapeHtml(villageName)}</span>
        <span class="system-sub">${escapeHtml(displayName)}</span>
      </td>
      <td>${escapeHtml(safeDisplayText(village?.district))}</td>
      <td><div class="watch-badges">${watchBadges(system)}</div></td>
      <td>${formatNumber(system.households_served)}</td>
      <td>
        <div class="row-actions">
          ${actionButtons(system, village, coordUsable)}
        </div>
      </td>
    </tr>`;
}

function mobileCard(system, village) {
  const coordUsable = hasUsableCoordinate(system);
  const villageName = villageDisplayName(village);
  const displayName = systemDisplayName(system, village);

  return `
    <article class="watch-card" data-watch-system-id="${escapeHtml(system.system_id)}">
      <div class="min-w-0">
        <h3 class="watch-card-title">${escapeHtml(villageName)}</h3>
        <p class="watch-card-subtitle">${escapeHtml(village?.district ? `อ.${safeDisplayText(village.district)}` : '-')}</p>
      </div>
      <p class="watch-card-system">${escapeHtml(displayName)}</p>
      <div class="watch-badges mt-2">${watchBadges(system)}</div>
      <p class="watch-card-meta">ครัวเรือนรับน้ำ: <strong class="font-bold text-slate-700">${formatNumber(system.households_served)}</strong></p>
      <div class="watch-card-actions">${actionButtons(system, village, coordUsable)}</div>
    </article>`;
}

function actionButtons(system, village, coordUsable) {
  const displayName = escapeHtml(systemDisplayName(system, village));
  return `
    <button class="action-button" type="button" data-action="map" data-system-id="${escapeHtml(system.system_id)}" ${coordUsable ? '' : 'disabled'} aria-label="ดูตำแหน่งบนแผนที่ ${displayName}">
      <i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>แผนที่</span>
    </button>
    <button class="action-button" type="button" data-action="detail" data-system-id="${escapeHtml(system.system_id)}" aria-label="ดูรายละเอียด ${displayName}">
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>รายละเอียด</span>
    </button>`;
}

function bindActionsOnce(root, villageById) {
  root._villageById = villageById;
  if (root.dataset.actionsBound === '1') return;
  root.dataset.actionsBound = '1';

  root.addEventListener('click', event => {
    const pager = event.target.closest('[data-list-page]');
    if (pager && !pager.disabled) {
      listState.page += pager.dataset.listPage === 'next' ? 1 : -1;
      renderProblemList();
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button || !root.contains(button) || button.disabled) return;

    const system = findSystem(button.dataset.systemId);
    if (!system) return;

    if (button.dataset.action === 'detail') {
      const village = root._villageById?.get(system.village_id);
      openDrawer(buildSystemDetailHtml(system, village));
      return;
    }

    if (button.dataset.action === 'map' && !focusSystem(system.system_id)) {
      showInfo('ไม่มีพิกัดที่ใช้แสดงบนแผนที่', 'ระบบนี้ไม่มีพิกัดที่ใช้งานได้สำหรับการแสดงผลบนแผนที่');
    }
  });
}

function findSystem(systemId) {
  return AppState.data.waterSystems.find(system => String(system.system_id) === String(systemId));
}

function watchBadges(system) {
  const badges = [];
  if (system.operational_status === 'NOT_WORKING') badges.push('<span class="badge badge-danger">ใช้การไม่ได้</span>');
  if (system.water_quantity === 'INSUFFICIENT') badges.push('<span class="badge badge-warning">น้ำไม่เพียงพอ</span>');
  if (system.drinking_water_quality === 'FAIL') badges.push('<span class="badge badge-rose">น้ำดื่มไม่ผ่านเกณฑ์</span>');
  return badges.length ? badges.join('') : '<span class="badge badge-success">ไม่มีประเด็นเฝ้าระวัง</span>';
}

function formatNumber(value) {
  if (value === '' || value === null || value === undefined) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('th-TH') : safeDisplayText(value);
}

function showInfo(title, text) {
  if (window.Swal) {
    Swal.fire({
      icon: 'info',
      title,
      text,
      confirmButtonText: 'ปิด',
      confirmButtonColor: '#0369a1'
    });
  } else {
    window.alert(`${title}\n${text}`);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
