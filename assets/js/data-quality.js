import { AppState } from './state.js';
import { isCoordinatePresent, isCoordinateInPhayao } from './map.js';
import { systemDisplayName, villageDisplayName, safeDisplayText } from './labels.js';

export function renderDataCompleteness() {
  const root = document.getElementById('dataCompletenessSummary');
  if (!root) return;

  const { systems, villages } = getAreaScope();
  const total = systems.length;
  if (!total && !villages.length) {
    root.innerHTML = '<p class="muted-text">ไม่มีข้อมูลในขอบเขตพื้นที่ที่เลือก</p>';
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
    <p class="completeness-note">ค่านี้ใช้ประกอบการตีความ Dashboard และคำนวณตามพื้นที่ที่เลือก โดยไม่มีการแก้ไขข้อมูลจากหน้า Dashboard</p>`;

  document.getElementById('btnOpenDataIssues')?.addEventListener('click', () => showIssueDetails(details));
}

function getAreaScope() {
  const { district, localAuthority } = AppState.filters;
  const villages = AppState.data.villages
    .filter(v => !district || v.district === district)
    .filter(v => !localAuthority || v.local_authority === localAuthority);
  const villageIds = new Set(villages.map(v => v.village_id));
  return { villages, systems: AppState.data.waterSystems.filter(s => villageIds.has(s.village_id)) };
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
  const allSystemVillageIds = new Set(AppState.data.waterSystems.map(system => system.village_id));
  const villagesWithoutSystem = villages.filter(village => isWaterworksVillage(village) && !allSystemVillageIds.has(village.village_id));

  // พิกัดที่หลุดขอบเขตยังถูกกันออกจาก Map ใน map.js แต่ไม่แสดงเป็นประเด็นใน UI
  const issueCount = coordMissing.length + capacityOutlier.length + villagesWithoutSystem.length;

  return { coordValid, coordMissing, capacityComplete, constructionComplete, drinkingQualityComplete, capacityOutlier, villagesWithoutSystem, issueCount };
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
  const html = `
    <div class="swal-data-issues">
      ${issueSection('ระบบไม่มีพิกัด', details.coordMissing.length, details.coordMissing.slice(0, 20).map(system => issueSystemRow(system, 'ไม่มีพิกัด')))}
      ${issueSection('กำลังผลิตสูงผิดปกติ (> 200 ลบ.ม./ชม.)', details.capacityOutlier.length, details.capacityOutlier.slice(0, 20).map(system => issueSystemRow(system, `${formatNumber(system.capacity_m3_hr)} ลบ.ม./ชม.`)))}
      ${issueSection('หมู่บ้านระบุว่ามีประปา แต่ไม่มีรายละเอียดระบบ', details.villagesWithoutSystem.length, details.villagesWithoutSystem.slice(0, 20).map(village => issueVillageRow(village)))}
    </div>`;

  if (window.Swal) {
    Swal.fire({ title: 'รายละเอียดความครบถ้วนของข้อมูล', html, width: 900, confirmButtonText: 'ปิด', confirmButtonColor: '#0f67b1' });
  }
}

function issueSection(title, count, rows) {
  return `
    <section class="issue-modal-section">
      <div class="issue-modal-title"><strong>${escapeHtml(title)}</strong><span>${formatNumber(count)}</span></div>
      <div class="issue-modal-list">${rows.length ? rows.join('') : '<div class="issue-modal-row"><small>ไม่พบรายการ</small></div>'}</div>
      ${count > rows.length ? `<p class="issue-modal-more">แสดงตัวอย่าง ${formatNumber(rows.length)} จาก ${formatNumber(count)} รายการ</p>` : ''}
    </section>`;
}

function issueSystemRow(system, detail) {
  const village = AppState.data.villages.find(v => v.village_id === system.village_id);
  return `<div class="issue-modal-row"><div><strong>${escapeHtml(systemDisplayName(system, village))}</strong><br><small>${escapeHtml(villageDisplayName(village))}${village?.district ? ` • อ.${escapeHtml(safeDisplayText(village.district))}` : ''}</small></div><small>${escapeHtml(detail)}</small></div>`;
}

function issueVillageRow(village) {
  return `<div class="issue-modal-row"><div><strong>${escapeHtml(villageDisplayName(village))}</strong><br><small>${escapeHtml(village.district ? `อ.${safeDisplayText(village.district)}` : '-')}${village.local_authority ? ` • ${escapeHtml(safeDisplayText(village.local_authority))}` : ''}</small></div><small>ไม่มีรายละเอียดระบบในข้อมูลต้นทาง</small></div>`;
}

function countPresent(rows, key) { return rows.filter(row => !isBlank(row[key])).length; }
function isWaterworksVillage(village) { return village.has_village_waterworks === true || village.has_village_waterworks === 1 || village.has_village_waterworks === '1' || village.has_village_waterworks === 'YES' || village.has_village_waterworks === 'มีประปาหมู่บ้าน'; }
function isBlank(value) { return value === '' || value === null || value === undefined; }
function formatNumber(value) { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString('th-TH') : String(value ?? '-'); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
