export function createNavigationTargets({ latitude, longitude, label = 'ตำแหน่งระบบประปา' }) {
  if (isBlankCoordinate(latitude) || isBlankCoordinate(longitude)) return null;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  const coordinate = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const safeLabel = String(label || 'ตำแหน่งระบบประปา').trim() || 'ตำแหน่งระบบประปา';

  return {
    coordinate,
    googleMapsWeb: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinate)}&travelmode=driving`,
    appleMaps: `https://maps.apple.com/?daddr=${encodeURIComponent(coordinate)}&dirflg=d`,
    genericGeo: `geo:${coordinate}?q=${encodeURIComponent(`${coordinate}(${safeLabel})`)}`
  };
}

export function openNavigation({ latitude, longitude, label }) {
  const targets = createNavigationTargets({ latitude, longitude, label });

  if (!targets) {
    showInfo('ไม่สามารถนำทางได้', 'ระบบนี้ไม่มีพิกัดที่ใช้งานได้สำหรับการนำทาง');
    return false;
  }

  if (isMobileNavigationEnvironment()) {
    showMobileNavigationChooser(targets);
    return true;
  }

  openExternal(targets.googleMapsWeb);
  return true;
}

export function isMobileNavigationEnvironment() {
  const narrowViewport = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 767px)').matches;

  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  const mobileUa = /Android|iPhone|iPod|Mobile/i.test(ua);
  const ipadLike = typeof navigator !== 'undefined' &&
    navigator.platform === 'MacIntel' &&
    Number(navigator.maxTouchPoints || 0) > 1;

  return narrowViewport || mobileUa || ipadLike;
}

function showMobileNavigationChooser(targets) {
  const platform = detectMobilePlatform();
  const otherAppLabel = platform === 'ios' ? 'Apple Maps' : 'แอปแผนที่อื่น';
  const otherAppIcon = platform === 'ios' ? 'fa-solid fa-map-location-dot' : 'fa-solid fa-location-arrow';
  const otherAppTarget = platform === 'ios' ? targets.appleMaps : targets.genericGeo;

  if (!window.Swal) {
    openExternal(targets.googleMapsWeb);
    return;
  }

  Swal.fire({
    title: 'เลือกแอปนำทาง',
    html: `
      <div class="navigation-chooser" data-navigation-chooser>
        <button type="button" class="navigation-choice" data-navigation-target="google">
          <i class="fa-solid fa-map-location-dot navigation-choice-icon navigation-choice-icon-google" aria-hidden="true"></i>
          Google Maps
        </button>
        <button type="button" class="navigation-choice" data-navigation-target="other">
          <i class="${otherAppIcon} navigation-choice-icon" aria-hidden="true"></i>
          ${escapeHtml(otherAppLabel)}
        </button>
        <button type="button" class="navigation-choice" data-navigation-target="web">
          <i class="fa-solid fa-globe navigation-choice-icon" aria-hidden="true"></i>
          Google Maps บนเว็บ
        </button>
      </div>`,
    showConfirmButton: false,
    showCloseButton: true,
    width: 420,
    didOpen: popup => {
      popup.querySelector('[data-navigation-target="google"]')?.addEventListener('click', () => {
        Swal.close();
        openExternal(targets.googleMapsWeb, false);
      });

      popup.querySelector('[data-navigation-target="other"]')?.addEventListener('click', () => {
        Swal.close();
        openExternal(otherAppTarget, false);
      });

      popup.querySelector('[data-navigation-target="web"]')?.addEventListener('click', () => {
        Swal.close();
        openExternal(targets.googleMapsWeb, true);
      });
    }
  });
}

function detectMobilePlatform() {
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);

  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function openExternal(url, newTab = true) {
  if (!url) return;

  if (newTab) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
    return;
  }

  window.location.href = url;
}

function isBlankCoordinate(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function showInfo(title, text) {
  if (window.Swal) {
    Swal.fire({
      icon: 'info',
      title,
      text,
      confirmButtonText: 'ปิด',
      confirmButtonColor: '#0369a1'
    });
  } else {
    window.alert(`${title}\n${text}`);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
