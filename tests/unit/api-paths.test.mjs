import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMockDataUrls } from '../../assets/js/api-paths.js';

test('resolves mock data correctly when dashboard is hosted at domain root', () => {
  const urls = resolveMockDataUrls('https://example.test/assets/js/api.js');
  assert.equal(urls.villages, 'https://example.test/data/mock/villages.json');
  assert.equal(urls.waterSystems, 'https://example.test/data/mock/water_systems.json');
  assert.equal(urls.waterSources, 'https://example.test/data/mock/village_water_sources.json');
});

test('keeps mock data inside an Apache subdirectory deployment', () => {
  const urls = resolveMockDataUrls('https://example.test/Village_Watersupply/assets/js/api.js');
  assert.equal(urls.villages, 'https://example.test/Village_Watersupply/data/mock/villages.json');
  assert.equal(urls.waterSystems, 'https://example.test/Village_Watersupply/data/mock/water_systems.json');
  assert.equal(urls.waterSources, 'https://example.test/Village_Watersupply/data/mock/village_water_sources.json');
});

test('supports deeper application base paths without escaping the app root', () => {
  const urls = resolveMockDataUrls('https://example.test/apps/water/dashboard/assets/js/api.js');
  assert.equal(urls.villages, 'https://example.test/apps/water/dashboard/data/mock/villages.json');
});

test('rejects an empty module URL', () => {
  assert.throws(() => resolveMockDataUrls(''), /moduleUrl is required/);
});
