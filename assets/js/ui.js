let resizeObserver;
let resizeRaf = 0;
let backToTopRaf = 0;

export function showLoading(message = 'กำลังโหลดข้อมูล...') {
  if (!window.Swal) return null;
  return Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading()
  });
}

export function closeLoading() {
  if (window.Swal) Swal.close();
}

export function showError(message) {
  if (window.Swal) {
    Swal.fire({
      icon: 'error',
      title: 'ไม่สามารถโหลดข้อมูลได้',
      text: message,
      confirmButtonText: 'ปิด',
      confirmButtonColor: '#0369a1'
    });
  } else {
    window.alert(`ไม่สามารถโหลดข้อมูลได้\n${message}`);
  }
}

export function showRefreshError(message) {
  const text = `${message} ข้อมูลเดิมที่โหลดสำเร็จล่าสุดยังคงแสดงอยู่`;
  if (window.Swal) {
    Swal.fire({
      icon: 'warning',
      title: 'รีเฟรชข้อมูลไม่สำเร็จ',
      text,
      confirmButtonText: 'ปิด',
      confirmButtonColor: '#0369a1'
    });
  } else {
    window.alert(`รีเฟรชข้อมูลไม่สำเร็จ\n${text}`);
  }
}

export function initMobileFilters() {
  const button = document.getElementById('btnFilterToggle');
  const panel = document.getElementById('filterPanel');
  if (!button || !panel) return;

  button.addEventListener('click', () => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    const willOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !willOpen);
    button.setAttribute('aria-expanded', String(willOpen));
    requestAnimationFrame(refreshStickyMetrics);
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      button.setAttribute('aria-expanded', 'true');
    } else if (!panel.classList.contains('hidden')) {
      button.setAttribute('aria-expanded', 'true');
    } else {
      button.setAttribute('aria-expanded', 'false');
    }
    scheduleMetricRefresh();
  }, { passive: true });
}

export function initSectionNavigation() {
  const links = [...document.querySelectorAll('.section-link')];
  const sections = links
    .map(link => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);
  let preferredId = window.location.hash.slice(1);
  let sectionRaf = 0;
  const updateActiveSection = () => {
    sectionRaf = 0;
    if (!sections.length) return;
    const offset = (document.getElementById('appHeader')?.getBoundingClientRect().height || 0) + 24;
    let active = sections[0];
    let top = -Infinity;
    for (const section of sections) {
      const sectionTop = section.getBoundingClientRect().top;
      if (sectionTop > offset) continue;
      if (sectionTop > top + 1) {
        active = section;
        top = sectionTop;
      } else if (Math.abs(sectionTop - top) <= 1 && section.id === preferredId) {
        active = section;
      }
    }
    links.forEach(link => link.classList.toggle('active', link.hash === `#${active.id}`));
  };
  const scheduleActiveSection = () => {
    if (!sectionRaf) sectionRaf = requestAnimationFrame(updateActiveSection);
  };

  links.forEach(link => {
    link.addEventListener('click', event => {
      const selector = link.getAttribute('href');
      const target = selector ? document.querySelector(selector) : null;
      if (!target) return;
      event.preventDefault();
      preferredId = target.id;
      scrollToElement(target, true);
      history.replaceState?.(null, '', selector);
      scheduleActiveSection();
    });
  });

  window.addEventListener('hashchange', () => {
    preferredId = window.location.hash.slice(1);
    syncHashNavigation({ smooth: false });
    scheduleActiveSection();
  });

  window.addEventListener('scroll', scheduleActiveSection, { passive: true });
  window.addEventListener('resize', scheduleActiveSection, { passive: true });
  scheduleActiveSection();
}

export function initStickyMetrics() {
  const header = document.getElementById('appHeader');

  resizeObserver?.disconnect();
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(scheduleMetricRefresh);
    if (header) resizeObserver.observe(header);
  }

  window.addEventListener('resize', scheduleMetricRefresh, { passive: true });
  refreshStickyMetrics();
}

export function refreshStickyMetrics() {
  const root = document.documentElement;
  const header = document.getElementById('appHeader');
  const headerHeight = Math.ceil(header?.getBoundingClientRect().height || 0);
  root.style.setProperty('--app-header-height', `${headerHeight}px`);
}

export function syncHashNavigation({ smooth = false } = {}) {
  const hash = window.location.hash;
  if (!hash || hash === '#') return false;

  let target;
  try {
    target = document.querySelector(hash);
  } catch (_) {
    return false;
  }
  if (!target) return false;

  refreshStickyMetrics();
  requestAnimationFrame(() => scrollToElement(target, smooth));
  return true;
}

export function scrollToSectionById(id, smooth = true) {
  const target = document.getElementById(id);
  if (!target) return false;
  refreshStickyMetrics();
  scrollToElement(target, smooth);
  return true;
}

export function initBackToTop() {
  const button = document.getElementById('btnBackToTop');
  if (!button) return;

  const update = () => {
    backToTopRaf = 0;
    const threshold = Math.max(480, window.innerHeight * 0.85);
    const shouldShow = window.scrollY > threshold;
    button.classList.toggle('hidden', !shouldShow);
    button.classList.toggle('flex', shouldShow);
    button.setAttribute('aria-hidden', String(!shouldShow));

    if (shouldShow) {
      window.requestAnimationFrame(() => avoidLeafletControlOverlap(button));
    } else {
      button.style.transform = '';
    }
  };

  const schedule = () => {
    if (backToTopRaf) return;
    backToTopRaf = window.requestAnimationFrame(update);
  };

  button.addEventListener('click', () => {
    const header = document.getElementById('appHeader');
    header?.focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });
  });

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  update();
}

function scrollToElement(target, smooth) {
  target.scrollIntoView({
    behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
    block: 'start',
    inline: 'nearest'
  });
}

function avoidLeafletControlOverlap(button) {
  button.style.transform = '';
  const buttonRect = button.getBoundingClientRect();
  const controls = [...document.querySelectorAll('#waterMap .leaflet-bottom.leaflet-right')]
    .filter(element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);

  let shift = 0;
  for (const control of controls) {
    const rect = control.getBoundingClientRect();
    if (!rectanglesOverlap(buttonRect, rect)) continue;
    shift = Math.max(shift, buttonRect.bottom - rect.top + 12);
  }
  if (shift > 0) button.style.transform = `translateY(-${Math.ceil(shift)}px)`;
}

function rectanglesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function scheduleMetricRefresh() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    refreshStickyMetrics();
  });
}
