import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigationTargets } from '../../assets/js/navigation.js';

test('creates navigation URLs from valid coordinates', () => {
  const targets = createNavigationTargets({
    latitude: 19.171194,
    longitude: 99.874972,
    label: 'ระบบประปาทดสอบ'
  });

  assert.ok(targets);
  assert.match(targets.googleMapsWeb, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.match(targets.googleMapsWeb, /destination=19\.171194%2C99\.874972/);
  assert.match(targets.appleMaps, /^https:\/\/maps\.apple\.com\//);
  assert.match(targets.genericGeo, /^geo:19\.171194,99\.874972/);
});

test('rejects invalid coordinates', () => {
  assert.equal(createNavigationTargets({ latitude: '', longitude: '' }), null);
  assert.equal(createNavigationTargets({ latitude: 'abc', longitude: 99 }), null);
});
