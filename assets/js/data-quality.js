import { AppState } from './state.js';
import {
  focusSystem,
  hasUsableCoordinate,
  isCoordinatePresent,
  isCoordinateInPhayao
} from './map.js';
import { openDrawer } from './drawer.js';
import { buildSystemDetailHtml } from './system-detail.js';
import { buildVillageDetailHtml } from './village-detail.js';
import { systemDisplayName, villageDisplayName, safeDisplayText } from './labels.js';
import { ISSUE_PAGE_SIZE, nextIssueVisibleCount } from './pagination.js';

export function renderDataCompleteness() {
  const root = document.getElementById('dataCompletenessSummary');
  if (!root) return;

  // Completeness follows the same filtered dataset visible in KPI/Map/Charts/
  // Watchlist. This prevents the completeness denominator from silently showing
  // province-wide values while the user is looking at a cross-filtered subset.
  const systems = AppState.filtered.waterSystems;
  const villages = AppState.filtered.villages;
  const total = systems.length;

  if (!total && !villages.length) {
    root.innerHTML = '<p class="muted-text">ไม่มีข้อมูลตามตัวกรองที่เลือก</p>';
    return;
  }

  const details = calculateDetails(systems, villages);
  root.innerHTML = `
    <div class="completeness-layout">
      <div class="completeness-grid">
        ${metric('พิกัดใช้งานได้', details.coordValid.length, total)}
        ${metric('กำลังผลิต', details.capacityComplete, total)}
        ${metric('ปีที่ก่อสร้าง', details.constructionComplete, total)}
        ${metric('ผลคุณภาพน้ำดื่ม', details.drinkingQualityComplete, total)}
      </div>
      <div class="completeness-issues">
        <p>ประเด็นข้อมูลต้นทางที่พบ</p>
        <strong class="${details.issueCount ? 'has-issues' : ''}">${formatNumber(details.issueCount)}</strong>
        <button id="btnOpenDataIssues" class="btn btn-outline" type="button"><i class="fa-solid fa-list" aria-hidden="true"></i>ดูรายละเอียด</button>
      </div>
    </div>
    <p class="completeness-note">คำนวณจากชุดข้อมูลที่กำลังแสดงตามตัวกรองปัจจุบัน ใช้ประกอบการตีความ Dashboard เท่านั้น และไม่มีการแก้ไขข้อมูลจากหน้า Dashboard</p>`;

  document.getElementById('btnOpenDataIssues')?.addEventListener('click', () => showIssueDetails(details));
}


function calculateDetails(systems, villages) {
  const coordValid = systems.filter(isCoordinateInPhayao);
  const coordMissing = systems.filter(system => !isCoordinatePresent(system));
  const capacityComplete = countPresent(systems, 'capacity_m3_hr');
  const constructionComplete = countPresent(systems, 'construction_year_be');
  const drinkingQualityComplete = systems.filter(system => system.drinking_water_quality && system.drinking_water_quality !== 'NO_DATA' && system.drinking_water_quality !== '-').length;
  const capacityOutlier = systems.filter(system => {
    if (isBlank(system.capacity_m3_hr)) return false;
    const n = Number(system.capacity_m3_hr);
    return Number.isFinite(n) && n > 200;
  });

  // A village is considered source-incomplete only when the source dataset really
  // has no linked system at all. A system being excluded by another filter must
  // never create a false "ไม่มีรายละเอียดระบบ" issue.
  const allSystemVillageIds = new Set(AppState.data.waterSystems.map(system => system.village_id));
  const villagesWithoutSystem = villages.filter(village => isWaterworksVillage(village) && !allSystemVillageIds.has(village.village_id));

  // Out-of-bounds coordinates remain excluded from Map internally, but the UI
  // intentionally does not expose an "outside Phayao" issue category.
  const issueCount = coordMissing.length + capacityOutlier.length + villagesWithoutSystem.length;

  return {
    coordValid,
    coordMissing,
    capacityComplete,
    constructionComplete,
    drinkingQualityComplete,
    capacityOutlier,
    villagesWithoutSystem,
    issueCount
  };
}

