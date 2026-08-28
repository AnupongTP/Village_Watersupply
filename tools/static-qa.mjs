import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const failures = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
  const rel = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(rel) : [rel];
});
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(exists('assets/js/config.example.js'), 'config.example.js is required');
if (exists('assets/js/config.js')) {
  const runtimeConfig = read('assets/js/config.js');
  assert(/["']?USE_MOCK_DATA["']?\s*:\s*false/.test(runtimeConfig), 'Production runtime config must not enable mock data');
}

const index = read('index.html');
assert(!index.includes('cdn.tailwindcss.com'), 'Tailwind Play CDN is forbidden');
assert(index.includes('assets/css/tailwind.css'), 'Production Tailwind CSS link is required');
assert(index.includes('assets/css/app.css'), 'app.css link is required');
assert(index.includes('id="filterSearch"'), 'Global Dashboard search control is required');
assert(index.includes('id="activeFilterChips"'), 'Active filter chips container is required');
assert(index.includes('คุณภาพน้ำและปริมาณน้ำโดยรวม'), 'Overall water quality/quantity heading is required');
assert(index.includes('id="btnUserLocation"'), 'Map toolbar user-location action is required');
assert(index.includes('id="btnBackToTop"'), 'Floating back-to-top control is required');
assert(index.includes('id="btnRefresh"') && index.includes('aria-busy="false"'), 'Refresh control requires aria-busy state');
assert(!index.includes('id="btnMapHome"'), 'Old Phayao home toolbar button must stay removed');
assert(!index.includes('data-completeness'), 'Public Dashboard must not render Data Completeness');
assert(!index.includes('ข้อมูลประกอบ Dashboard'), 'Public Dashboard must not render source-quality heading');
assert(!index.includes('ความครบถ้วนของข้อมูล'), 'Public Dashboard must not render source-quality section');

for (const selectId of [
  'filterDistrict',
  'filterLocalAuthority',
  'filterSystemType',
  'filterOperationalStatus',
  'filterDrinkingWaterQuality',
  'filterWaterQuantity'
]) {
  const match = index.match(new RegExp(`<select id="${selectId}"[^>]*>([\\s\\S]*?)<\\/select>`));
  assert(Boolean(match), `Missing filter select ${selectId}`);
  if (match) {
    const nonEmptyStaticOptions = [...match[1].matchAll(/<option\s+value="([^"]*)"/g)]
      .map(option => option[1])
      .filter(Boolean);
    assert(nonEmptyStaticOptions.length === 0, `${selectId} must not hard-code unavailable filter values in HTML`);
  }
}

for (const [key, value, label] of [
  ['operationalStatus', 'NOT_WORKING', 'ใช้การไม่ได้'],
  ['waterQuantity', 'INSUFFICIENT', 'น้ำไม่เพียงพอ'],
  ['drinkingWaterQuality', 'FAIL', 'น้ำดื่มไม่ผ่านเกณฑ์']
]) {
  assert(index.includes(`data-filter-toggle-key="${key}"`), `Monitoring quick filter missing ${key}`);
  assert(index.includes(`data-filter-toggle-value="${value}"`), `Monitoring quick filter missing ${label} target`);
}
assert((index.match(/data-monitoring-filter=/g) || []).length === 3, 'Exactly three monitoring quick-filter controls are required');
assert(index.includes('1 ระบบอาจพบมากกว่า 1 ประเด็น'), 'Monitoring unique-union explanation is required');
assert(!/id="filters"[^>]*\bxl:sticky\b/.test(index), 'Global Filter must remain in normal document flow');

for (const removed of [
  'assets/js/data-quality.js',
  'assets/js/pagination.js',
  'tests/e2e/data-completeness-actions.spec.js',
  'tests/unit/data-quality-pagination.test.mjs'
]) assert(!exists(removed), `${removed} belongs to retired Public Data Completeness and must be removed`);

const jsFiles = walk('assets/js').filter(f => f.endsWith('.js'));
const allJs = jsFiles.map(f => read(f)).join('\n');
assert(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(allJs), 'Read-only frontend contains a write HTTP method');
assert(!allJs.includes('พิกัดอยู่นอกขอบเขตพะเยา'), 'Out-of-bounds coordinate diagnostic must not be user-facing');

for (const rel of jsFiles) {
  const source = read(rel);
  for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
    const importPath = match[1];
    const resolved = path.resolve(path.dirname(path.join(root, rel)), importPath);
    const isRuntimeConfig = rel.replaceAll('\\', '/') === 'assets/js/api.js' && importPath === './config.js';
    assert(fs.existsSync(resolved) || (isRuntimeConfig && exists('assets/js/config.example.js')), `${rel}: missing module import ${importPath}`);
  }
}
assert(!/fa-(?:brands|regular)\b/.test(allJs), 'Only Font Awesome Solid is bundled; brands/regular icon classes are forbidden');

const appSource = read('assets/js/app.js');
assert(appSource.includes('buildTemporaryPublicScope'), 'R5.1 public projection must be applied before rendering');
assert(!appSource.includes('renderDataCompleteness'), 'Public app must not render Data Completeness');
assert(appSource.includes('lastSuccessfulLoadAt'), 'Refresh must track browser successful-load time');
assert(appSource.includes('sourceGeneratedAt'), 'API source timestamp must remain distinct');
assert(appSource.includes('dataLoadInFlight'), 'Refresh in-flight guard is required');
assert(appSource.includes('showRefreshError'), 'Refresh failure must use a distinct preserving-data error state');

const scopeSource = read('assets/js/public-scope.js');
assert(scopeSource.includes('hiddenMissingCoordinateSystems'), 'Public projection must count missing-coordinate suppression');
assert(scopeSource.includes('hiddenWaterworksVillagesWithoutSystem'), 'Public projection must count no-linked-system village suppression');
assert(scopeSource.includes('originalLinkedVillageIds'), 'No-system rule must be based on the original system relation set');
assert(!scopeSource.includes('hiddenIssueRows === 244'), 'Suppression must be rule-driven, not hardcoded to a magic 244 target');

const filterSource = read('assets/js/filters.js');
assert(filterSource.includes('buildFilteredSnapshot'), 'Unified filter snapshot helper is required');
assert(filterSource.includes('FILTER_TOGGLE_SELECTOR'), 'Monitoring quick filters must use centralized filter binding');
assert(filterSource.includes('syncDeclarativeFilterToggles'), 'Monitoring pressed state must synchronize from AppState.filters');
assert(filterSource.includes('deriveFacetedFilterOptions'), 'Dropdown availability must use contextual faceting');
assert(filterSource.includes('reconcileAreaInvalidFilters'), 'Area changes/refresh must reconcile context-invalid system filters');
assert(filterSource.includes("excludeKeys: [key]"), 'System dropdown dimensions must self-exclude while computing alternatives');
assert(filterSource.includes('ignoreSearch: true'), 'Free-text Search must not shrink dropdown option lists');
for (const id of ['filterOperationalStatus', 'filterDrinkingWaterQuality', 'filterWaterQuantity']) {
  assert(filterSource.includes(`replaceSelectOptions('${id}'`), `${id} must be populated dynamically from faceted Public Dataset values`);
}

const chartSource = read('assets/js/charts.js');
for (const filterKey of ['district', 'systemType', 'drinkingWaterQuality', 'waterQuantity']) {
  assert(chartSource.includes(`toggleChartFilter('${filterKey}'`), `Chart cross-filter missing ${filterKey}`);
}
assert(chartSource.includes("pointStyle: 'rectRounded'"), 'District chart needs a non-color cue for village series');
assert(chartSource.includes("pointStyle: 'rect'"), 'District chart needs a non-color cue for water-system series');

const mapSource = read('assets/js/map.js');
assert(mapSource.includes('data-map-action="detail"'), 'Map popup must expose Details action');
assert(mapSource.includes('data-map-action="navigate"'), 'Map popup must expose Navigate action');
assert(mapSource.includes('buildSystemDetailHtml'), 'Map must use shared detail renderer');
assert(mapSource.includes('requestCurrentUserPosition'), 'Map user-location action must use geolocation helper');

const watchSource = read('assets/js/problem-list.js');
assert(watchSource.includes('buildSystemDetailHtml'), 'Watchlist must use shared detail renderer');
assert(!watchSource.includes('function buildDetail('), 'Duplicated detail renderer is forbidden');

const detailSource = read('assets/js/system-detail.js');
assert(detailSource.includes('data-document-preview'), 'Detail drawer must expose preview-first document action');
assert(!/\sdownload(?:=|\s|>)/i.test(detailSource), 'Document preview link must not force download');

const uiSource = read('assets/js/ui.js');
assert(uiSource.includes('initBackToTop'), 'Back-to-top initialization is required');
assert(uiSource.includes('showRefreshError'), 'Refresh-specific error UI is required');
assert(!uiSource.includes('--filter-sticky-height'), 'Sticky metrics must not depend on Global Filter height');

const rules = read('PROJECT_RULES.md');
for (const heading of [
  'Map Popup Actions — LOCKED',
  'Document Reference / Preview — LOCKED',
  'GitHub Actions / CI — LOCKED',
  'Real API Smoke Test — LOCKED',
  'Public Data Quality Boundary — LOCKED'
]) assert(rules.includes(heading), `PROJECT_RULES.md missing ${heading}`);

if (failures.length) {
  console.error(`Static QA failed (${failures.length}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}
console.log(`Static QA passed (${jsFiles.length} JS modules checked).`);
