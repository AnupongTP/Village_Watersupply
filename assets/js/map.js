import { AppState } from './state.js';
import {
  operationalStatusLabel,
  qualityLabel,
  quantityLabel,
  systemTypeLabel,
  systemDisplayName,
  villageDisplayName,
  safeDisplayText
} from './labels.js';
import { scrollToSectionById } from './ui.js';
import { openDrawer } from './drawer.js';
import { buildSystemDetailHtml } from './system-detail.js';
import { openNavigation } from './navigation.js';

let map;
let markerLayer;
let markerBySystemId = new Map();
let mapActionsBound = false;

const HOME_VIEW = { center: [19.171194, 99.874972], zoom: 13 };

const PHAYAO_BOUNDS = {
  minLat: 18.70,
  maxLat: 20.00,
  minLng: 99.40,
  maxLng: 100.70
};

export function initMap() {
  if (map) return;

  map = L.map('waterMap', {
    zoomControl: true,
    minZoom: 7,
    preferCanvas: false
  }).setView(HOME_VIEW.center, HOME_VIEW.zoom);

  const satellite = L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    }
  );

  const street = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }
  );

  satellite.addTo(map);
  L.control.layers(
    { 'ดาวเทียม': satellite, 'แผนที่ถนน': street },
    null,
    { position: 'topright', collapsed: true }
  ).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  addLegend();
  bindMapActions();

  const resizeObserver = new ResizeObserver(() => {
    window.requestAnimationFrame(() => map?.invalidateSize({ pan: false }));
  });

  const mapEl = document.getElementById('waterMap');
  if (mapEl) resizeObserver.observe(mapEl);
}

export function renderMap() {
  if (!map) initMap();

  markerLayer.clearLayers();
  markerBySystemId = new Map();

  const points = AppState.filtered.waterSystems.filter(hasUsableCoordinate);
  const bounds = [];

  points.forEach(system => {
    const lat = Number(system.latitude);
    const lng = Number(system.longitude);

    const marker = L.circleMarker([lat, lng], {
      radius: 6.5,
      weight: 2.2,
      color: '#ffffff',
      opacity: 1,
      fillColor: getMarkerColor(system),
      fillOpacity: .95,
      className: 'water-system-marker'
    });

    marker.bindPopup(buildPopup(system), {
      maxWidth: 350,
      minWidth: 260,
      autoPanPadding: [24, 24]
    });

    marker.addTo(markerLayer);
    markerBySystemId.set(String(system.system_id), marker);
    bounds.push([lat, lng]);
  });

  if (hasActiveMapFilter() && bounds.length) {
    fitBoundsFromArray(bounds);
  } else {
    goHome();
  }

  window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
}

export function goHome() {
  if (!map) return;
  map.setView(HOME_VIEW.center, HOME_VIEW.zoom, { animate: false });
}

export function fitVisiblePoints() {
  if (!map) return;

  const bounds = AppState.filtered.waterSystems
    .filter(hasUsableCoordinate)
    .map(system => [Number(system.latitude), Number(system.longitude)]);

  if (!bounds.length) {
    goHome();
    return;
  }

  fitBoundsFromArray(bounds);
}

export function focusSystem(systemId) {
  if (!map) return false;

  const marker = markerBySystemId.get(String(systemId));
  if (!marker) return false;

  scrollToSectionById('map-section', true);
  const latLng = marker.getLatLng();

  window.setTimeout(() => {
    map.invalidateSize({ pan: false });
    map.setView(latLng, 16, { animate: true });
    marker.openPopup();
  }, 450);

  return true;
}

export function isCoordinatePresent(system) {
  return !isBlank(system?.latitude) && !isBlank(system?.longitude);
}

export function isCoordinateNumeric(system) {
  if (!isCoordinatePresent(system)) return false;

  const lat = Number(system.latitude);
  const lng = Number(system.longitude);

  return Number.isFinite(lat) &&
         Number.isFinite(lng) &&
         lat >= -90 && lat <= 90 &&
         lng >= -180 && lng <= 180;
}

export function isCoordinateInPhayao(system) {
  if (!isCoordinateNumeric(system)) return false;

  const lat = Number(system.latitude);
  const lng = Number(system.longitude);

  return lat >= PHAYAO_BOUNDS.minLat &&
         lat <= PHAYAO_BOUNDS.maxLat &&
         lng >= PHAYAO_BOUNDS.minLng &&
         lng <= PHAYAO_BOUNDS.maxLng;
}

export function hasUsableCoordinate(system) {
  return isCoordinateInPhayao(system);
}

function bindMapActions() {
  if (mapActionsBound) return;

  const mapEl = document.getElementById('waterMap');
  if (!mapEl) return;

  mapActionsBound = true;

  mapEl.addEventListener('click', event => {
    const button = event.target.closest('[data-map-action]');
    if (!button || !mapEl.contains(button) || button.disabled) return;

    const system = findSystem(button.dataset.systemId);
    if (!system) return;

    const village = AppState.data.villages.find(v => v.village_id === system.village_id);

    if (button.dataset.mapAction === 'detail') {
      map?.closePopup();
      openDrawer(buildSystemDetailHtml(system, village));
      return;
    }

    if (button.dataset.mapAction === 'navigate') {
      openNavigation({
        latitude: system.latitude,
        longitude: system.longitude,
        label: systemDisplayName(system, village)
      });
    }
  });
}

function findSystem(systemId) {
  return AppState.data.waterSystems.find(system => String(system.system_id) === String(systemId));
}

function fitBoundsFromArray(bounds) {
  if (!map || !bounds.length) return;

  if (bounds.length === 1) {
    map.setView(bounds[0], 15, { animate: false });
    return;
  }

  map.fitBounds(bounds, {
    padding: [28, 28],
    maxZoom: 14,
    animate: false
  });
}

function hasActiveMapFilter() {
  const f = AppState.filters || {};
  return Boolean(
    f.search ||
    f.district ||
    f.localAuthority ||
    f.systemType ||
    f.operationalStatus ||
    f.drinkingWaterQuality ||
    f.waterQuantity
  );
}

function getMarkerColor(system) {
  if (system.operational_status === 'NOT_WORKING') return '#dc2626';
  if (system.water_quantity === 'INSUFFICIENT') return '#d97706';
  if (system.drinking_water_quality === 'FAIL') return '#e11d48';
  if (system.operational_status === 'WORKING') return '#059669';
  return '#64748b';
}

function buildPopup(system) {
  const village = AppState.data.villages.find(v => v.village_id === system.village_id);
  const displayName = systemDisplayName(system, village);
  const usableCoordinate = hasUsableCoordinate(system);

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

function addLegend() {
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
  if (isBlank(value)) return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('th-TH') : escapeHtml(value);
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
