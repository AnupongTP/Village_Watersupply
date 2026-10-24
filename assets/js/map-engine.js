import { systemDisplayName } from './labels.js';
import { openNavigation } from './navigation.js';
import { requestCurrentUserPosition, userLocationErrorMessage } from './user-location.js';
import {
  HOME_VIEW, SYSTEM_POPUP_OPTIONS, inPhayao, systemMarkerOptions,
  buildMapPopup, addMapLegend, fitMapPoints, fitOverviewPoints,
  userLocationMarkerOptions, userLocationPopup, setUserLocationButtonBusy,
  showUserLocationError
} from './map-presentation.js';

// The Public map controller is shared by both pages. Dataset, permissions and
// detail access are supplied by the caller; no application state lives here.
export function createMapEngine(config) {
  let map;
  let markerLayer;
  let focusLayer;
  let userLocationLayer;
  let resizeObserver;
  let markers = new Map();
  let renderedPoints = [];
  let active = false;
  let locationPending = false;
  let locationGeneration = 0;
  let currentPositionRequest = null;
  let automaticLocationAttempted = false;
  let mapInteractionRevision = 0;

  function invalidatePendingLocation() {
    mapInteractionRevision++;
  }

  function requestPositionOnce() {
    if (!currentPositionRequest) {
      const request = requestCurrentUserPosition();
      currentPositionRequest = request;
      request.then(
        () => { if (currentPositionRequest === request) currentPositionRequest = null; },
        () => { if (currentPositionRequest === request) currentPositionRequest = null; }
      );
    }
    return currentPositionRequest;
  }

  function init() {
    if (map) { active = true; return true; }
    const mapEl = document.getElementById(config.containerId);
    if (!mapEl || !window.L) return false;

    // Keep Leaflet's Public defaults for zoom, wheel, dragging and animation.
    map = L.map(config.containerId, {
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
      { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
    );
    satellite.addTo(map);
    L.control.layers(
      { 'ดาวเทียม': satellite, 'แผนที่ถนน': street },
      null,
      { position: 'topright', collapsed: true }
    ).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    focusLayer = L.layerGroup().addTo(map);
    userLocationLayer = L.layerGroup().addTo(map);
    addMapLegend(map);

    mapEl.addEventListener('click', event => {
      const button = event.target.closest('[data-map-action]');
      if (!active || !button || !mapEl.contains(button) || button.disabled) return;
      const system = config.findSystem(button.dataset.systemId);
      if (!system) return;
      const village = config.villageForSystem(system);
      if (button.dataset.mapAction === 'detail') {
        map.closePopup();
        config.onDetail(system, village);
      } else if (button.dataset.mapAction === 'navigate') {
        openNavigation({
          latitude: system.latitude,
          longitude: system.longitude,
          label: systemDisplayName(system, village)
        });
      }
    });
    for (const eventName of ['pointerdown', 'wheel', 'keydown']) {
      mapEl.addEventListener(eventName, invalidatePendingLocation);
    }
    document.getElementById(config.fitButtonId)?.addEventListener('click', fit);
    document.getElementById(config.locationButtonId)?.addEventListener('click', locate);
    resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(invalidate));
    resizeObserver.observe(mapEl);
    active = true;
    return true;
  }

  function addMarker(system, point, layer) {
    const village = config.villageForSystem(system);
    const extra = config.popupExtraHtml?.(system, point) || '';
    const popupOptions = window.matchMedia('(max-width: 767px)').matches
      ? { ...SYSTEM_POPUP_OPTIONS, keepInView: true, autoPanPaddingTopLeft: [24, 100], autoPanPaddingBottomRight: [24, 16] }
      : SYSTEM_POPUP_OPTIONS;
    const marker = L.circleMarker(point, systemMarkerOptions(system))
      .bindPopup(buildMapPopup(system, village, true, extra), popupOptions)
      .addTo(layer);
    config.decorateMarker?.(marker, system, village);
    return marker;
  }

  function render(systems, filtered = false) {
    if (!active || !map) return false;
    invalidatePendingLocation();
    markerLayer.clearLayers();
    focusLayer.clearLayers();
    markers = new Map();
    renderedPoints = [];
    const bounds = [];
    for (const system of systems) {
      const point = config.coordinates(system);
      if (!point || (config.deduplicateMarkers &&
          (!system.system_id || markers.has(String(system.system_id))))) continue;
      const marker = addMarker(system, point, markerLayer);
      markers.set(String(system.system_id), marker);
      renderedPoints.push(point);
      if (inPhayao({ lat: point[0], lng: point[1] })) bounds.push(point);
    }
    config.onRendered?.(markers.size, filtered);
    if (filtered && bounds.length) fitMapPoints(map, bounds);
    else goHome();
    window.requestAnimationFrame(invalidate);
    return true;
  }

  function goHome() {
    if (map) map.setView(HOME_VIEW.center, HOME_VIEW.zoom, { animate: false });
  }

  function fit() {
    if (!active || !map) return;
    invalidatePendingLocation();
    fitOverviewPoints(map, renderedPoints);
  }

  function focus(systemId) {
    if (!active || !map) return false;
    const id = String(systemId);
    const system = config.findSystem(id);
    const existing = markers.get(id);
    if (!existing && !config.allowUnrenderedFocus) return false;
    if (!system && !existing) return false;
    const point = system && config.coordinates(system);
    if (!existing && !point) return false;
    invalidatePendingLocation();
    const revision = mapInteractionRevision;
    config.onFocusStart?.();
    focusLayer.clearLayers();
    const marker = existing || addMarker(system, point, focusLayer);
    const move = () => {
      if (!active || revision !== mapInteractionRevision ||
          (config.allowUnrenderedFocus && config.findSystem(id) !== system)) return;
      invalidate();
      if (config.centerFocusedPopup) {
        // Opening during an animated setView lets popup auto-pan fight the move.
        // Settle the map first, then center the measured popup, not its marker.
        map.closePopup();
        map.stop();
        map.setView(marker.getLatLng(), 16, { animate: false });
        const popup = marker.getPopup();
        const autoPan = popup.options.autoPan;
        popup.options.autoPan = false;
        try {
          marker.openPopup();
          const element = popup.getElement();
          if (element) {
            const box = element.getBoundingClientRect();
            const frame = map.getContainer().getBoundingClientRect();
            const mobile = window.matchMedia('(max-width: 767px)').matches;
            const centerY = frame.top + (mobile ? 100 + (frame.height - 116) / 2 : frame.height / 2);
            map.panBy([
              box.left + box.width / 2 - (frame.left + frame.width / 2),
              box.top + box.height / 2 - centerY
            ], { animate: false });
          }
        } finally {
          popup.options.autoPan = autoPan;
        }
        return;
      }
      map.setView(marker.getLatLng(), 16, { animate: true });
      marker.openPopup();
    };
    window.requestAnimationFrame(() => {
      if (config.focusFrameCount === 2) window.requestAnimationFrame(move);
      else move();
    });
    return true;
  }

  function showUserLocation(position) {
    if (!active || !map) return false;
    const lat = Number(position?.latitude);
    const lng = Number(position?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    userLocationLayer.clearLayers();
    const marker = L.circleMarker([lat, lng], userLocationMarkerOptions())
      .bindPopup(userLocationPopup(position), { maxWidth: 310, minWidth: 240 })
      .addTo(userLocationLayer);
    map.setView([lat, lng], 16, { animate: true });
    marker.openPopup();
    return true;
  }

  async function locate() {
    if (!active || !map || locationPending) return false;
    const button = document.getElementById(config.locationButtonId);
    const generation = locationGeneration;
    invalidatePendingLocation();
    const revision = mapInteractionRevision;
    locationPending = true;
    setUserLocationButtonBusy(button, true);
    try {
      const position = await requestPositionOnce();
      if (!active || generation !== locationGeneration || revision !== mapInteractionRevision) return false;
      return showUserLocation(position);
    } catch (error) {
      if (active && generation === locationGeneration && revision === mapInteractionRevision) {
        showUserLocationError(error, userLocationErrorMessage);
      }
      return false;
    } finally {
      if (generation === locationGeneration) {
        locationPending = false;
        setUserLocationButtonBusy(button, false);
      }
    }
  }

  async function locateAutomatically() {
    if (!active || !map || automaticLocationAttempted) return false;
    automaticLocationAttempted = true;
    const generation = locationGeneration;
    const revision = mapInteractionRevision;
    try {
      const position = await requestPositionOnce();
      if (!active || generation !== locationGeneration || revision !== mapInteractionRevision) return false;
      return showUserLocation(position);
    } catch (_) {
      if (active && generation === locationGeneration && revision === mapInteractionRevision) goHome();
      return false;
    }
  }

  function clear() {
    active = false;
    locationGeneration++;
    invalidatePendingLocation();
    automaticLocationAttempted = false;
    currentPositionRequest = null;
    locationPending = false;
    setUserLocationButtonBusy(document.getElementById(config.locationButtonId), false);
    map?.closePopup();
    markerLayer?.clearLayers();
    focusLayer?.clearLayers();
    userLocationLayer?.clearLayers();
    markers = new Map();
    renderedPoints = [];
  }

  function invalidate() {
    map?.invalidateSize({ pan: false });
  }

  return {
    init, render, fit, focus, clear, locate, locateAutomatically,
    showUserLocation, goHome, invalidate,
    markerCount: () => markers.size,
    point: id => markers.get(String(id))?.getLatLng() || null
  };
}
