/* Authenticated Technician map. Presentation only: the caller owns the Management dataset. */
(() => {
  'use strict';

  const HOME = [19.171194, 99.874972];
  const PHAYAO = { minLat: 18.70, maxLat: 20.00, minLng: 99.40, maxLng: 100.70 };
  let map;
  let markerLayer;
  let resizeObserver;
  let markers = new Map();
  let onDetail;
  let onLocationError;
  let userLocationLayer;
  let locationPending = false;

  function coordinates(system) {
    if (system?.latitude == null || system?.longitude == null || String(system.latitude).trim() === '' || String(system.longitude).trim() === '') return null;
    const lat = Number(system.latitude);
    const lng = Number(system.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return [lat, lng];
  }

  function color(system) {
    if (system.operational_status === 'NOT_WORKING') return '#dc2626';
    if (system.water_quantity === 'INSUFFICIENT') return '#d97706';
    if (system.drinking_water_quality === 'FAIL') return '#e11d48';
    if (system.operational_status === 'WORKING') return '#059669';
    return '#64748b';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function name(system) { return String(system.system_name || system.village?.village_name || 'ระบบประปาหมู่บ้าน'); }

  function popup(system) {
    const village = system.village || {};
    const status = system.operational_status === 'NOT_WORKING' ? 'ใช้งานไม่ได้' : system.operational_status === 'WORKING' ? 'ใช้งานได้' : 'ไม่มีข้อมูล';
    const quantity = system.water_quantity === 'INSUFFICIENT' ? 'ไม่เพียงพอ' : system.water_quantity === 'SUFFICIENT' ? 'เพียงพอ' : 'ไม่มีข้อมูล';
    const quality = system.drinking_water_quality === 'FAIL' ? 'ไม่ผ่าน' : system.drinking_water_quality === 'PASS' ? 'ผ่าน' : 'ไม่มีข้อมูล';
    const visibility = system.publicVisible === false ? 'ไม่แสดงใน Public Dashboard' : system.publicVisible === true ? 'แสดงใน Public Dashboard' : 'ไม่ทราบสถานะการแสดง Public';
    const point = coordinates(system);
    const suspicious = point && (point[0] < PHAYAO.minLat || point[0] > PHAYAO.maxLat || point[1] < PHAYAO.minLng || point[1] > PHAYAO.maxLng);
    return `<div class="map-popup technician-map-popup">
      <strong>${escapeHtml(name(system))}</strong>
      <div class="popup-muted">${escapeHtml(village.village_name || 'ไม่ระบุหมู่บ้าน')}</div>
      <div class="popup-muted">${escapeHtml([village.subdistrict && `ต.${village.subdistrict}`, village.district && `อ.${village.district}`].filter(Boolean).join(' · ') || '-')}</div>
      <hr><div>สถานะระบบ: ${status}</div><div>ปริมาณน้ำ: ${quantity}</div><div>คุณภาพน้ำดื่ม: ${quality}</div>
      <div>การแสดง Public: ${visibility}</div>${suspicious?'<div class="map-coordinate-warning">พิกัดอยู่นอกพื้นที่จังหวัดพะเยา โปรดตรวจสอบ</div>':''}
      <div class="map-popup-actions"><button type="button" class="map-popup-action map-popup-action-primary" data-technician-map-detail="${escapeHtml(system.system_id)}">ดูรายละเอียด</button></div>
    </div>`;
  }

  function legend() {
    const Legend = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const element = L.DomUtil.create('div', 'map-legend');
        element.innerHTML = '<strong>สถานะจุด</strong>' + [
          ['#dc2626', 'ใช้งานไม่ได้'], ['#d97706', 'น้ำไม่เพียงพอ'],
          ['#e11d48', 'น้ำดื่มไม่ผ่าน'], ['#059669', 'ใช้งานได้'], ['#64748b', 'ไม่มีข้อมูล']
        ].map(([value, label]) => `<div class="map-legend-row"><span class="map-legend-dot" style="background:${value}"></span><span>${label}</span></div>`).join('');
        return element;
      }
    });
    new Legend().addTo(map);
  }

  function init(detailHandler, locationErrorHandler) {
    onDetail = detailHandler;
    onLocationError = locationErrorHandler;
    if (map) return true;
    if (!window.L) {
      document.getElementById('technicianMapEmpty').textContent = 'ไม่สามารถโหลดแผนที่ได้ในขณะนี้';
      document.getElementById('technicianMapEmpty').classList.remove('hidden');
      return false;
    }
    map = L.map('technicianWaterMap', { zoomControl: true, minZoom: 7, preferCanvas: false }).setView(HOME, 13);
    const satellite = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
    }).addTo(map);
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    });
    L.control.layers({ 'ดาวเทียม': satellite, 'แผนที่ถนน': street }, null, { position: 'topright', collapsed: true }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    userLocationLayer = L.layerGroup().addTo(map);
    legend();
    document.getElementById('technicianWaterMap').addEventListener('click', event => {
      const button = event.target.closest('[data-technician-map-detail]');
      if (button) { map.closePopup(); onDetail?.(button.dataset.technicianMapDetail); }
    });
    document.getElementById('technicianMapFit').addEventListener('click', () => fit());
    document.getElementById('technicianMapLocate').addEventListener('click', locate);
    resizeObserver = new ResizeObserver(() => requestAnimationFrame(() => map?.invalidateSize({ pan: false })));
    resizeObserver.observe(document.getElementById('technicianWaterMap'));
    return true;
  }

  function locate() {
    if (locationPending) return;
    if (!navigator.geolocation || !window.isSecureContext) {
      onLocationError?.('ตำแหน่งฉันต้องใช้เบราว์เซอร์ที่รองรับและการเชื่อมต่อแบบ HTTPS หรือ localhost');
      return;
    }
    const button = document.getElementById('technicianMapLocate');
    locationPending = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.querySelector('span').textContent = 'กำลังค้นหา...';
    const finish = () => { locationPending = false; button.disabled = false; button.setAttribute('aria-busy', 'false'); button.querySelector('span').textContent = 'ตำแหน่งฉัน'; };
    try { navigator.geolocation.getCurrentPosition(position => {
      const lat = position.coords?.latitude, lng = position.coords?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { onLocationError?.('ไม่พบพิกัดตำแหน่งปัจจุบันที่ใช้ได้'); finish(); return; }
      userLocationLayer.clearLayers();
      L.circleMarker([lat, lng], { radius: 8.5, weight: 3, color: '#fff', fillColor: '#0284c7', fillOpacity: 1, className: 'user-location-marker' })
        .bindPopup('ตำแหน่งของคุณ').addTo(userLocationLayer).openPopup();
      map.setView([lat, lng], 16, { animate: false });
      finish();
    }, error => {
      const message = error?.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่งปัจจุบัน' : error?.code === 2 ? 'ไม่สามารถระบุตำแหน่งปัจจุบันได้' : error?.code === 3 ? 'การค้นหาตำแหน่งใช้เวลานานเกินไป' : 'ไม่สามารถใช้ตำแหน่งปัจจุบันได้';
      onLocationError?.(message);
      finish();
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }); }
    catch (_) { onLocationError?.('ไม่สามารถใช้ตำแหน่งปัจจุบันได้'); finish(); }
  }

  function fit(preferLocal = false) {
    if (!map) return;
    const all = [...markers.values()].map(marker => marker.getLatLng());
    const local = all.filter(point => point.lat >= PHAYAO.minLat && point.lat <= PHAYAO.maxLat && point.lng >= PHAYAO.minLng && point.lng <= PHAYAO.maxLng);
    const bounds = preferLocal && local.length ? local : all;
    if (!bounds.length) { map.setView(HOME, 13, { animate: false }); return; }
    if (bounds.length === 1) map.setView(bounds[0], 15, { animate: false });
    else map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14, animate: false });
  }

  function render(systems, filtered = false) {
    if (!map) return;
    markerLayer.clearLayers();
    markers = new Map();
    for (const system of systems) {
      const point = coordinates(system);
      if (!point || !system.system_id || markers.has(String(system.system_id))) continue;
      const marker = L.circleMarker(point, {
        radius: 6.5, weight: 2.2, color: '#fff', opacity: 1,
        fillColor: color(system), fillOpacity: .95, className: 'water-system-marker'
      }).bindPopup(popup(system), { maxWidth: 350, minWidth: 230, autoPanPadding: [24, 24] });
      marker.addTo(markerLayer);
      const element = marker.getElement();
      if (element) {
        element.dataset.systemId = String(system.system_id);
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `ดูตำแหน่ง ${name(system)}`);
        element.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); marker.openPopup(); }
        });
      }
      markers.set(String(system.system_id), marker);
    }
    const count = markers.size;
    document.getElementById('technicianMapScope').textContent = `${filtered ? 'กรองตามรายการปัจจุบัน · ' : 'แสดงทุกระบบ · '}${count.toLocaleString('th-TH')} จุดที่มีพิกัดใช้งานได้ รวมรายการที่ไม่แสดงใน Public`;
    document.getElementById('technicianMapEmpty').classList.toggle('hidden', count > 0);
    fit(true);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }

  function focus(systemId) {
    const marker = markers.get(String(systemId));
    if (!marker) return false;
    requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      map.setView(marker.getLatLng(), 16, { animate: false });
      marker.openPopup();
    });
    return true;
  }

  window.VWSTechnicianMap = { init, render, fit, focus, invalidate: () => map?.invalidateSize({ pan: false }), coordinates, markerCount: () => markers.size, point: id => markers.get(String(id))?.getLatLng() || null };
})();
