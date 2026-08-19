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
import { documentLinkInfo } from './document-preview.js';

export function buildSystemDetailHtml(system, village) {
  const systemName = systemDisplayName(system, village);
  const villageName = villageDisplayName(village);
  const document = documentLinkInfo(system.transfer_document_url || system.document_url || '');
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

      ${document.available ? documentCard(document) : ''}

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
    </div>`;
}

export function getSystemDocumentInfo(system) {
  return documentLinkInfo(system?.transfer_document_url || system?.document_url || '');
}

function documentCard(document) {
  return `
    <section class="detail-document-card" aria-label="เอกสารอ้างอิง">
      <div class="detail-document-card-layout">
        <div class="detail-document-card-copy">
          <p class="detail-document-eyebrow">เอกสารอ้างอิง</p>
          <p class="detail-document-title">เอกสารการถ่ายโอน</p>
          <p class="detail-document-note">เปิดดูในหน้าเว็บก่อน โดยไม่สั่งดาวน์โหลดอัตโนมัติ</p>
        </div>
        <a
          class="detail-document-button"
          href="${escapeHtml(document.previewUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          data-document-preview
        >
          <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
          ดูเอกสาร
        </a>
      </div>
    </section>`;
}

function shouldShowTransferSection(system) {
  return system.establishment_type === 'TRANSFERRED' ||
         !isBlank(system.transfer_year_be) ||
         !isBlank(system.transfer_year) ||
         !isBlank(system.transfer_agency) ||
         system.transfer_document_status === 'AVAILABLE';
}

function detailSection(title, items) {
  return `
    <div>
      <p class="detail-section-title">${escapeHtml(title)}</p>
      <div class="detail-grid">
        ${items.map(([label, value]) => detailItem(label, value)).join('')}
      </div>
    </div>`;
}

function detailItem(label, value) {
  return `
    <div class="detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(isBlank(value) ? '-' : value)}</strong>
    </div>`;
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
  const lat = Number(system?.latitude);
  const lng = Number(system?.longitude);

  if (isBlank(system?.latitude) || isBlank(system?.longitude) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '-';
  }

  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
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
  return Number.isFinite(n)
    ? Math.trunc(n).toLocaleString('th-TH', { useGrouping: false })
    : safeDisplayText(value);
}

function valueWithUnit(value, unit) {
  return isBlank(value) ? '-' : `${formatNumber(value)} ${unit}`;
}

function formatNumber(value) {
  if (isBlank(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('th-TH') : safeDisplayText(value);
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
