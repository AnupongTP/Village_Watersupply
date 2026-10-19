/* Shared feedback for the authenticated Technician application. */
(() => {
  'use strict';
  const operations = new Map();
  const overlay = () => document.getElementById('busyOverlay');
  const nativeDialogs = () => [...document.querySelectorAll('dialog[open]')].filter(dialog => dialog !== overlay());

  function paint() {
    const dialog = overlay();
    if (!operations.size) {
      if (window.Swal?.isVisible()) window.Swal.close();
      dialog.classList.remove('swal-active');
      if (dialog.open) dialog.close();
      return;
    }
    const message = [...operations.values()].at(-1);
    document.getElementById('busyText').textContent = message;
    // The target dialog is in the browser top layer. SweetAlert inside it stays
    // above edit/password dialogs without closing them or changing their data.
    if (!dialog.open) dialog.showModal();
    if (!window.Swal) return;
    dialog.classList.add('swal-active');
    if (window.Swal.isVisible()) {
      const title = window.Swal.getTitle();
      if (title && dialog.contains(title)) title.textContent = message;
      else window.Swal.close();
      if (title && dialog.contains(title)) return;
    }
    window.Swal.fire({
      target: dialog, title: message, showConfirmButton: false,
      backdrop: false,
      allowOutsideClick: false, allowEscapeKey: false,
      showClass: { popup: '' }, hideClass: { popup: '' },
      customClass: { popup: 'technician-swal-loading' },
      didOpen: () => window.Swal.showLoading()
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
  window.VWSTechnicianUI = { showLoading, updateLoading, closeLoading, clearLoading,
    showSuccess: message => notify(message, 'success'),
    showError: message => notify(message, 'error'),
    showWarning: message => notify(message, 'warning') };
})();
