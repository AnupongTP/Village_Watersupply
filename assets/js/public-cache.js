// IndexedDB persistence for the Public Dashboard dataset (Public only).
// - One record under one key; a single readwrite transaction replaces the whole
//   dataset atomically (all-or-nothing) after a successful validated fetch.
// - Every function resolves; none throw. Failures are reported as a status so
//   the Dashboard keeps working with or without storage.
// - Authenticated Technician data never uses this module.
import { CONFIG } from './config.js';
import { buildCacheRecord, validateCacheRecord, sourceTag } from './public-cache-model.js';

const DB_NAME = 'vws_public_dashboard_cache';
const DB_VERSION = 1;
const STORE = 'datasets';
const KEY = 'public-dataset';
const OPEN_TIMEOUT_MS = 3000;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const factory = globalThis.indexedDB;
    if (!factory) { reject(new Error('IDB_UNSUPPORTED')); return; }
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('IDB_TIMEOUT')); } }, OPEN_TIMEOUT_MS);
    let request;
    try { request = factory.open(DB_NAME, DB_VERSION); } catch (error) { clearTimeout(timer); reject(error); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) { request.result.close(); return; }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timer); if (!settled) { settled = true; reject(request.error || new Error('IDB_OPEN_FAILED')); } };
    request.onblocked = () => { clearTimeout(timer); if (!settled) { settled = true; reject(new Error('IDB_BLOCKED')); } };
  });
}

function runTransaction(mode, work) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    let result;
    let transaction;
    try { transaction = db.transaction(STORE, mode); } catch (error) { db.close(); reject(error); return; }
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('IDB_TRANSACTION_FAILED')); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error('IDB_ABORTED')); };
    try { work(transaction.objectStore(STORE), value => { result = value; }); } catch (error) { try { transaction.abort(); } catch (_) {} reject(error); }
  }));
}

export function currentSourceKey() {
  return sourceTag(CONFIG);
}

// -> { status: 'HIT', record } | { status: 'MISS' } | { status: 'INVALID', reason } | { status: 'UNAVAILABLE', reason }
export async function readPublicCache() {
  let raw;
  try {
    raw = await runTransaction('readonly', (store, setResult) => {
      const request = store.get(KEY);
      request.onsuccess = () => setResult(request.result);
    });
  } catch (error) {
    return { status: 'UNAVAILABLE', reason: String(error?.message || error) };
  }
  if (raw === undefined) return { status: 'MISS' };
  const checked = validateCacheRecord(raw, { sourceKey: currentSourceKey() });
  if (!checked.ok) {
    await clearPublicCache();
    return { status: 'INVALID', reason: checked.reason };
  }
  return { status: 'HIT', record: checked.record };
}

// Replaces the entire cached dataset in one transaction. Never throws.
// -> { ok: true, record } | { ok: false, reason }
export async function writePublicCache({ scope, sourceGeneratedAt }) {
  let record;
  try {
    record = buildCacheRecord({ scope, sourceGeneratedAt, sourceKey: currentSourceKey() });
    const verified = validateCacheRecord(record, { sourceKey: record.sourceKey });
    if (!verified.ok) return { ok: false, reason: verified.reason };
    // structured clone happens inside put(); a failure aborts and leaves the previous record intact.
    await runTransaction('readwrite', store => { store.put(record, KEY); });
    return { ok: true, record };
  } catch (error) {
    return { ok: false, reason: String(error?.name || error?.message || error) };
  }
}

export async function clearPublicCache() {
  try {
    await runTransaction('readwrite', store => { store.delete(KEY); });
    return true;
  } catch (_) {
    return false;
  }
}
