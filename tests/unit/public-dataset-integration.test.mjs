import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTemporaryPublicScope } from '../../assets/js/public-scope.js';
import { prepareLocalPublicCandidate, consumeLocalDashboardResponse } from '../../tools/public-dataset/local-integration.mjs';
import { createVerifiedSnapshotStore } from '../../tools/public-dataset/snapshot.mjs';
import { sourceFixture, selfManifest, oracle, decisions } from '../support/publication-fixture.mjs';

test('synthetic source to verified public response uses R5.1 once', () => {
  const data = sourceFixture();
  const prepared = prepareLocalPublicCandidate(data, selfManifest(data), {
    verifyRead: oracle(data, 1), verifyEligibility: decisions(data),
    observationTime: '2026-10-19T04:00:00Z'
  });
  assert.equal(prepared.report.completeness, 'VERIFIED');
  const store = createVerifiedSnapshotStore(); store.accept(prepared.candidate);
  const fresh = prepareLocalPublicCandidate(data, selfManifest(data), {
    verifyRead: oracle(data, 1), verifyEligibility: decisions(data),
    observationTime: '2026-10-19T05:00:00Z'
  });
  const response = store.publicResponse(fresh.candidate);
  assert.equal(response.success, true);
  assert.equal(response.projectionOwner, 'SERVER_R5_1');
  assert.deepEqual(consumeLocalDashboardResponse(response).villages.map(row => row.village_id), ['v1', 'v2', 'v4']);
  assert.deepEqual(consumeLocalDashboardResponse(response).waterSystems.map(row => row.system_id), ['s2']);
  assert.deepEqual(consumeLocalDashboardResponse(response).waterSources.map(row => row.source_id), ['r1', 'r2', 'r4']);
  assert.equal(JSON.stringify(response).includes('password'), false);
  // The current frontend projection is non-idempotent; this local adapter is
  // the required future ownership switch, not an activated frontend change.
  assert.deepEqual(buildTemporaryPublicScope(response).villages.map(row => row.village_id), ['v2', 'v4']);
});

test('failed independent verification blocks public candidate and response', () => {
  const data = sourceFixture();
  const prepared = prepareLocalPublicCandidate(data, selfManifest(data), {
    verifyRead: () => ({ ...oracle(data)(), complete: false }),
    verifyEligibility: decisions(data), observationTime: '2026-10-19T04:00:00Z'
  });
  assert.equal(prepared.candidate, null);
  assert.equal(prepared.report.completeness, 'INCOMPLETE');
  assert.equal(createVerifiedSnapshotStore().state, 'UNAVAILABLE');
});

test('unknown projection owner and malformed transport fail closed', () => {
  const data = sourceFixture();
  assert.deepEqual(consumeLocalDashboardResponse(data).villages.map(row => row.village_id), ['v1', 'v2', 'v4']);
  assert.throws(() => consumeLocalDashboardResponse({ ...data, projectionOwner: 'UNRECOGNIZED' }), /Unknown/);
  assert.throws(() => consumeLocalDashboardResponse({ success: true, villages: [] }), /Invalid/);
});
