import { AppState } from './state.js';
import { scrollToSectionById } from './ui.js';
import { openDrawer } from './drawer.js';
import { buildSystemDetailHtml } from './system-detail.js';
import { createMapEngine } from './map-engine.js';
import { PHAYAO_BOUNDS } from './map-presentation.js';

// Public owns its accepted dataset and visibility rules. The Leaflet controller
// itself is shared with the authenticated Technician adapter.
let engine;

function publicMap() {
  if (!engine) engine = createMapEngine({
    containerId: 'waterMap',
    fitButtonId: 'btnMapFit',
    locationButtonId: 'btnUserLocation',
    coordinates: system => hasUsableCoordinate(system)
      ? [Number(system.latitude), Number(system.longitude)] : null,
    findSystem: id => AppState.data.waterSystems.find(
      system => String(system.system_id) === String(id)
    ),
    villageForSystem: system => AppState.data.villages.find(
      village => village.village_id === system.village_id
    ),
    onDetail: (system, village) => openDrawer(buildSystemDetailHtml(system, village)),
    onFocusStart: () => scrollToSectionById('map-section', true),
    focusFrameCount: 2
  });
  return engine;
}

export function initMap() {
  return publicMap().init();
}

export function renderMap() {
  const map = publicMap();
  if (!map.init()) return false;
  return map.render(AppState.filtered.waterSystems, hasActiveMapFilter());
}

export function locateUser() {
  const map = publicMap();
  if (!map.init()) return Promise.resolve(false);
  return map.locate();
}

export function locateUserAutomatically() {
  const map = publicMap();
  if (!map.init()) return Promise.resolve(false);
  return map.locateAutomatically();
}

export function showUserLocation(position) {
  const map = publicMap();
  if (!map.init()) return false;
  return map.showUserLocation(position);
}

export function goHome() {
  engine?.goHome();
}

export function fitVisiblePoints() {
  engine?.fit();
}

export function focusSystem(systemId) {
  return engine?.focus(systemId) || false;
}

export function isCoordinatePresent(system) {
  return !isBlank(system?.latitude) && !isBlank(system?.longitude);
}

export function isCoordinateNumeric(system) {
  if (!isCoordinatePresent(system)) return false;
  const lat = Number(system.latitude);
  const lng = Number(system.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isCoordinateInPhayao(system) {
  if (!isCoordinateNumeric(system)) return false;
  const lat = Number(system.latitude);
  const lng = Number(system.longitude);
  return lat >= PHAYAO_BOUNDS.minLat && lat <= PHAYAO_BOUNDS.maxLat &&
    lng >= PHAYAO_BOUNDS.minLng && lng <= PHAYAO_BOUNDS.maxLng;
}

export function hasUsableCoordinate(system) {
  return isCoordinateInPhayao(system);
}

function hasActiveMapFilter() {
  const f = AppState.filters || {};
  return Boolean(
    f.search || f.district || f.localAuthority || f.systemType ||
    f.operationalStatus || f.drinkingWaterQuality || f.waterQuantity
  );
}

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}
