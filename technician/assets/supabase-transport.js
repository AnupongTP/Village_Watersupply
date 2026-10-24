(() => {
  'use strict';
  const endpoint = 'https://wfxudiciylpcmjbecbhk.supabase.co/functions/v1/management';
  const journalKey = 'vws_supabase_mutations_v1';
  const uncertain = new Set(['UNKNOWN_COMMIT', 'SERVER_ERROR', 'AUTH_JOB_PENDING', 'IDEMPOTENCY_CONFLICT']);
  const writes = action => action.startsWith('technicians.') && action !== 'technicians.list' ||
    ['data.updateWaterSystem', 'data.deleteWaterSystem', 'auth.changePassword'].includes(action);
  const failure = (code, message) => Object.assign(new Error(message), { code });
  // Only opaque IDs and hashes of NON-credential fields survive page refresh.
  // Never persist a password, password hash, token, account data or request.
  function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().filter(key =>
      !/password|token|credential|secret|clientInfo/i.test(key)).map(key => [key, redact(value[key])]));
  }
  async function digest(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function read() {
    try {
      const journal = JSON.parse(sessionStorage.getItem(journalKey) || '{}');
      if (!journal || Array.isArray(journal) || typeof journal !== 'object') throw Error();
      for (const entry of Object.values(journal)) {
        if (!entry || !/^[0-9a-f-]{36}$/.test(entry.mutationId) || !/^[0-9a-f]{64}$/.test(entry.fingerprint)) throw Error();
      }
      return journal;
    } catch (_) { throw failure('CLIENT_RECOVERY_UNAVAILABLE', 'ไม่สามารถตรวจสอบคำขอเดิมได้ กรุณาอย่าสร้างรายการซ้ำ'); }
  }
  function save(journal) {
    try {
      if (Object.keys(journal).length) sessionStorage.setItem(journalKey, JSON.stringify(journal));
      else sessionStorage.removeItem(journalKey);
    } catch (_) { throw failure('CLIENT_RECOVERY_UNAVAILABLE', 'ไม่สามารถเก็บหมายเลขคำขอสำหรับลองใหม่ได้ กรุณาตรวจการตั้งค่าเบราว์เซอร์'); }
  }
  async function identity(action, payload) {
    const request = payload.request || {};
    // One unresolved creation per session, even if its username is edited.
    const target = action === 'technicians.create' ? '' : request.userId || request.systemId || '';
    return digest(`${payload.token || ''}|${action}|${target}`);
  }
  window.VWSSupabaseTransport = Object.freeze({
    allowed(url) { return url === endpoint; },
    async payload(action, payload) {
      if (!writes(action)) return payload;
      const slot = await identity(action, payload);
      const fingerprint = await digest(JSON.stringify(redact(payload)));
      const journal = read();
      const entry = journal[slot];
      if (entry && entry.fingerprint !== fingerprint) {
        throw failure('AUTH_JOB_PENDING', 'คำขอเดิมยังรอตรวจสอบ กรุณาลองใหม่ด้วยข้อมูลเดิมก่อนเริ่มรายการอื่น');
      }
      journal[slot] = entry || { mutationId: crypto.randomUUID(), fingerprint };
      save(journal); // Fail BEFORE dispatch if refresh recovery is unavailable.
      return { ...payload, mutationId: journal[slot].mutationId };
    },
    async received(action, payload, response) {
      if (!writes(action) || !response || response.success !== true && (!response.error?.code || uncertain.has(response.error.code))) return;
      const journal = read();
      delete journal[await identity(action, payload)];
      save(journal);
    }
  });
})();
