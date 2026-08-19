let previouslyFocused = null;
let drawerAfterClose = null;

const DEFAULT_DRAWER_META = Object.freeze({
  eyebrow: 'ข้อมูลระบบประปา',
  title: 'รายละเอียดระบบ',
  ariaLabel: 'รายละเอียดระบบประปา'
});

export function openDrawer(html = '', meta = {}, options = {}) {
  const drawer = document.getElementById('systemDrawer');
  const content = document.getElementById('drawerContent');
  previouslyFocused = document.activeElement;
  drawerAfterClose = typeof options.onClose === 'function' ? options.onClose : null;

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

  const focusTarget = previouslyFocused;
  const afterClose = drawerAfterClose;
  previouslyFocused = null;
  drawerAfterClose = null;

  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
  setDrawerMeta(DEFAULT_DRAWER_META);

  const finish = () => {
    if (afterClose) {
      afterClose();
      return;
    }
    if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  };

  runAfterDrawerTransition(drawer.querySelector('.drawer-panel'), finish);
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

function runAfterDrawerTransition(panel, callback) {
  if (!panel || typeof getComputedStyle !== 'function') {
    queueMicrotask(callback);
    return;
  }

  const durationMs = transitionMilliseconds(getComputedStyle(panel));
  if (durationMs <= 0) {
    queueMicrotask(callback);
    return;
  }

  let finished = false;
  const finishOnce = () => {
    if (finished) return;
    finished = true;
    panel.removeEventListener('transitionend', onTransitionEnd);
    window.clearTimeout(fallbackTimer);
    callback();
  };
  const onTransitionEnd = event => {
    if (event.target !== panel || event.propertyName !== 'transform') return;
    finishOnce();
  };

  panel.addEventListener('transitionend', onTransitionEnd);
  // Defensive fallback for browsers that suppress transitionend during tab/state changes.
  const fallbackTimer = window.setTimeout(finishOnce, durationMs + 80);
}

function transitionMilliseconds(style) {
  const durations = String(style.transitionDuration || '0s').split(',').map(parseCssTime);
  const delays = String(style.transitionDelay || '0s').split(',').map(parseCssTime);
  const count = Math.max(durations.length, delays.length);
  let max = 0;
  for (let index = 0; index < count; index += 1) {
    max = Math.max(max, (durations[index % durations.length] || 0) + (delays[index % delays.length] || 0));
  }
  return max;
}

function parseCssTime(value) {
  const text = String(value || '').trim();
  if (text.endsWith('ms')) return Number.parseFloat(text) || 0;
  if (text.endsWith('s')) return (Number.parseFloat(text) || 0) * 1000;
  return 0;
}

function setDrawerMeta(meta) {
  const drawer = document.getElementById('systemDrawer');
  const eyebrow = document.getElementById('drawerEyebrow');
  const title = document.getElementById('drawerTitle');

  if (eyebrow) eyebrow.textContent = meta.eyebrow || DEFAULT_DRAWER_META.eyebrow;
  if (title) title.textContent = meta.title || DEFAULT_DRAWER_META.title;
  if (drawer) drawer.setAttribute('aria-label', meta.ariaLabel || DEFAULT_DRAWER_META.ariaLabel);
}
