let resizeObserver;
let resizeRaf = 0;

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

  links.forEach(link => {
    link.addEventListener('click', event => {
      const selector = link.getAttribute('href');
      const target = selector ? document.querySelector(selector) : null;
      if (!target) return;
      event.preventDefault();
      scrollToElement(target, true);
      history.replaceState?.(null, '', selector);
    });
  });

  window.addEventListener('hashchange', () => {
    syncHashNavigation({ smooth: false });
  });

  if (sections.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const targetId = `#${visible.target.id}`;
      links.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === targetId);
      });
    }, {
      rootMargin: '-24% 0px -66% 0px',
      threshold: [0, 0.1, 0.3, 0.6]
    });
    sections.forEach(section => observer.observe(section));
  }
}

export function initStickyMetrics() {
  const header = document.getElementById('appHeader');
  const filter = document.getElementById('filters');

  resizeObserver?.disconnect();
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(scheduleMetricRefresh);
    if (header) resizeObserver.observe(header);
    if (filter) resizeObserver.observe(filter);
  }

  window.addEventListener('resize', scheduleMetricRefresh, { passive: true });
  refreshStickyMetrics();
}

export function refreshStickyMetrics() {
  const root = document.documentElement;
  const header = document.getElementById('appHeader');
  const filter = document.getElementById('filters');

  const headerHeight = Math.ceil(header?.getBoundingClientRect().height || 0);
  const filterIsSticky = filter && getComputedStyle(filter).position === 'sticky';
  const filterHeight = filterIsSticky ? Math.ceil(filter.getBoundingClientRect().height + 8) : 0;

  root.style.setProperty('--app-header-height', `${headerHeight}px`);
  root.style.setProperty('--filter-sticky-height', `${filterHeight}px`);
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

function scrollToElement(target, smooth) {
  target.scrollIntoView({
    behavior: smooth ? 'smooth' : 'auto',
    block: 'start',
    inline: 'nearest'
  });
}

function scheduleMetricRefresh() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    refreshStickyMetrics();
  });
}
