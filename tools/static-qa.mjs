import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const configuredRoot = String(
  process.env.VWS_UI_SOURCE_ROOT || process.env.VWS_FRONTEND_SOURCE_ROOT || ''
).trim();
const uiRoot = configuredRoot ? path.resolve(repoRoot, configuredRoot) : repoRoot;
const failures = [];
const readUi = rel => fs.readFileSync(path.join(uiRoot, rel), 'utf8');
const readRepo = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const existsUi = rel => fs.existsSync(path.join(uiRoot, rel));
const existsRepo = rel => fs.existsSync(path.join(repoRoot, rel));
const walkUi = dir => {
  const full = path.join(uiRoot, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(dir, entry.name);
    return entry.isDirectory() ? walkUi(rel) : [rel];
  });
};
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(!existsUi('technician-read-smoke.html') && !existsRepo('technician-read-smoke.html'), 'Public Technician credential QA page must not be published');

assert(existsUi('assets/js/config.example.js'), 'config.example.js is required');
if (existsUi('assets/js/config.js')) {
  const runtimeConfig = readUi('assets/js/config.js');
  assert(/["']?USE_MOCK_DATA["']?\s*:\s*false/.test(runtimeConfig), 'Production runtime config must not enable mock data');
}

const index = readUi('index.html');
assert(!index.includes('cdn.tailwindcss.com'), 'Tailwind Play CDN is forbidden');
assert(!index.includes('dataScript'), 'Reference public HTML must not embed static JSON dataScript');
assert(index.includes('assets/css/reference-dashboard.css'), 'Reference public CSS link is required');
for (const scriptSrc of [
  'assets/js/reference-model.js',
  'assets/js/reference-view.js',
  'assets/js/reference-start.js'
]) {
  assert(index.includes(scriptSrc), `Reference public entry missing script: ${scriptSrc}`);
}

for (const id of [
  'fd', 'fla', 'fst', 'frule', 'fq', 'fqClear', 'efReset', 'efCount',
  'gfChips', 'gfEmpty', 'referenceStatus',
  'view-exec', 'view-detail', 'map', 'prob-map',
  'execKpi', 'kpiDetail', 'districtCompare', 'ixBody', 'tblBody', 'vtblBody', 'probBody', 'dqaBox'
]) {
  assert(index.includes(`id="${id}"`), `Public index.html missing required control/container #${id}`);
}

for (const tab of ['compare', 'insight', 'table', 'vtable', 'problem']) {
  assert(index.includes(`data-tab="${tab}"`) && index.includes(`id="panel-${tab}"`), `Public index.html missing detail tab/panel: ${tab}`);
}

for (const heading of [
  'ภาพรวมประปาหมู่บ้านและตำแหน่งระบบ',
  'ความครอบคลุมของประปาและแหล่งน้ำของครัวเรือน',
  'คุณภาพน้ำและความเพียงพอ — จุดเสี่ยงที่ต้องดำเนินการ',
  'อายุระบบและความเสี่ยงโครงสร้างพื้นฐาน',
  'ผู้รับผิดชอบและการถ่ายโอนระบบ',
  'คุณภาพและความครบถ้วนของข้อมูล'
]) {
  assert(index.includes(`<h2>${heading}</h2>`), `Reference executive section heading is required: ${heading}`);
}

for (const forbiddenPublic of [
  'id="referenceVisibility"',
  'id="loginView"',
  'id="editDialog"',
  'id="deleteDialog"',
  'id="techniciansPanel"'
]) {
  assert(!index.includes(forbiddenPublic), `Public index.html must not contain private UI: ${forbiddenPublic}`);
}

assert(!/id="gfBar"[^>]*\bsticky\b/i.test(index), 'Global Filter must remain in normal document flow');

for (const removed of [
  'assets/js/data-quality.js',
  'assets/js/pagination.js',
  'tests/e2e/data-completeness-actions.spec.js',
  'tests/unit/data-quality-pagination.test.mjs'
]) assert(!existsRepo(removed) && !existsUi(removed), `${removed} belongs to retired legacy UI and must remain removed`);

const publicJsFiles = walkUi('assets/js').filter(f => f.endsWith('.js'));
const techJsFiles = walkUi('technician/assets').filter(f => f.endsWith('.js'));
const allPublicJs = publicJsFiles.map(f => readUi(f)).join('\n');
assert(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(allPublicJs), 'Read-only Public frontend contains a write HTTP method');

for (const rel of [...publicJsFiles, ...techJsFiles]) {
  const source = readUi(rel);
  for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
    const importPath = match[1];
    const resolved = path.resolve(path.dirname(path.join(uiRoot, rel)), importPath);
    const normalizedRel = rel.replaceAll('\\', '/');
    const isRuntimeConfig = normalizedRel === 'assets/js/api.js' && importPath === './config.js';
    assert(fs.existsSync(resolved) || (isRuntimeConfig && existsUi('assets/js/config.example.js')), `${rel}: missing module import ${importPath}`);
  }
}
assert(!/fa-(?:brands|regular)\b/.test(allPublicJs), 'Only Font Awesome Solid is bundled; brands/regular icon classes are forbidden');

const modelSource = readUi('assets/js/reference-model.js');
const nineRestricted = [
  'responsible_agency', 'establishment_agency', 'transfer_agency',
  'transfer_other', 'transfer_year', 'shared_village_name',
  'transfer_document_url', 'document_url', 'owner'
];
const systemAllowMatch = modelSource.match(/systemFields\s*=\s*['"]([^'"]+)['"]/);
assert(Boolean(systemAllowMatch), 'reference-model.js must define explicit systemFields PUBLIC allowlist');
if (systemAllowMatch) {
  const allowSet = new Set(systemAllowMatch[1].split(/\s+/));
  for (const restricted of nineRestricted) {
    assert(!allowSet.has(restricted), `PUBLIC systemFields allowlist must exclude restricted field ${restricted}`);
  }
}
assert(modelSource.includes("audience==='PUBLIC'"), 'reference-model.js must project PUBLIC audience');
assert(modelSource.includes("audience!=='PUBLIC'?valid:inPhayao"), 'reference-model.js must suppress out-of-Phayao coordinates for PUBLIC');
assert(modelSource.includes("timeZone:'Asia/Bangkok'") || modelSource.includes('timeZone:"Asia/Bangkok"'), 'reference-model.js must compute Buddhist year in Asia/Bangkok timezone');

const startSource = readUi('assets/js/reference-start.js');
assert(startSource.includes('buildTemporaryPublicScope'), 'R5.1 public projection must be applied before rendering');
assert(startSource.includes('PUBLIC_ALLOWLIST_R5_1_V1'), 'reference-start.js must check PUBLIC_ALLOWLIST_R5_1_V1');
assert(startSource.includes('readPublicCache') && startSource.includes('writePublicCache'), 'reference-start.js must use validated public cache lifecycle');
assert(startSource.includes("VWSReferenceModel.adaptDataset(raw,{audience:'PUBLIC'})") || startSource.includes("audience:'PUBLIC'"), 'reference-start.js must pass PUBLIC audience to VWSReferenceModel');
assert(startSource.includes('toReferenceDataset'), 'Public detail modal must use VWSReferenceModel coordinate/year validation');
assert(startSource.includes('refresh.disabled=true') || startSource.includes('if(busy)return;'), 'Refresh in-flight guard is required');
assert(startSource.includes('อัปเดตไม่สำเร็จ'), 'Refresh failure must preserve existing data with an explicit status message');

const viewSource = readUi('assets/js/reference-view.js');
assert(viewSource.includes('esc(s.vno)') && viewSource.includes('esc(gm)'), 'reference-view.js must escape map popup fields and href values');
assert(viewSource.includes('publicVisibility:F.visibility'), 'reference-view.js getSelection must preserve publicVisibility filter');
assert(viewSource.includes("timeZone") || viewSource.includes('referenceYearBE'), 'reference-view.js must use dynamic referenceYearBE');

const scopeSource = readUi('assets/js/public-scope.js');
assert(scopeSource.includes('hiddenMissingCoordinateSystems'), 'Public projection must count missing-coordinate suppression');
assert(scopeSource.includes('hiddenWaterworksVillagesWithoutSystem'), 'Public projection must count no-linked-system village suppression');
assert(scopeSource.includes('originalLinkedVillageIds'), 'No-system rule must be based on the original system relation set');
assert(!scopeSource.includes('hiddenIssueRows === 244'), 'Suppression must be rule-driven, not hardcoded to a magic 244 target');

const detailSource = readUi('assets/js/system-detail.js');
assert(detailSource.includes('data-document-preview'), 'Detail modal/card must expose preview-first document action');
assert(!/\sdownload(?:=|\s|>)/i.test(detailSource), 'Document preview link must not force download');

const techIndex = readUi('technician/index.html');
assert(!techIndex.includes('cdn.tailwindcss.com'), 'Tailwind Play CDN is forbidden in Technician HTML');
assert(techIndex.includes('reference-technician.css') && techIndex.includes('reference-technician.js'), 'Technician page must load Reference presentation bridge');
for (const techId of [
  'loginView', 'bootView', 'appView', 'dashboardWorkspace', 'referenceDashboard',
  'systemDialog', 'editDialog', 'deleteDialog', 'historyPanel', 'techniciansPanel',
  'passwordDialog', 'busyOverlay', 'referenceHistoryButton'
]) {
  assert(techIndex.includes(`id="${techId}"`), `Technician index.html missing required element #${techId}`);
}

const techBridge = readUi('technician/assets/reference-technician.js');
assert(techBridge.includes('VWSReferenceModel.adaptDataset'), 'Technician presentation must normalize via VWSReferenceModel');
assert(techBridge.includes("user.role==='TECHNICIAN'"), 'Technician bridge must keep district scoping');
assert(techBridge.includes('function syncWorkspace') && techBridge.includes('function destroy'), 'Technician bridge must manage workspace chrome and full destroy');

const techController = readUi('technician/assets/technician.js');
assert(techController.includes('VWSReferenceTechnician?.destroy()'), 'Logout/clearSession must destroy Reference presentation');
assert(techController.includes('STALE_RESPONSE'), 'Technician controller must guard against stale post-logout responses');

const rules = readRepo('PROJECT_RULES.md');
for (const heading of [
  'Map Popup Actions — LOCKED',
  'Document Reference / Preview — LOCKED',
  'GitHub Actions / CI — LOCKED',
  'Real API Smoke Test — LOCKED',
  'Public Data Quality Boundary — LOCKED'
]) assert(rules.includes(heading), `PROJECT_RULES.md missing ${heading}`);

if (failures.length) {
  console.error(`Static QA failed (${failures.length}) [sourceRoot=${uiRoot}]:`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}
console.log(`Static QA passed (${publicJsFiles.length} public JS + ${techJsFiles.length} technician JS modules checked, sourceRoot=${uiRoot}).`);
