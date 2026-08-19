let previouslyFocused = null;

const DEFAULT_DRAWER_META = Object.freeze({
  eyebrow: 'ข้อมูลระบบประปา',
  title: 'รายละเอียดระบบ',
  ariaLabel: 'รายละเอียดระบบประปา'
});

export function openDrawer(html = '', meta = {}) {
  const drawer = document.getElementById('systemDrawer');
  const content = document.getElementById('drawerContent');
  previouslyFocused = document.activeElement;

  setDrawerMeta({ ...DEFAULT_DRAWER_META, ...meta });

  if (content) {
    content.innerHTML = html;
    content.scrollTop = 0;
  }

  drawer?.classList.add('open');
  drawer?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
  requestAnimationFrame(() => document.getElementById('btnCloseDrawer')?.focus());
}

export function closeDrawer() {
  const drawer = document.getElementById('systemDrawer');
  if (!drawer?.classList.contains('open')) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
  setDrawerMeta(DEFAULT_DRAWER_META);
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
  previouslyFocused = null;
}

export function initDrawer() {
  const drawer = document.getElementById('systemDrawer');
  document.getElementById('btnCloseDrawer')?.addEventListener('click', closeDrawer);
  drawer?.addEventListener('click', event => { if (event.target === drawer) closeDrawer(); });

  document.addEventListener('keydown', event => {
    if (!drawer?.classList.contains('open')) return;
    if (event.key === 'Escape') { closeDrawer(); return; }
    if (event.key !== 'Tab') return;

    const focusable = [...drawer.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

function setDrawerMeta(meta) {
  const drawer = document.getElementById('systemDrawer');
  const eyebrow = document.getElementById('drawerEyebrow');
  const title = document.getElementById('drawerTitle');

  if (eyebrow) eyebrow.textContent = meta.eyebrow || DEFAULT_DRAWER_META.eyebrow;
  if (title) title.textContent = meta.title || DEFAULT_DRAWER_META.title;
  if (drawer) drawer.setAttribute('aria-label', meta.ariaLabel || DEFAULT_DRAWER_META.ariaLabel);
}
