/* Authenticated Technician map. The Management caller owns the dataset and detail access. */
(() => {
  'use strict';

  let map;
  let markerLayer;
  let focusLayer;
  let userLocationLayer;
  let resizeObserver;
  let markers = new Map();
  let onDetail;
  let findSystem;
  let villageForSystem;
  let initRequested = false;
  let pendingRender = null;
  let pendingFocus = null;
  let locationPending = false;
  let locationGeneration = 0;
  let currentPositionRequest = null;
  let automaticLocationAttempted = false;
  let automaticLocationQueued = false;
  let mapInteractionRevision = 0;
  let presentation;
  let navigation;
  let userLocation;
  let labels;

  // This classic script is loaded before technician.js. Queue its first render until
  // the local Public presentation modules are ready, without changing script order.
  Promise.all([
    import('../../assets/js/map-presentation.js'),
    import('../../assets/js/navigation.js'),
    import('../../assets/js/user-location.js'),
    import('../../assets/js/labels.js')
  ]).then(modules => {
    [presentation, navigation, userLocation, labels] = modules;
    if (!initRequested) return;
    if (!initializeMap()) return;
    if (pendingRender) {
      const [systems, filtered] = pendingRender;
      pendingRender = null;
      renderNow(systems, filtered);
    }
    if (pendingFocus !== null) {
      const id = pendingFocus;
      pendingFocus = null;
      focus(id);
    }
    if (automaticLocationQueued) {
      automaticLocationQueued = false;
      void runAutomaticLocation();
    }
  }).catch(() => {
    const empty = document.getElementById('technicianMapEmpty');
    if (empty && initRequested) {
      empty.textContent = 'ไม่สามารถโหลดแผนที่ได้ในขณะนี้';
      empty.classList.remove('hidden');
    }
  });

  function coordinates(system) {
    if (system?.latitude == null || system?.longitude == null ||
        String(system.latitude).trim() === '' || String(system.longitude).trim() === '') return null;
    const lat = Number(system.latitude);
    const lng = Number(system.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return [lat, lng];
  }

  function invalidatePendingLocation() {
    mapInteractionRevision++;
    automaticLocationQueued = false;
  }

  function requestPositionOnce() {
    if (!currentPositionRequest) {
      const request = userLocation.requestCurrentUserPosition();
      currentPositionRequest = request;
      request.then(
        () => { if (currentPositionRequest === request) currentPositionRequest = null; },
        () => { if (currentPositionRequest === request) currentPositionRequest = null; }
      );
    }
    return currentPositionRequest;
  }

  function init(detailHandler, systemLookup, villageLookup) {
    onDetail = detailHandler;
    findSystem = systemLookup;
    villageForSystem = villageLookup;
    initRequested = true;
    if (presentation) return initializeMap();
    return true;
  }

  function initializeMap() {
    if (map) return true;
    if (!window.L) {
      const empty = document.getElementById('technicianMapEmpty');
      empty.textContent = 'ไม่สามารถโหลดแผนที่ได้ในขณะนี้';
      empty.classList.remove('hidden');
      return false;
    }
    // Reduced motion uses Leaflet's immediate zoom path rather than a CSS-suppressed transition.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    map = L.map('technicianWaterMap', { zoomControl: true, minZoom: 7, preferCanvas: false, zoomAnimation: !reduceMotion })
      .setView(presentation.HOME_VIEW.center, presentation.HOME_VIEW.zoom);
    const satellite = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    }).addTo(map);
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    });
    L.control.layers({ 'ดาวเทียม': satellite, 'แผนที่ถนน': street }, null, { position: 'topright', collapsed: true }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    focusLayer = L.layerGroup().addTo(map);
    userLocationLayer = L.layerGroup().addTo(map);
    presentation.addMapLegend(map);
    document.getElementById('technicianWaterMap').addEventListener('click', event => {
      const button = event.target.closest('[data-map-action]');
      if (!button || button.disabled) return;
      const system = findSystem?.(button.dataset.systemId);
      if (!system) return;
      if (button.dataset.mapAction === 'detail') {
        map.closePopup();
        onDetail?.(String(system.system_id));
      } else if (button.dataset.mapAction === 'navigate') {
        navigation.openNavigation({
          latitude: system.latitude,
          longitude: system.longitude,
          label: labels.systemDisplayName(system, villageForSystem?.(system))
        });
      }
    });
    document.getElementById('technicianMapFit').addEventListener('click', fit);
    document.getElementById('technicianMapLocate').addEventListener('click', locate);
    for (const eventName of ['pointerdown', 'wheel', 'keydown']) {
      document.getElementById('technicianWaterMap').addEventListener(eventName, invalidatePendingLocation);
    }
    resizeObserver = new ResizeObserver(() => requestAnimationFrame(() => map?.invalidateSize({ pan: false })));
    resizeObserver.observe(document.getElementById('technicianWaterMap'));
    return true;
  }

  function popup(system) {
    const point = coordinates(system);
    const outside = point && !presentation.inPhayao({ lat: point[0], lng: point[1] });
    const warning = outside
      ? '<div class="map-coordinate-warning">พิกัดอยู่นอกพื้นที่จังหวัดพะเยา โปรดตรวจสอบ</div>' : '';
    return presentation.buildMapPopup(system, villageForSystem?.(system), Boolean(point), warning);
  }

  function createMarker(system, point) {
    const marker = L.circleMarker(point, presentation.systemMarkerOptions(system))
      .bindPopup(popup(system), presentation.SYSTEM_POPUP_OPTIONS);
    return marker;
  }

  function addMarker(marker, layer, system) {
    marker.addTo(layer);
    const element = marker.getElement();
    if (!element) return marker;
    element.dataset.systemId = String(system.system_id);
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `ดูตำแหน่ง ${labels.systemDisplayName(system, villageForSystem?.(system))}`);
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        marker.openPopup();
      }
    });
    return marker;
  }

  function render(systems, filtered = false) {
    if (automaticLocationQueued) invalidatePendingLocation();
    if (!initRequested || !map) {
      pendingRender = [systems, filtered];
      return;
    }
    renderNow(systems, filtered);
  }

  function renderNow(systems, filtered) {
    mapInteractionRevision++;
    markerLayer.clearLayers();
    focusLayer.clearLayers();
    markers = new Map();
    for (const system of systems) {
      const point = coordinates(system);
      if (!point || !system.system_id || markers.has(String(system.system_id))) continue;
      const marker = addMarker(createMarker(system, point), markerLayer, system);
      markers.set(String(system.system_id), marker);
    }
    const count = markers.size;
    document.getElementById('technicianMapScope').textContent =
      `${filtered ? 'กรองตามรายการปัจจุบัน · ' : 'แสดงทุกระบบ · '}${count.toLocaleString('th-TH')} จุดที่มีพิกัดใช้งานได้ รวมรายการที่ไม่แสดงใน Public`;
    document.getElementById('technicianMapEmpty').classList.toggle('hidden', count > 0);

    const local = [...markers.values()].map(marker => marker.getLatLng()).filter(presentation.inPhayao);
    if (filtered && local.length) presentation.fitMapPoints(map, local);
    else goHome();
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }

  function goHome() {
    map?.setView(presentation.HOME_VIEW.center, presentation.HOME_VIEW.zoom, { animate: false });
  }

  function fit() {
    if (!map) return;
    invalidatePendingLocation();
    const local = [...markers.values()].map(marker => marker.getLatLng()).filter(presentation.inPhayao);
    presentation.fitOverviewPoints(map, local);
  }

  function focus(systemId) {
    const system = findSystem?.(systemId);
    const point = coordinates(system);
    if (!initRequested || !system || !point) return false;
    invalidatePendingLocation();
    const revision = mapInteractionRevision;
    if (!map) {
      pendingFocus = systemId;
      return true;
    }
    focusLayer.clearLayers();
    const marker = markers.get(String(systemId)) || addMarker(createMarker(system, point), focusLayer, system);
    requestAnimationFrame(() => {
      if (!initRequested || revision !== mapInteractionRevision || findSystem?.(systemId) !== system) return;
      map.invalidateSize({ pan: false });
      map.setView(marker.getLatLng(), 16, { animate: true });
      marker.openPopup();
    });
    return true;
  }

  async function locate() {
    if (!map || locationPending) return false;
    const button = document.getElementById('technicianMapLocate');
    const generation = locationGeneration;
    invalidatePendingLocation();
    const revision = mapInteractionRevision;
    locationPending = true;
    presentation.setUserLocationButtonBusy(button, true);
    try {
      const position = await requestPositionOnce();
      if (generation !== locationGeneration || revision !== mapInteractionRevision) return false;
      return showUserLocation(position);
    } catch (error) {
      if (generation === locationGeneration && revision === mapInteractionRevision) {
        presentation.showUserLocationError(error, userLocation.userLocationErrorMessage);
      }
      return false;
    } finally {
      if (generation === locationGeneration) {
        locationPending = false;
        presentation.setUserLocationButtonBusy(button, false);
      }
    }
  }

  function showUserLocation(position) {
    const lat = Number(position.latitude);
    const lng = Number(position.longitude);
    userLocationLayer.clearLayers();
    const marker = L.circleMarker([lat, lng], presentation.userLocationMarkerOptions())
      .bindPopup(presentation.userLocationPopup(position), { maxWidth: 310, minWidth: 240 })
      .addTo(userLocationLayer);
    map.setView([lat, lng], 16, { animate: true });
    marker.openPopup();
    return true;
  }

  function locateAutomatically() {
    if (!initRequested || automaticLocationAttempted) return false;
    automaticLocationAttempted = true;
    if (!map) {
      automaticLocationQueued = true;
      return true;
    }
    void runAutomaticLocation();
    return true;
  }

  async function runAutomaticLocation() {
    const generation = locationGeneration;
    const revision = mapInteractionRevision;
    try {
      const position = await requestPositionOnce();
      if (generation !== locationGeneration || revision !== mapInteractionRevision || !initRequested) return false;
      return showUserLocation(position);
    } catch (_) {
      if (generation === locationGeneration && revision === mapInteractionRevision && initRequested) goHome();
      return false;
    }
  }

  function clear() {
    initRequested = false;
    pendingRender = null;
    pendingFocus = null;
    locationGeneration++;
    invalidatePendingLocation();
    automaticLocationAttempted = false;
    currentPositionRequest = null;
    locationPending = false;
    if (presentation) presentation.setUserLocationButtonBusy(document.getElementById('technicianMapLocate'), false);
    markerLayer?.clearLayers();
    focusLayer?.clearLayers();
    userLocationLayer?.clearLayers();
    markers = new Map();
  }

  window.VWSTechnicianMap = {
    init, render, fit, focus, clear, coordinates, locateAutomatically,
    invalidate: () => map?.invalidateSize({ pan: false }),
    markerCount: () => markers.size,
    point: id => markers.get(String(id))?.getLatLng() || null
  };
})();
