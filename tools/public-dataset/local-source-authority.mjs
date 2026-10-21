import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rmdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectSourceRead } from './source-read.mjs';
import { selectPhysicalPublicationEligible } from './eligibility.mjs';
import { createPublicSnapshot } from './snapshot.mjs';
import { publishLocalSnapshot } from './local-publisher.mjs';

const KEYS = ['villages', 'waterSystems', 'waterSources'];
const IDS = { villages: 'village_id', waterSystems: 'system_id', waterSources: 'source_id' };
const TABLES = { villages: 'villages', waterSystems: 'water_systems', waterSources: 'village_water_sources' };
const REASONS = new Set(['OUTCOME_AMBIGUOUS', 'PARTIAL_NORMALIZATION',
  'PREPARED_RECOVERY', 'PREPARED_AFTER_PHYSICAL_DELETE', 'UNTRACKED_SOURCE_DRIFT',
  'CONSISTENCY_UNVERIFIABLE', 'UNSUPPORTED_AUTHORITY_STATE']);
const HEADERS = {
  villages: ['village_id', 'has_village_waterworks'],
  waterSystems: ['system_id', 'village_id', 'latitude', 'longitude'],
  waterSources: ['source_id', 'village_id']
};
const copy = value => structuredClone(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = code => Object.assign(new Error(code), { code });
const counts = rows => Object.fromEntries(KEYS.map(key => [key, rows[key].length]));
const equal = (a, b) => a !== undefined && b !== undefined && digest(a) === digest(b);
const rawRows = rows => Object.fromEntries(KEYS.map(key => [key, copy(rows[key])]));
const ids = (rows, key) => rows[key].map(row => String(row[IDS[key]])).sort();
const commitDigest = record => digest({ rows: record.rows, eligibility: record.eligibility,
  tables: record.tables, headers: record.headers });
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function mutationFingerprint({ id, kind, expectedRows, rawSubmissionId, auditEvidence }) {
  const rows = rawRows(expectedRows);
  const ordered = Object.fromEntries(KEYS.map(key => [key,
    rows[key].sort((a, b) => {
      const left = String(a[IDS[key]]), right = String(b[IDS[key]]);
      return left < right ? -1 : left > right ? 1 : 0;
    })]));
  return createHash('sha256').update(canonical({ id, kind, expectedRows: ordered,
    rawSubmissionId: rawSubmissionId ?? null, auditEvidence: auditEvidence ?? null })).digest('hex');
}

export function assertStableSourceGeneration(before, after) {
  if (!before || !after || before.state !== 'READY' || after.state !== 'READY' ||
      before.generation !== after.generation || before.revision !== after.revision ||
      !equal(before.rows, after.rows) || before.committedDigest !== after.committedDigest) {
    throw fail('REVISION_CHANGED_DURING_READ');
  }
}

async function durableNew(path, value) {
  const handle = await open(path, 'wx');
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
}

// A LOCAL journal, not a Google Sheets transaction. Complete markers make a
// transition visible only after its full record is written and synced.
export function createLocalSourceAuthority(root) {
  if (typeof root !== 'string' || !resolve(root).startsWith(resolve(tmpdir()) + sep)) {
    throw fail('OS_TEMP_ROOT_REQUIRED');
  }
  const lockPath = join(root, 'authority.lock');
  const readbackProofs = new WeakMap();
  async function newestGeneration() {
    let names;
    try { names = await readdir(root); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    const generations = new Map();
    for (const name of names) {
      const match = /^authority-(\d+)\.(json|status\.json|complete)$/.exec(name);
      if (!match) continue;
      const generation = Number(match[1]);
      if (!Number.isSafeInteger(generation) || generation < 1) throw fail('AUTHORITY_CORRUPT');
      if (!generations.has(generation)) generations.set(generation, new Set());
      generations.get(generation).add(match[2]);
    }
    if (!generations.size) return null;
    let highest = 0;
    for (const generation of generations.keys()) if (generation > highest) highest = generation;
    for (let generation = 1; generation <= highest; generation++) {
      const parts = generations.get(generation);
      if (!parts || parts.size !== 3 ||
          !['json', 'status.json', 'complete'].every(part => parts.has(part))) {
        throw fail('JOURNAL_INTEGRITY_UNRESOLVED');
      }
      try {
        const [journal, status, marker] = await Promise.all([
          readFile(join(root, `authority-${generation}.json`)),
          readFile(join(root, `authority-${generation}.status.json`)),
          readFile(join(root, `authority-${generation}.complete`), 'utf8')
        ]);
        if (marker !== `${digest(journal.toString('utf8'))}:${digest(status.toString('utf8'))}`) {
          throw fail('JOURNAL_INTEGRITY_UNRESOLVED');
        }
      } catch (_) { throw fail('JOURNAL_INTEGRITY_UNRESOLVED'); }
    }
    return highest;
  }
  async function latest() {
    const generation = await newestGeneration();
    if (generation === null) return null;
    try {
      const bytes = await readFile(join(root, `authority-${generation}.json`));
      const marker = await readFile(join(root, `authority-${generation}.complete`), 'utf8');
      if (marker.split(':')[0] !== digest(bytes.toString('utf8'))) throw fail('AUTHORITY_CORRUPT');
      const record = JSON.parse(bytes.toString('utf8'));
      if (record.generation !== generation || !Number.isSafeInteger(record.revision) ||
          record.revision < 0 || !['READY', 'WRITING', 'NEEDS_RECONCILE', 'BLOCKED'].includes(record.state) ||
          KEYS.some(key => !Array.isArray(record.rows?.[key])) || !Array.isArray(record.committedIds) ||
          (record.rawLedgerComplete !== undefined && typeof record.rawLedgerComplete !== 'boolean')) {
        throw fail('AUTHORITY_CORRUPT');
      }
      if (record.committedMutations && Object.entries(record.committedMutations).some(([id, entry]) =>
        !record.committedIds.includes(id) || !entry?.fingerprint ||
        !Number.isSafeInteger(entry.revision) || entry.revision > record.revision)) {
        throw fail('AUTHORITY_CORRUPT');
      }
      if (record.rawConsumption && Object.entries(record.rawConsumption).some(([rawId, entry]) => {
        const committed = record.committedMutations?.[entry?.mutationId];
        return !committed || committed.kind !== 'FEATURE3' ||
          committed.rawSubmissionId !== rawId || committed.createdSystemId !== entry.systemId ||
          committed.fingerprint !== entry.fingerprint;
      })) throw fail('AUTHORITY_CORRUPT');
      if (record.rawLedgerComplete === true && record.committedIds.some(id => {
        const committed = record.committedMutations?.[id];
        return !committed?.fingerprint || (committed.kind === 'FEATURE3' &&
          (record.rawConsumption?.[committed.rawSubmissionId]?.mutationId !== id ||
            record.rawConsumption[committed.rawSubmissionId].systemId !== committed.createdSystemId));
      })) throw fail('AUTHORITY_CORRUPT');
      const status = await readStatus(generation);
      if (status.state !== record.state ||
          status.revision !== (record.state === 'READY' ? record.revision : null) ||
          status.unresolved !== (record.intent?.id ?? null) || status.reason !== record.reason) {
        throw fail('AUTHORITY_CORRUPT');
      }
      return record;
    } catch (_) { throw fail('AUTHORITY_CORRUPT'); }
  }
  async function append(record) {
    const next = { ...record, generation: record.generation + 1 };
    const bytes = JSON.stringify(next);
    const identityComplete = next.rawLedgerComplete === true &&
      next.committedIds.every(id => !!next.committedMutations?.[id]?.fingerprint);
    const status = { generation: next.generation, state: next.state,
      revision: next.state === 'READY' ? next.revision : null,
      unresolved: next.intent?.id ?? null, reason: next.reason, identityComplete };
    const statusBytes = JSON.stringify(status);
    const base = `authority-${next.generation}`;
    await durableNew(join(root, `${base}.json`), bytes);
    await durableNew(join(root, `${base}.status.json`), statusBytes);
    await durableNew(join(root, `${base}.complete`), `${digest(bytes)}:${digest(statusBytes)}`);
    return next;
  }
  async function readStatus(selectedGeneration = null) {
    const generation = selectedGeneration ?? await newestGeneration();
    if (generation === null) return { state: 'BLOCKED', revision: null,
      unresolved: null, reason: 'UNINITIALIZED' };
    try {
      const bytes = await readFile(join(root, `authority-${generation}.status.json`), 'utf8');
      const marker = await readFile(join(root, `authority-${generation}.complete`), 'utf8');
      if (marker.split(':')[1] !== digest(bytes)) throw fail('AUTHORITY_CORRUPT');
      const status = JSON.parse(bytes);
      if (status.generation !== generation ||
          !['READY', 'WRITING', 'NEEDS_RECONCILE', 'BLOCKED'].includes(status.state)) {
        throw fail('AUTHORITY_CORRUPT');
      }
      const { generation: omitted, ...publicStatus } = status;
      return publicStatus;
    } catch (_) { throw fail('AUTHORITY_CORRUPT'); }
  }
  async function locked(action) {
    await mkdir(root, { recursive: true });
    try { await mkdir(lockPath); }
    catch (error) { if (error.code === 'EEXIST') throw fail('AUTHORITY_BUSY'); throw error; }
    try { return await action(await latest()); }
    finally { await rmdir(lockPath); }
  }
  function ready(record) {
    if (!record || record.state !== 'READY' || record.intent ||
        record.committedDigest !== commitDigest(record) ||
        record.rawLedgerComplete !== true ||
        record.committedIds.some(id => !record.committedMutations?.[id]?.fingerprint)) {
      throw fail('SOURCE_NOT_READY');
    }
  }
  function newIntent(record, { id, kind, expectedRows, rawSubmissionId, auditEvidence }) {
    ready(record);
    if (typeof id !== 'string' || !id.trim() || record.committedIds.includes(id)) throw fail('INVALID_MUTATION_ID');
    if (!['FEATURE3', 'MANAGEMENT_UPDATE', 'HARD_DELETE'].includes(kind)) throw fail('INVALID_MUTATION_KIND');
    if (kind === 'FEATURE3' && (!rawSubmissionId ||
        !Object.hasOwn(record.rawSubmissions, rawSubmissionId))) {
      throw fail('RAW_SUBMISSION_REQUIRED');
    }
    const expected = rawRows(expectedRows);
    const before = rawRows(record.rows);
    if (equal(expected, before)) throw fail('NO_NORMALIZED_CHANGE');
    if (kind === 'FEATURE3') {
      if (!equal(expected.waterSources, before.waterSources)) throw fail('FEATURE3_SOURCE_WRITE_FORBIDDEN');
      const raw = record.rawSubmissions[rawSubmissionId];
      const priorVillage = before.villages.some(row => String(row.village_id) === raw.village_id_ref);
      const oldVillagesUnchanged = before.villages.every(row => equal(row,
        expected.villages.find(next => String(next.village_id) === String(row.village_id))));
      const newVillages = expected.villages.filter(row =>
        !before.villages.some(old => String(old.village_id) === String(row.village_id)));
      if (!oldVillagesUnchanged || (priorVillage && !equal(expected.villages, before.villages)) ||
          (!priorVillage && (!raw.newVillageEvidence || newVillages.length !== 1 ||
            expected.villages.length !== before.villages.length + 1 ||
            String(newVillages[0].village_id) !== raw.village_id_ref))) {
        throw fail('FEATURE3_ADD_ONLY_CONTRACT');
      }
      const original = new Map(before.waterSystems.map(row => [String(row.system_id), row]));
      const additions = expected.waterSystems.filter(row => !original.has(String(row.system_id)));
      if (additions.length !== 1 || expected.waterSystems.length !== before.waterSystems.length + 1 ||
          before.waterSystems.some(row => !equal(row, expected.waterSystems.find(next =>
            String(next.system_id) === String(row.system_id)))) ||
          String(additions[0].village_id) !== raw.village_id_ref) {
        throw fail('FEATURE3_ADD_ONLY_CONTRACT');
      }
    }
    if (kind === 'MANAGEMENT_UPDATE' && KEYS.some(key => !equal(ids(before, key), ids(expected, key)))) {
      throw fail('UPDATE_CANNOT_CHANGE_ROW_SET');
    }
    if (kind === 'HARD_DELETE') {
      const original = new Map(before.waterSystems.map(row => [String(row.system_id), row]));
      const removed = before.waterSystems.filter(row =>
        !expected.waterSystems.some(next => String(next.system_id) === String(row.system_id)));
      if (removed.length !== 1 || expected.waterSystems.length !== before.waterSystems.length - 1 ||
          expected.waterSystems.some(row => !equal(row, original.get(String(row.system_id)))) ||
          !equal(before.villages, expected.villages) || !equal(before.waterSources, expected.waterSources)) {
        throw fail('HARD_DELETE_CONTRACT');
      }
      if (!auditEvidence || auditEvidence.action !== 'HARD_DELETE' ||
          auditEvidence.status !== 'PREPARED' ||
          auditEvidence.systemId !== String(removed[0].system_id) ||
          typeof auditEvidence.entryId !== 'string' || !auditEvidence.entryId.trim()) {
        throw fail('DELETE_AUDIT_REQUIRED');
      }
    }
    const createdSystemId = kind === 'FEATURE3'
      ? String(expected.waterSystems.find(row => !before.waterSystems.some(old =>
        String(old.system_id) === String(row.system_id))).system_id) : null;
    return { id, kind, rawSubmissionId: rawSubmissionId ?? null, createdSystemId,
      auditEvidence: auditEvidence ? copy(auditEvidence) : null,
      fingerprint: mutationFingerprint({ id, kind, expectedRows: expected, rawSubmissionId, auditEvidence }),
      before, expected, applied: [] };
  }
  function observe(record) {
    // This evidence is rebuilt from a separate persisted read, not from the
    // caller's payload. A real adapter must establish equivalent independence.
    return {
      complete: true, consistentRead: record.state === 'READY' && !record.intent &&
        record.committedDigest === commitDigest(record), authority: 'LOCAL_JOURNAL_OBSERVER',
      tables: record.tables, headers: record.headers,
      tableIds: Object.fromEntries(KEYS.map(key => [key, record.rows[key].map(row => row[IDS[key]])])),
      tableCounts: counts(record.rows),
      revision: { value: record.revision, monotonic: true, authority: 'LOCAL_JOURNAL_SEQUENCE' },
      rowDigest: digest(record.rows), generation: record.generation
    };
  }
  function decisionsFor(record) {
    const ids = record.rows.waterSystems.map(row => String(row.system_id));
    if (ids.some(id => !Object.hasOwn(record.eligibility, id) ||
        !['ELIGIBLE', 'INELIGIBLE'].includes(record.eligibility[id])) ||
        Object.keys(record.eligibility).some(id => !ids.includes(id))) throw fail('ELIGIBILITY_UNVERIFIED');
    return { complete: true, authority: 'LOCAL_COMMIT_ELIGIBILITY',
      decisions: ids.map(systemId => ({ systemId, status: record.eligibility[systemId] })) };
  }
  function inspect(record, observationTime, witness = record) {
    ready(record);
    if (witness.state !== 'READY' || witness.generation !== record.generation ||
        witness.revision !== record.revision || !equal(witness.rows, record.rows) ||
        witness.committedDigest !== record.committedDigest) throw fail('INDEPENDENT_READ_MISMATCH');
    const payload = { success: true, generatedAt: observationTime, ...rawRows(record.rows) };
    const manifest = { complete: true, counts: counts(record.rows) };
    const evidence = observe(witness);
    if (evidence.tableCounts.villages !== manifest.counts.villages ||
        evidence.tableCounts.waterSystems !== manifest.counts.waterSystems ||
        evidence.tableCounts.waterSources !== manifest.counts.waterSources) throw fail('INCOMPLETE_SOURCE_READ');
    const result = inspectSourceRead(payload, manifest, () => evidence);
    if (!result.verifiedRead || result.verifiedRead.sourceRevision !== record.revision) {
      throw fail('INCOMPLETE_SOURCE_READ');
    }
    const eligible = selectPhysicalPublicationEligible(result.verifiedRead, () => decisionsFor(record));
    return { report: result.report, verifiedRead: result.verifiedRead, eligible,
      candidate: createPublicSnapshot(eligible, { observationTime }) };
  }
  return Object.freeze({
    async initialize(rows, eligibility = {}, { tables = TABLES, headers = HEADERS } = {}) {
      return locked(async current => {
        if (current) throw fail('ALREADY_INITIALIZED');
        const initial = rawRows(rows);
        const record = { generation: 0, revision: 0, state: 'READY', rows: initial,
          committedDigest: null, eligibility: copy(eligibility),
          committedIds: [], committedMutations: {}, rawConsumption: {}, rawLedgerComplete: true,
          rawSubmissions: {}, audit: [], intent: null, reason: null,
          tables: copy(tables), headers: copy(headers) };
        record.committedDigest = commitDigest(record);
        // Validate before making the initial READY marker visible.
        inspect({ ...record, generation: 1 }, '2026-01-01T00:00:00.000Z');
        const written = await append(record);
        return { state: written.state, revision: written.revision };
      });
    },
    async status() {
      try {
        const { identityComplete, ...status } = await readStatus();
        if (status.state === 'READY' && identityComplete !== true) {
          return { state: 'BLOCKED', revision: null, unresolved: null,
            reason: 'LEGACY_IDENTITY_UNVERIFIABLE' };
        }
        return status;
      }
      catch (_) { return { state: 'BLOCKED', revision: null, unresolved: null,
        reason: 'JOURNAL_INTEGRITY_UNRESOLVED' }; }
    },
    async appendRaw(id, submission) {
      return locked(async record => {
        ready(record);
        if (typeof id !== 'string' || !id.trim() || !submission || typeof submission !== 'object' ||
            typeof submission.village_id_ref !== 'string' || !submission.village_id_ref.trim() ||
            (!record.rows.villages.some(row => String(row.village_id) === submission.village_id_ref) &&
              submission.newVillageEvidence !== true)) {
          throw fail('INVALID_RAW_SUBMISSION');
        }
        if (Object.hasOwn(record.rawSubmissions, id)) {
          if (!equal(record.rawSubmissions[id], submission)) throw fail('RAW_IDEMPOTENCY_CONFLICT');
          return { code: 'ALREADY_RECEIVED' };
        }
        await append({ ...record, rawSubmissions: { ...record.rawSubmissions, [id]: copy(submission) } });
        return { code: 'RECEIVED' };
      });
    },
    async begin(intent) {
      return locked(async record => {
        if (record?.committedIds.includes(intent.id)) {
          const committed = record.committedMutations?.[intent.id];
          if (!committed?.fingerprint) throw fail('MUTATION_IDENTITY_UNVERIFIABLE');
          if (committed.fingerprint !== mutationFingerprint(intent)) throw fail('MUTATION_IDEMPOTENCY_CONFLICT');
          return { code: 'ALREADY_COMMITTED', revision: committed.revision };
        }
        if (record?.intent?.id === intent.id) {
          const prior = record.intent.fingerprint ?? mutationFingerprint({
            ...record.intent, expectedRows: record.intent.expected });
          if (prior !== mutationFingerprint(intent)) {
            throw fail('MUTATION_IDEMPOTENCY_CONFLICT');
          }
          return { code: 'ALREADY_STARTED', state: record.state };
        }
        if (intent.kind === 'FEATURE3') {
          if (record.rawLedgerComplete !== true && record.committedIds.length) {
            throw fail('RAW_CONSUMPTION_UNVERIFIABLE');
          }
          if (Object.hasOwn(record.rawConsumption ?? {}, intent.rawSubmissionId)) {
            throw fail('RAW_SUBMISSION_ALREADY_CONSUMED');
          }
          if (record.intent?.rawSubmissionId === intent.rawSubmissionId) throw fail('RAW_SUBMISSION_RESERVED');
        }
        const entry = newIntent(record, intent);
        await append({ ...record, state: 'WRITING', intent: entry, reason: null });
        return { code: 'STARTED', state: 'WRITING' };
      });
    },
    async applyTable(id, table, rows) {
      return locked(async record => {
        if (record.state !== 'WRITING' || record.intent?.id !== id || !KEYS.includes(table) ||
            !Array.isArray(rows) || (record.intent.kind === 'FEATURE3' && table === 'waterSources')) {
          throw fail('WRITE_FENCE_REQUIRED');
        }
        const next = { ...record, rows: { ...record.rows, [table]: copy(rows) },
          intent: { ...record.intent, applied: [...new Set([...record.intent.applied, table])] } };
        await append(next);
        return { code: 'APPLIED', state: 'WRITING' };
      });
    },
    async interrupt(id, reason = 'OUTCOME_AMBIGUOUS') {
      return locked(async record => {
        if (record.intent?.id !== id || !['WRITING', 'NEEDS_RECONCILE'].includes(record.state)) {
          throw fail('NO_UNRESOLVED_MUTATION');
        }
        if (record.state === 'NEEDS_RECONCILE') return { code: 'ALREADY_UNRESOLVED' };
        await append({ ...record, state: 'NEEDS_RECONCILE',
          reason: REASONS.has(reason) ? reason : 'OUTCOME_AMBIGUOUS' });
        return { code: 'NEEDS_RECONCILE' };
      });
    },
    async resolve(id, { readback, eligibility } = {}) {
      return locked(async record => {
        if (record.committedIds.includes(id)) {
          const committed = record.committedMutations?.[id];
          if (!committed?.fingerprint) throw fail('MUTATION_IDENTITY_UNVERIFIABLE');
          return { code: 'ALREADY_COMMITTED', revision: committed.revision };
        }
        if (!record.intent || record.intent.id !== id ||
            !['WRITING', 'NEEDS_RECONCILE'].includes(record.state)) throw fail('NO_UNRESOLVED_MUTATION');
        // A readback must be supplied from a separately observed physical read.
        // Raw status text and a self-reported mutation response are insufficient.
        if (!readback || readbackProofs.get(readback) !== record.generation ||
            !equal(readback.rows, record.rows) ||
            readback.generation !== record.generation || !equal(record.rows, record.intent.expected)) {
          throw fail('READBACK_OR_EXPECTED_ROWS_MISMATCH');
        }
        if (record.intent.kind === 'HARD_DELETE') {
          const before = record.intent.before.waterSystems.map(row => row.system_id);
          const after = new Set(record.rows.waterSystems.map(row => row.system_id));
          if (!before.some(id => !after.has(id)) || !record.intent.auditEvidence) throw fail('DELETE_EVIDENCE_MISSING');
        }
        if (!eligibility || typeof eligibility !== 'object' || Array.isArray(eligibility)) {
          throw fail('ELIGIBILITY_UNVERIFIED');
        }
        if (record.intent.kind === 'FEATURE3' &&
            ((record.rawLedgerComplete !== true && record.committedIds.length) ||
              Object.hasOwn(record.rawConsumption ?? {}, record.intent.rawSubmissionId))) {
          throw fail(record.rawLedgerComplete !== true ?
            'RAW_CONSUMPTION_UNVERIFIABLE' : 'RAW_SUBMISSION_ALREADY_CONSUMED');
        }
        const fingerprint = record.intent.fingerprint ?? mutationFingerprint({
          ...record.intent, expectedRows: record.intent.expected });
        const committed = { fingerprint, revision: record.revision + 1,
          kind: record.intent.kind, rawSubmissionId: record.intent.rawSubmissionId,
          createdSystemId: record.intent.createdSystemId ?? null };
        const next = { ...record, revision: record.revision + 1, state: 'READY', intent: null,
          committedDigest: null, eligibility: copy(eligibility),
          committedIds: [...record.committedIds, id], reason: null,
          committedMutations: { ...record.committedMutations, [id]: committed },
          rawLedgerComplete: record.rawLedgerComplete === true || record.committedIds.length === 0,
          rawConsumption: record.intent.kind === 'FEATURE3'
            ? { ...record.rawConsumption, [record.intent.rawSubmissionId]: {
              mutationId: id, systemId: record.intent.createdSystemId, fingerprint } }
            : record.rawConsumption ?? {},
          audit: record.intent.kind === 'HARD_DELETE'
            ? [...record.audit, { ...record.intent.auditEvidence, status: 'COMMITTED', revision: record.revision + 1 }]
            : record.audit };
        next.committedDigest = commitDigest(next);
        // Check the next generation before its commit marker is written.
        decisionsFor(next);
        inspect({ ...next, generation: record.generation + 1 }, '2026-01-01T00:00:00.000Z');
        const written = await append(next);
        return { code: 'COMMITTED', revision: written.revision };
      });
    },
    async observedReadback() {
      const record = await latest();
      if (!record) throw fail('UNINITIALIZED');
      const proof = { rows: rawRows(record.rows), generation: record.generation };
      readbackProofs.set(proof, record.generation);
      return proof;
    },
    async abortUnchanged(id, readback) {
      return locked(async record => {
        if (record.intent?.id !== id || !['WRITING', 'NEEDS_RECONCILE'].includes(record.state)) {
          throw fail('NO_UNRESOLVED_MUTATION');
        }
        if (readbackProofs.get(readback) !== record.generation ||
            !equal(readback.rows, record.rows) || !equal(record.rows, record.intent.before) ||
            record.intent.applied.length !== 0) {
          throw fail('ABORT_REQUIRES_UNCHANGED_READBACK');
        }
        await append({ ...record, state: 'READY', intent: null, reason: null });
        return { code: 'ABORTED_UNCHANGED', revision: record.revision };
      });
    },
    async detectDrift() {
      return locked(async record => {
        if (record?.state !== 'READY') throw fail('SOURCE_NOT_READY');
        if (record.committedDigest === commitDigest(record)) return { code: 'NO_DRIFT' };
        await append({ ...record, state: 'NEEDS_RECONCILE', reason: 'UNTRACKED_SOURCE_DRIFT' });
        return { code: 'DRIFT_DETECTED' };
      });
    },
    // Simulates a writer that bypasses the participating fence. No revision is
    // manufactured; the source is quarantined pending explicit reconciliation.
    async simulateDirectEdit(table, rows) {
      return locked(async record => {
        ready(record);
        if (!KEYS.includes(table) || !Array.isArray(rows)) throw fail('INVALID_TABLE');
        if (equal(rows, record.rows[table])) return { code: 'NO_DRIFT' };
        await append({ ...record, rows: { ...record.rows, [table]: copy(rows) },
          state: 'NEEDS_RECONCILE', reason: 'UNTRACKED_SOURCE_DRIFT' });
        return { code: 'DRIFT_DETECTED' };
      });
    },
    async block(reason = 'CONSISTENCY_UNVERIFIABLE') {
      return locked(async record => {
        if (!record) throw fail('UNINITIALIZED');
        await append({ ...record, state: 'BLOCKED',
          reason: REASONS.has(reason) ? reason : 'CONSISTENCY_UNVERIFIABLE' });
        return { code: 'BLOCKED' };
      });
    },
    async reconcileDrift({ readback, eligibility } = {}) {
      return locked(async record => {
        if (record?.state !== 'NEEDS_RECONCILE' || record.intent ||
            record.reason !== 'UNTRACKED_SOURCE_DRIFT' ||
            readbackProofs.get(readback) !== record.generation ||
            !equal(readback.rows, record.rows)) throw fail('RECONCILIATION_EVIDENCE_REQUIRED');
        if (!eligibility || typeof eligibility !== 'object' || Array.isArray(eligibility)) {
          throw fail('ELIGIBILITY_UNVERIFIED');
        }
        const next = { ...record, state: 'READY', revision: record.revision + 1,
          committedDigest: null, eligibility: copy(eligibility), reason: null };
        next.committedDigest = commitDigest(next);
        inspect({ ...next, generation: record.generation + 1 }, '2026-01-01T00:00:00.000Z');
        const written = await append(next);
        return { code: 'RECONCILED', revision: written.revision };
      });
    },
    async verifiedGeneration(observationTime) {
      return locked(async record => {
        const before = await latest();
        const prepared = inspect(record, observationTime, before);
        const after = await latest();
        assertStableSourceGeneration(before, after);
        return prepared;
      });
    },
    async publishReady(storage, observationTime) {
      // Holds the LOCAL authority fence across candidate creation and the
      // existing publisher. There is no cross-service Production atomicity.
      return locked(async record => {
        const prepared = inspect(record, observationTime, await latest());
        return publishLocalSnapshot(storage, prepared.candidate);
      });
    }
  });
}
