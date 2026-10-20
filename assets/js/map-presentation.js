import {
  operationalStatusLabel, qualityLabel, quantityLabel, systemTypeLabel,
  systemDisplayName, villageDisplayName, safeDisplayText
} from './labels.js';

// Presentation shared by the Public and authenticated Technician maps. No dataset or auth state lives here.
export const HOME_VIEW = Object.freeze({ center: [19.171194, 99.874972], zoom: 13 });
export const PHAYAO_BOUNDS = Object.freeze({ minLat: 18.70, maxLat: 20.00, minLng: 99.40, maxLng: 100.70 });
export const SYSTEM_POPUP_OPTIONS = Object.freeze({ maxWidth: 350, minWidth: 260, autoPanPadding: [24, 24] });

export function inPhayao(point) {
  return point.lat >= PHAYAO_BOUNDS.minLat && point.lat <= PHAYAO_BOUNDS.maxLat &&
    point.lng >= PHAYAO_BOUNDS.minLng && point.lng <= PHAYAO_BOUNDS.maxLng;
}

export function markerColor(system) {
  if (system.operational_status === 'NOT_WORKING') return '#dc2626';
  if (system.water_quantity === 'INSUFFICIENT') return '#d97706';
  if (system.drinking_water_quality === 'FAIL') return '#e11d48';
  if (system.operational_status === 'WORKING') return '#059669';
  return '#64748b';
}

export function systemMarkerOptions(system) {
  return {
    radius: 6.5, weight: 2.2, color: '#ffffff', opacity: 1,
    fillColor: markerColor(system), fillOpacity: .95, className: 'water-system-marker'
  };
}

export function buildMapPopup(system, village, usableCoordinate, additionalHtml = '') {
  const displayName = systemDisplayName(system, village);
  return `
    <div class="map-popup">
      <strong>${escapeHtml(displayName)}</strong>
      <div class="popup-muted">${escapeHtml(villageDisplayName(village))}</div>
      <div class="popup-muted">${escapeHtml(areaLabel(village))}</div>
      <hr>
      <div>ประเภทระบบ: ${escapeHtml(systemTypeLabel(system.system_type))}</div>
      <div>สถานะระบบ: ${escapeHtml(operationalStatusLabel(system.operational_status))}</div>
      <div>คุณภาพน้ำดื่ม: ${escapeHtml(qualityLabel(system.drinking_water_quality))}</div>
      <div>ปริมาณน้ำ: ${escapeHtml(quantityLabel(system.water_quantity))}</div>
      <div>ครัวเรือนรับน้ำ: ${formatNumber(system.households_served)}</div>
      ${additionalHtml}
      <div class="map-popup-actions">
        <button
          type="button"
          class="map-popup-action map-popup-action-secondary"
          data-map-action="detail"
          data-system-id="${escapeHtml(system.system_id)}"
          aria-label="ดูรายละเอียด ${escapeHtml(displayName)}"
        >
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          รายละเอียด
        </button>
        <button
          type="button"
          class="map-popup-action map-popup-action-primary"
          data-map-action="navigate"
          data-system-id="${escapeHtml(system.system_id)}"
          ${usableCoordinate ? '' : 'disabled'}
          aria-label="นำทางไปยัง ${escapeHtml(displayName)}"
        >
          <i class="fa-solid fa-diamond-turn-right" aria-hidden="true"></i>
          นำทาง
        </button>
      </div>
    </div>`;
}

export function addMapLegend(map) {
  const Legend = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <strong>สถานะจุด</strong>
        ${legendRow('#dc2626', 'ใช้การไม่ได้')}
        ${legendRow('#d97706', 'น้ำไม่เพียงพอ')}
        ${legendRow('#e11d48', 'น้ำดื่มไม่ผ่าน')}
        ${legendRow('#059669', 'ใช้การได้')}
        ${legendRow('#64748b', 'ไม่มีข้อมูล')}`;
      return div;
    }
  });
  map.addControl(new Legend());
}

export function fitMapPoints(map, bounds) {
  if (!map || !bounds.length) return;
  if (bounds.length === 1) {
    map.setView(bounds[0], 15, { animate: false });
    return;
  }
  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14, animate: false });
}

export function userLocationMarkerOptions() {
  return {
    radius: 8.5, weight: 3, color: '#ffffff', opacity: 1,
    fillColor: '#0284c7', fillOpacity: 1, className: 'user-location-marker'
  };
}

export function userLocationPopup(position) {
  const accuracy = Number(position?.accuracy);
  const accuracyText = Number.isFinite(accuracy)
    ? `<div class="popup-muted">ความแม่นยำโดยประมาณ ${formatDistance(accuracy)}</div>` : '';
  return `
    <div class="map-popup user-location-popup">
      <strong>ตำแหน่งของคุณ</strong>
      ${accuracyText}
    </div>`;
}

export function setUserLocationButtonBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.querySelector('i')?.classList.toggle('fa-spin', busy);
  const label = button.querySelector('[data-user-location-label]');
  if (label) label.textContent = busy ? 'กำลังค้นหา...' : 'ตำแหน่งฉัน';
}

export function showUserLocationError(error, userLocationErrorMessage) {
  const message = userLocationErrorMessage(error);
  if (window.Swal) {
    Swal.fire({
      icon: 'info', title: 'ไม่สามารถใช้ตำแหน่งปัจจุบันได้', text: message,
      confirmButtonText: 'ปิด', confirmButtonColor: '#0369a1'
    });
    return;
  }
  window.alert(message);
}

function legendRow(color, label) {
  return `<div class="map-legend-row"><span class="map-legend-dot" style="background:${color}"></span><span>${label}</span></div>`;
}

function areaLabel(village) {
  const parts = [];
  if (village?.district) parts.push(`อ.${safeDisplayText(village.district)}`);
  if (village?.local_authority) parts.push(safeDisplayText(village.local_authority));
  return parts.join(' • ') || '-';
}

function formatNumber(value) {
  if (value === '' || value === null || value === undefined) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('th-TH') : escapeHtml(value);
}

function formatDistance(meters) {
  const value = Math.max(0, Number(meters) || 0);
  if (value >= 1000) return `${(value / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })} กม.`;
  return `${Math.round(value).toLocaleString('th-TH')} ม.`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