function metric(label, value, total) {
  const percent = total ? (value / total) * 100 : 0;
  return `
    <div class="completeness-metric">
      <div class="completeness-metric-top"><span>${escapeHtml(label)}</span><strong>${percent.toFixed(1)}%</strong></div>
      <div class="completeness-progress" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent.toFixed(1)}"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></div>
      <small>${formatNumber(value)} / ${formatNumber(total)} ระบบ</small>
    </div>`;
}

function showIssueDetails(details) {
  const sections = {
    coordMissing: {
      title: 'ระบบไม่มีพิกัด',
      rows: details.coordMissing.map(system => issueSystemRow(system, 'ไม่มีพิกัด'))
    },
    capacityOutlier: {
      title: 'กำลังผลิตสูงผิดปกติ (> 200 ลบ.ม./ชม.)',
      rows: details.capacityOutlier.map(system => issueSystemRow(system, `${formatNumber(system.capacity_m3_hr)} ลบ.ม./ชม.`))
    },
    villagesWithoutSystem: {
      title: 'หมู่บ้านระบุว่ามีประปา แต่ไม่มีรายละเอียดระบบ',
      rows: details.villagesWithoutSystem.map(village => issueVillageRow(village))
    }
  };

  const html = `
    <div class="swal-data-issues">
      ${Object.entries(sections).map(([key, section]) => issueSection(key, section.title, section.rows)).join('')}
    </div>`;

  if (!window.Swal) return;

  Swal.fire({
    title: 'รายละเอียดความครบถ้วนของข้อมูล',
    html,
    width: 900,
    confirmButtonText: 'ปิด',
    confirmButtonColor: '#0f67b1',
    didOpen: popup => bindIssueModalActions(popup, sections)
  });
}

function issueSection(key, title, rows) {
  const total = rows.length;
  const visible = Math.min(ISSUE_PAGE_SIZE, total);

  return `
    <section class="issue-modal-section" data-issue-section="${escapeHtml(key)}" data-visible-count="${visible}">
      <div class="issue-modal-title"><strong>${escapeHtml(title)}</strong><span>${formatNumber(total)}</span></div>
      <div class="issue-modal-list" data-issue-list>${visible ? rows.slice(0, visible).join('') : '<div class="issue-modal-row"><small>ไม่พบรายการ</small></div>'}</div>
      ${total ? `
        <div class="issue-modal-footer">
          <p class="issue-modal-more" data-issue-status>แสดง ${formatNumber(visible)} จาก ${formatNumber(total)} รายการ</p>
          ${total > visible ? `
            <button class="btn btn-ghost" type="button" data-issue-more="${escapeHtml(key)}">
              <span>แสดงเพิ่มเติม</span>
              <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
            </button>` : ''}
        </div>` : ''}
    </section>`;
}

function bindIssueModalActions(popup, sections) {
  popup.addEventListener('click', event => {
    const moreButton = event.target.closest('[data-issue-more]');
    if (moreButton && popup.contains(moreButton)) {
      revealMoreRows(popup, moreButton, sections);
      return;
    }

    const actionButton = event.target.closest('[data-issue-action]');
    if (actionButton && popup.contains(actionButton)) {
      handleSystemIssueAction(actionButton);
      return;
    }

    const villageButton = event.target.closest('[data-issue-village-detail]');
    if (villageButton && popup.contains(villageButton)) {
      handleVillageDetail(villageButton.dataset.villageId);
    }
  });
}

function revealMoreRows(popup, button, sections) {
  const key = button.dataset.issueMore;
  const sectionData = sections[key];
  const sectionEl = popup.querySelector(`[data-issue-section="${cssEscape(key)}"]`);
  const list = sectionEl?.querySelector('[data-issue-list]');
  const status = sectionEl?.querySelector('[data-issue-status]');
  if (!sectionData || !sectionEl || !list) return;

  const current = Number(sectionEl.dataset.visibleCount || 0);
  const next = nextIssueVisibleCount(sectionData.rows.length, current);
  list.insertAdjacentHTML('beforeend', sectionData.rows.slice(current, next).join(''));
  sectionEl.dataset.visibleCount = String(next);
  if (status) status.textContent = `แสดง ${formatNumber(next)} จาก ${formatNumber(sectionData.rows.length)} รายการ`;
  if (next >= sectionData.rows.length) button.remove();
}

