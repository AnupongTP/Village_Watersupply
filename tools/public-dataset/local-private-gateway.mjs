// LOCAL in-process contract only. This file defines no HTTP route, URL,
// credential, Apps Script handler, or browser-accessible entry point.
const ACTIONS = new Set(['SOURCE_STATUS', 'VERIFIED_SOURCE_READ', 'RECOVERY_STATUS']);

export function assertGatewaySuccess(response) {
  if (!response || response.success !== true) throw new Error('PRIVATE_GATEWAY_REJECTED');
  return response;
}

export function createLocalPrivateSourceGateway(authority, {
  authorize,
  maxRequestBytes = 2048,
  maxResponseBytes = 2_000_000,
  maxReplayEntries = 10_000
} = {}) {
  if (typeof authorize !== 'function' ||
      ![maxRequestBytes, maxResponseBytes, maxReplayEntries].every(value =>
        Number.isSafeInteger(value) && value > 0)) throw new Error('PRIVATE_AUTH_BOUNDARY_REQUIRED');
  const seenNonces = new Set();
  return Object.freeze({
    async request(request) {
      const denied = code => ({ success: false, code });
      try {
        const bytes = Buffer.byteLength(JSON.stringify(request));
        if (bytes > maxRequestBytes || !ACTIONS.has(request?.action) ||
            typeof request?.nonce !== 'string' || !request.nonce.trim()) return denied('REQUEST_REJECTED');
        if (seenNonces.has(request.nonce) || seenNonces.size >= maxReplayEntries) {
          return denied('REQUEST_REJECTED');
        }
        // Reserve synchronously before authorization can yield. Valid attempts
        // stay spent, including denied/failed authorization and source errors.
        seenNonces.add(request.nonce);
        if (!(await authorize(request))) return denied('REQUEST_REJECTED');
        let result;
        if (request.action === 'SOURCE_STATUS') {
          result = { success: true, status: await authority.status() };
        } else if (request.action === 'RECOVERY_STATUS') {
          const status = await authority.status();
          result = { success: true, status: { state: status.state,
            unresolved: status.unresolved, reason: status.reason } };
        } else {
          if (typeof request.observationTime !== 'string') return denied('REQUEST_REJECTED');
          const prepared = await authority.verifiedGeneration(request.observationTime);
          // The in-process trusted candidate retains its WeakMap proof. JSON
          // transport cannot transfer that proof to a remote publisher.
          result = { success: true, report: prepared.report,
            source: prepared.verifiedRead, eligibility: prepared.eligible,
            candidate: prepared.candidate };
        }
        if (Buffer.byteLength(JSON.stringify(result)) > maxResponseBytes) return denied('RESPONSE_LIMIT');
        return result;
      } catch (_) {
        // Never return raw records, auth material, or internal exception text.
        return denied('SOURCE_UNAVAILABLE');
      }
    }
  });
}
