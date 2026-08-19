import { AppState } from './state.js';
import { focusSystem, hasUsableCoordinate } from './map.js';
import { openDrawer } from './drawer.js';
import {
  systemDisplayName,
  villageDisplayName,
  systemTypeLabel,
  waterSourceTypeLabel,
  operationalStatusLabel,
  qualityLabel,
  quantityLabel,
  ownerTypeLabel,
  establishmentTypeLabel,
  utilityWaterQualityLabel,
  transferDocumentStatusLabel,
  usageTypeLabel,
  sharedWithOtherVillageLabel,
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
      openDrawer(buildDetail(system, village));
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

function buildDetail(system, village) {
  const documentUrl = safeHttpUrl(system.transfer_document_url || system.document_url || '');
  const systemName = systemDisplayName(system, village);
  const villageName = villageDisplayName(village);
  const owner = system.owner_type
    ? ownerTypeLabel(system.owner_type)
    : safeDisplayText(system.owner, 'ไม่ระบุกรรมสิทธิ์');

  const transferItems = [
    ['ปีที่ถ่ายโอน', formatYear(system.transfer_year_be || system.transfer_year)],
    ['หน่วยงานที่ถ่ายโอน', safeDisplayText(system.transfer_agency)],
    ['สถานะเอกสารการถ่ายโอน', transferDocumentStatusLabel(system.transfer_document_status)],
    ['ข้อมูลการถ่ายโอนอื่น', safeDisplayText(system.transfer_other)]
  ];

  return `
    <div class="detail-stack">
      <div>
        <h3 class="detail-title">${escapeHtml(systemName)}</h3>
        <p class="detail-subtitle">${escapeHtml(villageName)}${village?.district ? ` • อ.${escapeHtml(safeDisplayText(village.district))}` : ''}</p>
      </div>

      <div class="detail-status-row">
        ${statusBadge(system.operational_status)}
        ${quantityBadge(system.water_quantity)}
        ${qualityBadge(system.drinking_water_quality)}
      </div>

      ${detailSection('ข้อมูลพื้นที่', [
        ['หมู่บ้าน', villageName],
        ['อำเภอ', safeDisplayText(village?.district)],
        ['อปท.', safeDisplayText(village?.local_authority)],
        ['พิกัด', coordinateText(system)]
      ])}

      ${detailSection('ข้อมูลระบบประปา', [
        ['ประเภทระบบ', systemTypeLabel(system.system_type)],
        ['แหล่งน้ำของระบบ', waterSourceTypeLabel(system.water_source_type)],
        ['กำลังผลิต', valueWithUnit(system.capacity_m3_hr, 'ลบ.ม./ชม.')],
        ['ครัวเรือนรับน้ำ', valueWithUnit(system.households_served, 'ครัวเรือน')],
        ['ปีที่ก่อสร้าง', formatYear(system.construction_year_be)],
        ['อายุระบบโดยประมาณ', calculatedAge(system.construction_year_be)]
      ])}

      ${detailSection('สถานะและการใช้งาน', [
        ['สถานะการใช้งาน', operationalStatusLabel(system.operational_status)],
        ['ความเพียงพอของน้ำ', quantityLabel(system.water_quantity)],
        ['คุณภาพน้ำดื่ม', qualityLabel(system.drinking_water_quality)],
        ['คุณภาพน้ำเพื่อการอุปโภค', utilityWaterQualityLabel(system.utility_water_quality)],
        ['ลักษณะการใช้น้ำ', usageTypeLabel(system.usage_type)],
        ['การใช้ร่วมกับหมู่บ้านอื่น', sharedWithOtherVillageLabel(system.shared_with_other_village)]
      ])}

      ${detailSection('กรรมสิทธิ์และการบริหารจัดการ', [
        ['กรรมสิทธิ์', owner],
        ['หน่วยงาน/ผู้รับผิดชอบ', safeDisplayText(system.responsible_agency)],
        ['รูปแบบการจัดตั้ง', establishmentTypeLabel(system.establishment_type)],
        ['หน่วยงานที่จัดตั้ง', safeDisplayText(system.establishment_agency)]
      ])}

      ${shouldShowTransferSection(system) ? detailSection('ข้อมูลการถ่ายโอน', transferItems) : ''}

      ${documentUrl ? `<div><p class="detail-section-title">เอกสารอ้างอิง</p><a class="detail-document" href="${escapeHtml(documentUrl)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>เปิดเอกสารการถ่ายโอน</a></div>` : ''}
    </div>`;
}

function shouldShowTransferSection(system) {
  return system.establishment_type === 'TRANSFERRED' ||
         !isBlank(system.transfer_year_be) ||
         !isBlank(system.transfer_year) ||
         !isBlank(system.transfer_agency) ||
         system.transfer_document_status === 'AVAILABLE';
}

function detailSection(title, items) {
  return `<div><p class="detail-section-title">${escapeHtml(title)}</p><div class="detail-grid">${items.map(([label, value]) => detailItem(label, value)).join('')}</div></div>`;
}

function detailItem(label, value) {
  return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(isBlank(value) ? '-' : value)}</strong></div>`;
}

function statusBadge(value) {
  if (value === 'NOT_WORKING') return '<span class="badge badge-danger">ใช้การไม่ได้</span>';
  if (value === 'WORKING') return '<span class="badge badge-success">ใช้การได้</span>';
  return '<span class="badge badge-muted">สถานะไม่มีข้อมูล</span>';
}

function quantityBadge(value) {
  if (value === 'INSUFFICIENT') return '<span class="badge badge-warning">น้ำไม่เพียงพอ</span>';
  if (value === 'SUFFICIENT') return '<span class="badge badge-success">น้ำเพียงพอ</span>';
  return '<span class="badge badge-muted">ปริมาณน้ำไม่มีข้อมูล</span>';
}

function qualityBadge(value) {
  if (value === 'FAIL') return '<span class="badge badge-rose">น้ำดื่มไม่ผ่านเกณฑ์</span>';
  if (value === 'PASS') return '<span class="badge badge-success">น้ำดื่มผ่านเกณฑ์</span>';
  return '<span class="badge badge-muted">คุณภาพน้ำไม่มีข้อมูล</span>';
}

function coordinateText(system) {
  if (!hasUsableCoordinate(system)) return '-';
  return `${Number(system.latitude).toFixed(6)}, ${Number(system.longitude).toFixed(6)}`;
}

function calculatedAge(yearBE) {
  const year = Number(yearBE);
  if (!Number.isFinite(year)) return '-';
  const age = new Date().getFullYear() + 543 - year;
  return age >= 0 && age <= 150 ? `${age.toLocaleString('th-TH')} ปี` : '-';
}

function formatYear(value) {
  if (isBlank(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString('th-TH', { useGrouping: false }) : safeDisplayText(value);
}

function valueWithUnit(value, unit) {
  return isBlank(value) ? '-' : `${formatNumber(value)} ${unit}`;
}

function formatNumber(value) {
  if (isBlank(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('th-TH') : safeDisplayText(value);
}

function safeHttpUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (_) {
    return '';
  }
}

function showInfo(title, text) {
  if (window.Swal) {
    Swal.fire({ icon: 'info', title, text, confirmButtonText: 'ปิด', confirmButtonColor: '#0369a1' });
  } else {
    window.alert(`${title}\n${text}`);
  }
}

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
