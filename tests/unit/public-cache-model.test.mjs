import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemporaryPublicScope } from '../../assets/js/public-scope.js';
import {
  CACHE_FIELDS, allowlistPublicDataset, buildCacheRecord, sourceTag, validateCacheRecord
} from '../../assets/js/public-cache-model.js';

const RESTRICTED = ['responsible_agency', 'establishment_agency', 'transfer_agency', 'transfer_other', 'transfer_year', 'shared_village_name', 'transfer_document_url', 'document_url', 'owner'];
const MANAGEMENT_AND_AUTH = ['is_deleted', 'deleted_at', 'record_status', 'submission_status', 'publication_status', 'isDeleted', 'deletedAt', 'recordStatus', 'submissionStatus', 'publicationStatus', 'publicVisible', 'processingGuard', 'password', 'passwordHash', 'token', 'auth_token', 'vws_management_token_v2'];
const source = () => ({
  generatedAt: '2026-01-01T00:00:00Z',
  villages: [
    { village_id: 'v1', village_name: 'A', district: 'จุน', has_village_waterworks: true, secret_note: 'x', is_deleted: false, password: 'secret' },
    { village_id: 'v2', village_name: 'B', district: 'จุน', has_village_waterworks: true },      // waterworks, no system -> hidden (rule 2)
    { village_id: 'v3', village_name: 'C', district: 'จุน', has_village_waterworks: true }       // only system lacks coordinates
  ],
  waterSystems: [
    { system_id: 's1', village_id: 'v1', system_name: 'S1', latitude: 19.2, longitude: 99.8, operational_status: 'WORKING',
      responsible_agency: 'หน่วยงาน', establishment_agency: 'x', transfer_agency: 'x', transfer_other: 'x', transfer_year: 2561,
      shared_village_name: 'x', transfer_document_url: 'http://x', document_url: 'http://y', owner: 'private owner',
      publicVisible: true, processingGuard: { mutable: true }, recordStatus: 'ACTIVE', submissionStatus: 'APPROVED',
      publicationStatus: 'PUBLISHED', isDeleted: false, deletedAt: null, token: 'MGT-secret', auth_token: 'bearer-secret' },
    { system_id: 's3', village_id: 'v3', system_name: 'S3', latitude: '', longitude: '' }
  ],
  waterSources: [{ source_id: 'w1', village_id: 'v1', source_type: 'WELL', households: 3, passwordHash: 'hash' }, { source_id: 'w2', village_id: 'v2', source_type: 'WELL', households: 1 }]
});
const KEY = 'mock';
const make = (input = source()) => buildCacheRecord({ scope: buildTemporaryPublicScope(input), sourceGeneratedAt: input.generatedAt, sourceKey: KEY });
const clone = value => JSON.parse(JSON.stringify(value));

test('persists strictly allowlisted public fields and never restricted, management, or credential fields', () => {
  const record = make();
  const text = JSON.stringify(record);
  for (const field of [...RESTRICTED, ...MANAGEMENT_AND_AUTH, 'secret_note']) {
    assert.equal(text.includes(`"${field}"`), false, field);
  }
  for (const key of Object.keys(CACHE_FIELDS)) {
    for (const row of record.data[key]) for (const field of Object.keys(row)) assert.ok(CACHE_FIELDS[key].includes(field), `${key}.${field}`);
  }
  assert.equal(validateCacheRecord(record, { sourceKey: KEY }).ok, true);
});

test('stores the R5.1 output exactly once and never re-projects on read', () => {
  const input = source();
  const scope = buildTemporaryPublicScope(input);
  assert.deepEqual(scope.villages.map(v => v.village_id), ['v1', 'v3']);   // v2 hidden once
  assert.equal(scope.suppression.hiddenIssueRows, 2);                       // 1 no-system village + 1 missing-coordinate system
  const record = make(input);
  assert.deepEqual(record.data.villages.map(v => v.village_id), ['v1', 'v3']);
  assert.deepEqual(record.data.waterSystems.map(s => s.system_id), ['s1']);
  assert.equal(record.suppression.hiddenIssueRows, 2);
  // Re-applying R5.1 to the cached output would hide v3 as well (double filtering).
  const again = buildTemporaryPublicScope(record.data);
  assert.deepEqual(again.villages.map(v => v.village_id), ['v1']);
  assert.notDeepEqual(again.villages, record.data.villages);
  assert.equal(validateCacheRecord(record, { sourceKey: KEY }).ok, true);
});

