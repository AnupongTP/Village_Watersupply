import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGeolocationError,
  normalizeUserPosition,
  requestCurrentUserPosition,
  userLocationErrorMessage
} from '../../assets/js/user-location.js';

test('normalizes a valid browser geolocation position', () => {
  const value = normalizeUserPosition({
    coords: { latitude: 19.171194, longitude: 99.874972, accuracy: 12.4 },
    timestamp: 1234
  });
  assert.deepEqual(value, {
    latitude: 19.171194,
    longitude: 99.874972,
    accuracy: 12.4,
    timestamp: 1234
  });
});

test('rejects invalid earth coordinates', () => {
  assert.equal(normalizeUserPosition({ coords: { latitude: 91, longitude: 99 } }), null);
  assert.equal(normalizeUserPosition({ coords: { latitude: 19, longitude: 181 } }), null);
});

test('requestCurrentUserPosition uses browser API without backend persistence', async () => {
  const calls = [];
  const geolocation = {
    getCurrentPosition(success, _failure, options) {
      calls.push(options);
      success({ coords: { latitude: 19.2, longitude: 99.9, accuracy: 8 }, timestamp: 7 });
    }
  };

  const value = await requestCurrentUserPosition({ geolocation, secureContext: true });
  assert.equal(value.latitude, 19.2);
  assert.equal(value.longitude, 99.9);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].enableHighAccuracy, true);
});

test('maps native geolocation errors to Thai user-facing guidance', () => {
  const denied = normalizeGeolocationError({ code: 1 });
  const unavailable = normalizeGeolocationError({ code: 2 });
  const timeout = normalizeGeolocationError({ code: 3 });

  assert.equal(denied.locationCode, 'PERMISSION_DENIED');
  assert.match(userLocationErrorMessage(denied), /อนุญาตสิทธิ์ตำแหน่ง/);
  assert.match(userLocationErrorMessage(unavailable), /GPS|ระบุตำแหน่ง/);
  assert.match(userLocationErrorMessage(timeout), /นานเกินกำหนด/);
});

test('rejects insecure context before requesting location', async () => {
  let called = false;
  const geolocation = { getCurrentPosition() { called = true; } };
  await assert.rejects(
    requestCurrentUserPosition({ geolocation, secureContext: false }),
    error => error?.locationCode === 'INSECURE_CONTEXT'
  );
  assert.equal(called, false);
});
