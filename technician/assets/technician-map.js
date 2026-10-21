/* Authenticated Management data stays here; both pages use the Public map engine. */
(() => {
  'use strict';

  let engine;
  let engineModule;
  let presentation;
  let labels;
  let onDetail;
  let findSystem;
  let villageForSystem;
  let initRequested = false;
  let pendingRender = null;
  let pendingFocus = null;
  let automaticLocationRequested = false;
  let automaticLocationQueued = false;

  Promise.all([
    import('../../assets/js/map-engine.js'),
    import('../../assets/js/map-presentation.js'),
    import('../../assets/js/labels.js')
  ]).then(modules => {
    [engineModule, presentation, labels] = modules;
    if (initRequested) start();
  }).catch(() => {
    if (!initRequested) return;
    const empty = document.getElementById('technicianMapEmpty');
    if (empty) {
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

  function start() {
    if (!initRequested || !engineModule) return false;
    if (!engine) engine = engineModule.createMapEngine({
      containerId: 'technicianWaterMap',
      fitButtonId: 'technicianMapFit',
      locationButtonId: 'technicianMapLocate',
      coordinates,
      deduplicateMarkers: true,
      allowUnrenderedFocus: true,
      findSystem: id => findSystem?.(id),
      villageForSystem: system => villageForSystem?.(system),
      onDetail: system => onDetail?.(String(system.system_id)),
      popupExtraHtml: (_system, point) => {
        const local = presentation.inPhayao({ lat: point[0], lng: point[1] });
        return local ? '' : '<div class="map-coordinate-warning">พิกัดอยู่นอกพื้นที่จังหวัดพะเยา โปรดตรวจสอบ</div>';
      },
      decorateMarker: (marker, system, village) => {
        const element = marker.getElement();
        if (!element) return;
        element.dataset.systemId = String(system.system_id);
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `ดูตำแหน่ง ${labels.systemDisplayName(system, village)}`);
        element.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            marker.openPopup();
          }
        });
      },
      onRendered: (count, filtered) => {
        document.getElementById('technicianMapScope').textContent =
          `${filtered ? 'กรองตามรายการปัจจุบัน · ' : 'แสดงทุกระบบ · '}${count.toLocaleString('th-TH')} จุดที่มีพิกัดใช้งานได้ รวมรายการที่ไม่แสดงบนหน้าสาธารณะ`;
        document.getElementById('technicianMapEmpty').classList.toggle('hidden', count > 0);
      }
    });
    if (!engine.init()) {
      const empty = document.getElementById('technicianMapEmpty');
      if (empty) {
        empty.textContent = 'ไม่สามารถโหลดแผนที่ได้ในขณะนี้';
        empty.classList.remove('hidden');
      }
      return false;
    }
    if (pendingRender) {
      const [systems, filtered] = pendingRender;
      pendingRender = null;
      engine.render(systems, filtered);
    }
    if (pendingFocus !== null) {
      const id = pendingFocus;
      pendingFocus = null;
      engine.focus(id);
    }
    if (automaticLocationQueued) {
      automaticLocationQueued = false;
      void engine.locateAutomatically();
    }
    return true;
  }

  function init(detailHandler, systemLookup, villageLookup) {
    onDetail = detailHandler;
    findSystem = systemLookup;
    villageForSystem = villageLookup;
    initRequested = true;
    if (engineModule) return start();
    return true;
  }

  function render(systems, filtered = false) {
    if (!initRequested) return;
    if (automaticLocationQueued) automaticLocationQueued = false;
    if (!engine) {
      pendingRender = [systems, filtered];
      return;
    }
    engine.render(systems, filtered);
  }

  function fit() {
    engine?.fit();
  }

  function focus(systemId) {
    const system = findSystem?.(systemId);
    if (!initRequested || !system || !coordinates(system)) return false;
    automaticLocationQueued = false;
    if (!engine) {
      pendingFocus = systemId;
      return true;
    }
    return engine.focus(systemId);
  }

  function locateAutomatically() {
    if (!initRequested || automaticLocationRequested) return false;
    automaticLocationRequested = true;
    if (!engine) {
      automaticLocationQueued = true;
      return true;
    }
    void engine.locateAutomatically();
    return true;
  }

  function clear() {
    initRequested = false;
    pendingRender = null;
    pendingFocus = null;
    automaticLocationRequested = false;
    automaticLocationQueued = false;
    engine?.clear();
  }

  window.VWSTechnicianMap = {
    init, render, fit, focus, clear, locateAutomatically, coordinates,
    invalidate: () => engine?.invalidate(),
    markerCount: () => engine?.markerCount() || 0,
    point: id => engine?.point(id) || null
  };
})();