test('a refreshed dataset fully replaces the previous one so deletions propagate', () => {
  const first = make();
  const next = source();
  next.villages = next.villages.filter(v => v.village_id !== 'v1');
  next.waterSystems = next.waterSystems.filter(s => s.village_id !== 'v1');
  next.waterSources = next.waterSources.filter(s => s.village_id !== 'v1');
  const second = make(next);
  assert.ok(first.data.waterSystems.some(s => s.system_id === 's1'));
  assert.equal(second.data.waterSystems.some(s => s.system_id === 's1'), false);
  assert.equal(second.data.villages.some(v => v.village_id === 'v1'), false);
});

test('invalid cache records are rejected with a reason', () => {
  const good = make();
  const mutate = fn => { const r = clone(good); fn(r); return validateCacheRecord(r, { sourceKey: KEY }); };
  assert.equal(mutate(r => { r.schema = 99; }).reason, 'SCHEMA_MISMATCH');
  assert.equal(mutate(r => { r.policy = 'x'; }).reason, 'POLICY_MISMATCH');
  assert.equal(validateCacheRecord(clone(good), { sourceKey: 'other' }).reason, 'SOURCE_MISMATCH');
  assert.equal(mutate(r => { r.savedAt = 'nope'; }).reason, 'INVALID_TIMESTAMP');
  assert.equal(mutate(r => { r.savedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); }).reason, 'INVALID_TIMESTAMP');
  assert.equal(mutate(r => { r.data.waterSystems[0].responsible_agency = 'x'; }).reason, 'NON_ALLOWLISTED_FIELD');
  assert.equal(mutate(r => { r.data.waterSystems[0].system_name = { a: 1 }; }).reason, 'NON_PRIMITIVE_VALUE');
  assert.equal(mutate(r => { r.data.villages.pop(); }).reason, 'COUNT_MISMATCH');
  assert.equal(mutate(r => { r.data.waterSystems[0].village_id = 'zzz'; }).reason, 'ORPHAN_SYSTEM');
  assert.equal(mutate(r => { r.data.waterSystems[0].latitude = ''; }).reason, 'R5_1_VIOLATION');
  assert.equal(mutate(r => { r.data.villages[0].village_name = 'tampered'; }).reason, 'INTEGRITY_MISMATCH');
  assert.equal(mutate(r => { r.data.villages[1].village_id = 'v1'; r.data.villages[1].village_name = 'A'; }).reason, 'INVALID_OR_DUPLICATE_ID');
  for (const bad of [null, undefined, 'x', 5, [], {}]) assert.equal(validateCacheRecord(bad, { sourceKey: KEY }).ok, false);
});

test('rows with non-public value types are refused at write time', () => {
  const scope = buildTemporaryPublicScope(source());
  scope.waterSystems[0].system_name = { nested: true };
  assert.throws(() => allowlistPublicDataset(scope));
  scope.waterSystems[0].system_name = 'ok';
  scope.waterSystems[0].capacity_m3_hr = Infinity;
  assert.throws(() => allowlistPublicDataset(scope));
});

test('source tag separates mock/API and does not store the endpoint', () => {
  assert.equal(sourceTag({ USE_MOCK_DATA: true }), 'mock');
  const tag = sourceTag({ USE_MOCK_DATA: false, API_URL: 'https://script.google.com/macros/s/SECRET/exec' });
  assert.match(tag, /^api-[0-9a-f]+$/);
  assert.equal(tag.includes('SECRET'), false);
  assert.notEqual(tag, sourceTag({ USE_MOCK_DATA: false, API_URL: 'https://example.invalid/other' }));
});

test('old valid cache records are never discarded solely by age and never claim CURRENT', () => {
  const now = Date.parse('2026-10-23T00:00:00Z');
  for (const ageDays of [0, 31, 90, 400]) {
    const savedAt = new Date(now - ageDays * 24 * 60 * 60 * 1000).toISOString();
    const record = buildCacheRecord({
      scope: buildTemporaryPublicScope(source()),
      sourceGeneratedAt: '2025-01-01T00:00:00Z',
      sourceKey: KEY,
      savedAt
    });
    const checked = validateCacheRecord(record, { sourceKey: KEY, now });
    assert.equal(checked.ok, true, `ageDays=${ageDays}`);
    const text = JSON.stringify(record);
    assert.equal(/CURRENT|revision|verified/i.test(text), false, `ageDays=${ageDays}`);
  }
});
