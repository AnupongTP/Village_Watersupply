import { AppState } from './state.js';
import { systemDisplayName } from './labels.js';
import { scrollToSectionById } from './ui.js';
import { openDrawer } from './drawer.js';
import { buildSystemDetailHtml } from './system-detail.js';
import { openNavigation } from './navigation.js';
import { requestCurrentUserPosition, userLocationErrorMessage } from './user-location.js';
import {
  HOME_VIEW, PHAYAO_BOUNDS, SYSTEM_POPUP_OPTIONS, systemMarkerOptions,
  buildMapPopup, addMapLegend, fitMapPoints, userLocationMarkerOptions,
  userLocationPopup, setUserLocationButtonBusy, showUserLocationError
} from './map-presentation.js';

let map;
let markerLayer;
let userLocationLayer;
let userLocationMarker;
let markerBySystemId = new Map();
let mapActionsBound = false;
let userLocationRequestInFlight = false;

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
  userLocationLayer = L.layerGroup().addTo(map);
  addMapLegend(map);
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

    const village = AppState.data.villages.find(v => v.village_id === system.village_id);
    const marker = L.circleMarker([lat, lng], systemMarkerOptions(system));
    marker.bindPopup(buildMapPopup(system, village, hasUsableCoordinate(system)), SYSTEM_POPUP_OPTIONS);

    marker.addTo(markerLayer);
    markerBySystemId.set(String(system.system_id), marker);
    bounds.push([lat, lng]);
  });

  if (hasActiveMapFilter() && bounds.length) {
    fitMapPoints(map, bounds);
  } else {
    goHome();
  }

  window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
}


export async function locateUser() {
  if (!map) initMap();
  if (userLocationRequestInFlight) return false;

  const button = document.getElementById('btnUserLocation');
  userLocationRequestInFlight = true;
  setUserLocationButtonBusy(button, true);

  try {
    const position = await requestCurrentUserPosition();
    showUserLocation(position);
    return true;
  } catch (error) {
    showUserLocationError(error, userLocationErrorMessage);
    return false;
  } finally {
    userLocationRequestInFlight = false;
    setUserLocationButtonBusy(button, false);
  }
}

export function showUserLocation(position) {
  if (!map) initMap();
  const lat = Number(position?.latitude);
  const lng = Number(position?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  userLocationLayer?.clearLayers();
  userLocationMarker = L.circleMarker([lat, lng], userLocationMarkerOptions());
  userLocationMarker.bindPopup(userLocationPopup(position), { maxWidth: 310, minWidth: 240 });

  userLocationMarker.addTo(userLocationLayer);
  map.setView([lat, lng], 16, { animate: true });
  userLocationMarker.openPopup();
  return true;
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

  fitMapPoints(map, bounds);
}

export function focusSystem(systemId) {
  if (!map) return false;

  const marker = markerBySystemId.get(String(systemId));
  if (!marker) return false;

  scrollToSectionById('map-section', true);
  const latLng = marker.getLatLng();

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      map.setView(latLng, 16, { animate: true });
      marker.openPopup();
    });
  });

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

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

