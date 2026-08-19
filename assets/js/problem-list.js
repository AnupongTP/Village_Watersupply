import { AppState } from './state.js';
import { focusSystem, hasUsableCoordinate } from './map.js';
import { openDrawer } from './drawer.js';
import { buildSystemDetailHtml } from './system-detail.js';
import {
  systemDisplayName,
  villageDisplayName,
  safeDisplayText
} from './labels.js';

export function renderProblemList() {
  const root = document.getElementById('problemList');
  if (!root) return;

  const villageById = new Map(AppState.data.villages.map(v => [v.village_id, v]));
  const rows = AppState.filtered.waterSystems
    .filter(isWatchSystem)
    .map(system => ({ system, village: villageById.get(system.village_id) }))
    .sort(compareSeverity);

  if (!rows.length) {
    root.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        <strong>ไม่พบระบบที่เข้าเงื่อนไขเฝ้าระวัง</strong>
        <span>ตามขอบเขตและตัวกรองปัจจุบัน</span>
      </div>`;
    bindActionsOnce(root, villageById);
    return;
  }

  root.innerHTML = `
    <div class="problem-summary">
      <div>พบ <strong>${formatNumber(rows.length)}</strong> ระบบ ที่เข้าเงื่อนไขเฝ้าระวังอย่างน้อย 1 ประเด็น</div>
      <span>${rows.length > 8 ? 'เลื่อนดูรายการทั้งหมดภายในกล่อง' : 'แสดงรายการทั้งหมด'}</span>
    </div>

    <div class="hidden lg:block">
      <div class="watchlist-scroll" role="region" aria-label="ตารางระบบที่ควรติดตามสถานการณ์" tabindex="0">
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
          <tbody>${rows.map(({ system, village }) => tableRow(system, village)).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="watchlist-mobile lg:hidden" role="region" aria-label="รายการระบบที่ควรติดตามสถานการณ์" tabindex="0">
      ${rows.map(({ system, village }) => mobileCard(system, village)).join('')}
    </div>`;

  bindActionsOnce(root, villageById);
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

function isWatchSystem(system) {
  return system.operational_status === 'NOT_WORKING' ||
         system.water_quantity === 'INSUFFICIENT' ||
         system.drinking_water_quality === 'FAIL';
}

function compareSeverity(a, b) {
  const diff = severityScore(b.system) - severityScore(a.system);
  if (diff) return diff;
  return villageDisplayName(a.village, '').localeCompare(villageDisplayName(b.village, ''), 'th');
}

function severityScore(system) {
  let score = 0;
  if (system.operational_status === 'NOT_WORKING') score += 100;
  if (system.water_quantity === 'INSUFFICIENT') score += 30;
  if (system.drinking_water_quality === 'FAIL') score += 20;
  return score;
}

function watchBadges(system) {
  const badges = [];
  if (system.operational_status === 'NOT_WORKING') badges.push('<span class="badge badge-danger">ใช้การไม่ได้</span>');
  if (system.water_quantity === 'INSUFFICIENT') badges.push('<span class="badge badge-warning">น้ำไม่เพียงพอ</span>');
  if (system.drinking_water_quality === 'FAIL') badges.push('<span class="badge badge-rose">น้ำดื่มไม่ผ่านเกณฑ์</span>');
  return badges.join('');
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
