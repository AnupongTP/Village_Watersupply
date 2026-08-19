import { villageDisplayName, safeDisplayText } from './labels.js';

export function buildVillageDetailHtml(village) {
  const name = villageDisplayName(village);
  const waterworks = isWaterworksVillage(village)
    ? 'ระบุว่ามีประปาหมู่บ้าน'
    : 'ไม่ได้ระบุว่ามีประปาหมู่บ้าน';

  const sourceRows = [
    ['การประปาส่วนภูมิภาค', village?.pwa_households],
    ['การประปานครหลวง', village?.mwa_households],
    ['น้ำเชิงพาณิชย์', village?.commercial_households],
    ['ประปาจากหมู่บ้านอื่น', village?.other_village_pipe_households],
    ['ธนาคารน้ำ', village?.waterbank_households],
    ['แหล่งน้ำของครัวเรือน', village?.self_source_households],
    ['แหล่งน้ำธรรมชาติ', village?.natural_source_households]
  ].filter(([, value]) => !isBlank(value));

  return `
    <div class="detail-stack">
      <div>
        <h3 class="detail-title">${escapeHtml(name)}</h3>
        <p class="detail-subtitle">${escapeHtml(areaLabel(village))}</p>
      </div>

      <div class="detail-status-row">
        <span class="badge ${isWaterworksVillage(village) ? 'badge-success' : 'badge-muted'}">${escapeHtml(waterworks)}</span>
      </div>

      ${detailSection('ข้อมูลพื้นที่', [
        ['จังหวัด', safeDisplayText(village?.province, 'พะเยา')],
        ['อำเภอ', safeDisplayText(village?.district)],
        ['ตำบล', safeDisplayText(village?.subdistrict)],
        ['อปท.', safeDisplayText(village?.local_authority)],
        ['หมู่ที่', formatVillageNo(village?.village_no)]
      ])}

      ${sourceRows.length ? detailSection('จำนวนครัวเรือนตามแหล่งน้ำที่บันทึก', sourceRows.map(([label, value]) => [label, formatHouseholds(value)])) : ''}

      <p class="detail-subtitle">รายการนี้เป็นข้อมูลระดับหมู่บ้านจากต้นทาง และไม่มีรายละเอียดระบบประปาที่เชื่อมโยงในชุดข้อมูลปัจจุบัน</p>
    </div>`;
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

function areaLabel(village) {
  const parts = [];
  if (village?.district) parts.push(`อ.${safeDisplayText(village.district)}`);
  if (village?.local_authority) parts.push(safeDisplayText(village.local_authority));
  return parts.join(' • ') || 'จังหวัดพะเยา';
}

function formatVillageNo(value) {
  if (isBlank(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString('th-TH', { useGrouping: false }) : safeDisplayText(value);
}

function formatHouseholds(value) {
  if (isBlank(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString('th-TH')} ครัวเรือน` : safeDisplayText(value);
}

function isWaterworksVillage(village) {
  return village?.has_village_waterworks === true ||
    village?.has_village_waterworks === 1 ||
    village?.has_village_waterworks === '1' ||
    village?.has_village_waterworks === 'YES' ||
    village?.has_village_waterworks === 'มีประปาหมู่บ้าน';
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
