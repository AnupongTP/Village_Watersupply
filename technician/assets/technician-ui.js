/* Shared feedback for the authenticated Technician application. */
(() => {
  'use strict';
  const operations = new Map();
  const idleWaiters = [];
  let closingPopup = false;
  const overlay = () => document.getElementById('busyOverlay');
  const nativeDialogs = () => [...document.querySelectorAll('dialog[open]')].filter(dialog => dialog !== overlay());

  function finishClosing(dialog) {
    if (operations.size) { paint(); return; }
    if (dialog.open) dialog.close();
    // SweetAlert normally clears these during its close lifecycle. Guard the
    // cleanup in case an interrupted close left its body scroll lock behind.
    if (!document.querySelector('.swal2-container:not(#bootView)')) {
      for (const node of [document.documentElement, document.body]) {
        node.classList.remove('swal2-shown', 'swal2-height-auto');
      }
    }
    while (idleWaiters.length) idleWaiters.shift()();
  }

  function paint() {
    const dialog = overlay();
    if (!operations.size) {
      if (closingPopup) return;
      // Keep the native top-layer dialog alive until SweetAlert has removed
      // its popup and body classes, including after an animated close.
      if (dialog.querySelector('.swal2-popup') && window.Swal) {
        closingPopup = true;
        window.Swal.close();
        return;
      }
      finishClosing(dialog);
      return;
    }
    if (closingPopup) return;
    const message = [...operations.values()].at(-1);
    // The target dialog is in the browser top layer. SweetAlert inside it stays
    // above edit/password dialogs without closing them or changing their data.
    if (!dialog.open) dialog.showModal();
    if (!window.Swal) return;
    const popup = dialog.querySelector('.swal2-popup');
    const title = popup?.querySelector('.swal2-title');
    // A previous popup can remain in its hide animation after a completed operation.
    if (title && !popup.classList.contains('swal2-hide')) { title.textContent = message; return; }
    if (popup) {
      closingPopup = true;
      window.Swal.close();
      return;
    }
    window.Swal.fire({
      target: dialog, title: message, showConfirmButton: false,
      allowOutsideClick: false, allowEscapeKey: false,
      didOpen: () => window.Swal.showLoading(),
      didClose: () => {
        closingPopup = false;
        if (operations.size) paint();
        else finishClosing(dialog);
      }
    });
  }

  function showLoading(message = 'กำลังประมวลผล...') {
    const id = Symbol('loading');
    operations.set(id, message);
    paint();
    return id;
  }
  function updateLoading(message, id) {
    if (!operations.has(id)) return;
    operations.set(id, message);
    paint();
  }
  function closeLoading(id) {
    if (!operations.delete(id)) return;
    paint();
  }
  function clearLoading() { operations.clear(); paint(); }
  function whenIdle() {
    if (!operations.size && !closingPopup && !overlay().open) return Promise.resolve();
    return new Promise(resolve => idleWaiters.push(resolve));
  }

  function notify(message, type = 'success') {
    // Inline toast remains readable above an active native form dialog.
    if (nativeDialogs().length || operations.size || !window.Swal) {
      const node = document.createElement('div');
      node.className = `toast ${type}`;
      node.textContent = message;
      document.getElementById('toastRegion').appendChild(node);
      setTimeout(() => node.remove(), 4200);
      return;
    }
    window.Swal.fire({ toast: true, position: 'bottom-end', timer: 4200,
      timerProgressBar: true, showConfirmButton: false, icon: type,
      title: message, customClass: { popup: 'technician-swal-toast' } });
  }
  window.VWSTechnicianUI = { showLoading, updateLoading, closeLoading, clearLoading, whenIdle,
    showSuccess: message => notify(message, 'success'),
    showError: message => notify(message, 'error'),
    showWarning: message => notify(message, 'warning') };
})();
