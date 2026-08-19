const MOCK_DATA_FILES = Object.freeze({
  villages: 'villages.json',
  waterSystems: 'water_systems.json',
  waterSources: 'village_water_sources.json'
});

/**
 * Resolve mock-data assets relative to the JavaScript module that owns them.
 * This is deployment-path safe for both a domain root and a subdirectory such
 * as /Village_Watersupply/. A plain fetch('../../data/...') would instead be
 * resolved against document.baseURI and can escape the application directory.
 */
export function resolveMockDataUrls(moduleUrl) {
  const base = String(moduleUrl || '').trim();
  if (!base) throw new TypeError('moduleUrl is required');

  return Object.fromEntries(
    Object.entries(MOCK_DATA_FILES).map(([key, filename]) => [
      key,
      new URL(`../../data/mock/${filename}`, base).href
    ])
  );
}