function handleSystemIssueAction(button) {
  const system = AppState.data.waterSystems.find(item => String(item.system_id) === String(button.dataset.systemId));
  if (!system) return;

  if (button.dataset.issueAction === 'detail') {
    const village = AppState.data.villages.find(item => item.village_id === system.village_id);
    Swal.close();
    window.setTimeout(() => openDrawer(buildSystemDetailHtml(system, village)), 0);
    return;
  }

  if (button.dataset.issueAction === 'map' && hasUsableCoordinate(system)) {
    Swal.close();
    window.setTimeout(() => focusSystem(system.system_id), 0);
  }
}

function handleVillageDetail(villageId) {
  const village = AppState.data.villages.find(item => String(item.village_id) === String(villageId));
  if (!village) return;

  Swal.close();
  window.setTimeout(() => {
    openDrawer(buildVillageDetailHtml(village), {
      eyebrow: 'ข้อมูลหมู่บ้าน',
      title: 'รายละเอียดพื้นที่',
      ariaLabel: 'รายละเอียดข้อมูลหมู่บ้าน'
    });
  }, 0);
}

function issueSystemRow(system, detail) {
  const village = AppState.data.villages.find(item => item.village_id === system.village_id);
  const displayName = systemDisplayName(system, village);
  const mapButton = hasUsableCoordinate(system)
    ? `
      <button class="action-button" type="button" data-issue-action="map" data-system-id="${escapeHtml(system.system_id)}" aria-label="ดูตำแหน่งบนแผนที่ ${escapeHtml(displayName)}">
        <i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>แผนที่</span>
      </button>`
    : '';

  return `
    <div class="issue-modal-row">
      <div class="issue-modal-row-main">
        <strong>${escapeHtml(displayName)}</strong><br>
        <small>${escapeHtml(villageDisplayName(village))}${village?.district ? ` • อ.${escapeHtml(safeDisplayText(village.district))}` : ''}</small>
      </div>
      <div class="issue-modal-row-side">
        <small>${escapeHtml(detail)}</small>
        <div class="row-actions">
          ${mapButton}
          <button class="action-button" type="button" data-issue-action="detail" data-system-id="${escapeHtml(system.system_id)}" aria-label="ดูรายละเอียด ${escapeHtml(displayName)}">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>รายละเอียด</span>
          </button>
        </div>
      </div>
    </div>`;
}

function issueVillageRow(village) {
  const displayName = villageDisplayName(village);
  return `
    <div class="issue-modal-row">
      <div class="issue-modal-row-main">
        <strong>${escapeHtml(displayName)}</strong><br>
        <small>${escapeHtml(village.district ? `อ.${safeDisplayText(village.district)}` : '-')}${village.local_authority ? ` • ${escapeHtml(safeDisplayText(village.local_authority))}` : ''}</small>
      </div>
      <div class="issue-modal-row-side">
        <small>ไม่มีรายละเอียดระบบในข้อมูลต้นทาง</small>
        <div class="row-actions">
          <button class="action-button" type="button" data-issue-village-detail data-village-id="${escapeHtml(village.village_id)}" aria-label="ดูรายละเอียดพื้นที่ ${escapeHtml(displayName)}">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>รายละเอียด</span>
          </button>
        </div>
      </div>
    </div>`;
}

function countPresent(rows, key) {
  return rows.filter(row => !isBlank(row[key])).length;
}

function isWaterworksVillage(village) {
  return village.has_village_waterworks === true ||
    village.has_village_waterworks === 1 ||
    village.has_village_waterworks === '1' ||
    village.has_village_waterworks === 'YES' ||
    village.has_village_waterworks === 'มีประปาหมู่บ้าน';
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('th-TH') : String(value ?? '-');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
