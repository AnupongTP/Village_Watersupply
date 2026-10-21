import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../tools/management-appscript/technician-hard-delete.js', import.meta.url), 'utf8');
const headers = ['user_id', 'username', 'password', 'role', 'status'];
const original = ['USR-TECH-1', 'test', 'synthetic-only', 'TECHNICIAN', 'ACTIVE'];

function harness(options = {}) {
  const state = {
    rows: [original.slice()],
    sessions: [{ userId: 'USR-TECH-1', revoked: false }],
    audits: [],
    locked: false,
    deleteThrows: Boolean(options.deleteThrows),
    commitThrows: Boolean(options.commitThrows)
  };
  const fail = (code, message) => Object.assign(new Error(message), { mgmtCode: code });
  const sheet = {
    getLastRow: () => state.rows.length + 1,
    deleteRow(row) {
      if (state.deleteThrows) throw new Error('synthetic Sheet failure');
      state.rows.splice(row - 2, 1);
    },
    insertRowBefore(row) { state.rows.splice(row - 2, 0, Array(headers.length).fill('')); },
    insertRowAfter(row) { state.rows.splice(row - 1, 0, Array(headers.length).fill('')); },
    getRange(row) {
      return { setValues(values) { state.rows[row - 2] = values[0].slice(); } };
    }
  };
  const table = () => ({
    rows: state.rows.map(row => row.slice()),
    headers,
    headerMap: { user_id: 0, username: 1, status: 4 },
    sheet
  });
  const getUser = userId => {
    const t = table();
    const i = t.rows.findIndex(row => row[0] === userId);
    if (i < 0) throw fail('NOT_FOUND', 'not found');
    const row = t.rows[i];
    if (row[3] !== 'TECHNICIAN') throw fail('FORBIDDEN', 'not technician');
    return { usersTable: t, user: { userId, normalizedUsername: row[1].toLowerCase(), status: row[4], sheetRow: i + 2, row } };
  };
  const ctx = {
    MGMT_PERMISSION: { MANAGE_TECHNICIANS: 'MANAGE_TECHNICIANS' },
    MGMT_OPS: { ACTION_TECH_DELETE: 'TECHNICIAN_DELETE', ENTITY_USER: 'USER' },
    MGMT_CONFIG: { SHEETS: { USERS: 'users' }, USER_STATUSES: { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED' } },
    SpreadsheetApp: { flush() {} },
    mgmtNewRequestId_: () => 'REQ-1',
    mgmtNormalizeText_: value => String(value ?? '').trim(),
    mgmtNormalizeUsername_: value => String(value ?? '').trim().toLowerCase(),
    mgmtError_: fail,
    mgmtAcquireScriptLock_: () => { assert.equal(state.locked, false); state.locked = true; return {}; },
    mgmtReleaseScriptLock_: () => { state.locked = false; },
    mgmtOpenSpreadsheet_: () => state,
    mgmtVerifySessionLocked_: () => ({ context: { userId: 'USR-ADMIN-1', username: 'admin', role: 'ADMIN' } }),
    mgmtOpsRecoverPreparedUserAuditsLocked_: () => {},
    mgmtOpsFindUserByIdForAdminLocked_: (_ss, id) => getUser(id),
    mgmtOpsValidateExpectedUserVersion_: (t, u, version) => {
      if (version !== JSON.stringify(u.row)) throw fail('CONFLICT', 'stale version');
    },
    mgmtOpsSanitizedUserObjectFromRow_: (_t, row) => ({ user_id: row[0], username: row[1], role: row[3], status: row[4] }),
    mgmtOpsAppendPreparedAuditLocked_: (_ss, _context, spec) => {
      const audit = { ...spec, auditId: 'AUD-1', transactionId: 'TX-1', status: 'PREPARED' };
      state.audits.push(audit);
      return audit;
    },
    mgmtFindUserByNormalizedUsernameLocked_: (_ss, username) => {
      const found = state.rows.filter(row => row[1].toLowerCase() === username);
      if (found.length > 1) throw fail('DATA_INTEGRITY_CONFLICT', 'duplicate username');
      return { match: found.length ? { userId: found[0][0] } : null };
    },
    mgmtRevokeAllSessionsForUserLocked_: (_ss, userId) => {
      for (const session of state.sessions) if (session.userId === userId) session.revoked = true;
    },
    mgmtReadUsersTable_: table,
    mgmtOpsCommitAuditLocked_: (_ss, audit) => {
      if (state.commitThrows) throw fail('AUDIT_COMMIT_FAILED', 'commit failed');
      audit.status = 'COMMITTED';
    },
    mgmtOpsFailAuditBestEffortLocked_: (_ss, audit) => { audit.status = 'FAILED'; },
    mgmtOpsTouchSessionAfterCommittedBestEffort_: () => {},
    mgmtSuccess_: data => ({ success: true, data }),
    mgmtFailureFromException_: error => ({ success: false, error: { code: error.mgmtCode || 'MUTATION_FAILED' } }),
    mgmtLogSafeFailure_: () => {},
    mgmtSecureStringEquals_: (a, b) => a === b,
    mgmtRecordVersion_: (_headers, row) => JSON.stringify(row)
  };
  runInNewContext(source, ctx);
  const request = { userId: 'USR-TECH-1', expectedVersion: JSON.stringify(original), reason: 'synthetic audit reason' };
  return { state, ctx, request };
}

test('permanent technician deletion removes only the target row, revokes sessions, and commits audit', () => {
  const { state, ctx, request } = harness();
  state.rows.push(['USR-TECH-2', 'other', 'synthetic-only', 'TECHNICIAN', 'ACTIVE']);
  const response = ctx.mgmtDeleteTechnician('synthetic-token', request);
  assert.equal(response.success, true);
  assert.equal(response.data.deleted, true);
  assert.deepEqual(state.rows.map(row => row[0]), ['USR-TECH-2']);
  assert.equal(state.sessions[0].revoked, true);
  assert.equal(state.audits[0].status, 'COMMITTED');
  assert.equal(state.audits[0].after, null);
  assert.equal(ctx.mgmtFindUserByNormalizedUsernameLocked_(state, 'test').match, null);
});

test('stale version and missing reason cannot remove an account', () => {
  for (const changed of [{ expectedVersion: 'old' }, { reason: '' }]) {
    const { state, ctx, request } = harness();
    const response = ctx.mgmtDeleteTechnician('synthetic-token', { ...request, ...changed });
    assert.equal(response.success, false);
    assert.equal(state.rows.length, 1);
    assert.equal(state.audits.length, 0);
    assert.equal(state.sessions[0].revoked, false);
  }
});

test('a Sheet deletion error retains the account and fails the prepared audit', () => {
  const { state, ctx, request } = harness({ deleteThrows: true });
  const response = ctx.mgmtDeleteTechnician('synthetic-token', request);
  assert.equal(response.success, false);
  assert.equal(state.rows.length, 1);
  assert.equal(state.audits[0].status, 'FAILED');
  assert.equal(state.sessions[0].revoked, true);
});

test('an audit commit failure leaves a recoverable PREPARED deletion', () => {
  const { state, ctx, request } = harness({ commitThrows: true });
  const response = ctx.mgmtDeleteTechnician('synthetic-token', request);
  assert.equal(response.success, false);
  assert.equal(response.error.code, 'AUDIT_COMMIT_FAILED');
  assert.equal(state.rows.length, 0);
  assert.equal(state.audits[0].status, 'PREPARED');
  assert.equal(state.sessions[0].revoked, true);
});

test('admin accounts cannot be deleted through the technician route', () => {
  const { state, ctx, request } = harness();
  state.rows[0][3] = 'ADMIN';
  request.expectedVersion = JSON.stringify(state.rows[0]);
  const response = ctx.mgmtDeleteTechnician('synthetic-token', request);
  assert.equal(response.success, false);
  assert.equal(response.error.code, 'FORBIDDEN');
  assert.equal(state.rows.length, 1);
});
