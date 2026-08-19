import { execFileSync } from 'node:child_process';
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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(!exists('assets/js/config.js'), 'assets/js/config.js must not be committed/generated before CI setup');

const index = read('index.html');
assert(!index.includes('cdn.tailwindcss.com'), 'Tailwind Play CDN is forbidden');
assert(index.includes('assets/css/tailwind.css'), 'Production Tailwind CSS link is required');
assert(index.includes('assets/css/app.css'), 'app.css link is required');

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
    const runtimeConfigTemplateExists = exists('assets/js/config.example.js');
    assert(fs.existsSync(resolved) || (isRuntimeConfig && runtimeConfigTemplateExists), `${rel}: missing module import ${importPath}`);
  }
}

assert(!/fa-(?:brands|regular)\b/.test(allJs), 'Only Font Awesome Solid is bundled; brands/regular icon classes are forbidden');

const mapSource = read('assets/js/map.js');
assert(mapSource.includes('data-map-action="detail"'), 'Map popup must expose Details action');
assert(mapSource.includes('data-map-action="navigate"'), 'Map popup must expose Navigate action');
assert(mapSource.includes("buildSystemDetailHtml"), 'Map must use shared detail renderer');

const watchSource = read('assets/js/problem-list.js');
assert(watchSource.includes("buildSystemDetailHtml"), 'Watchlist must use shared detail renderer');
assert(!watchSource.includes('function buildDetail('), 'Duplicated detail renderer is forbidden');

const detailSource = read('assets/js/system-detail.js');
assert(detailSource.includes('data-document-preview'), 'Detail drawer must expose preview-first document action');
assert(!/\sdownload(?:=|\s|>)/i.test(detailSource), 'Document preview link must not force download');

const rules = read('PROJECT_RULES.md');
for (const heading of ['Map Popup Actions — LOCKED', 'Document Reference / Preview — LOCKED', 'GitHub Actions / CI — LOCKED', 'Real API Smoke Test — LOCKED']) {
  assert(rules.includes(heading), `PROJECT_RULES.md missing ${heading}`);
}

if (failures.length) {
  console.error(`Static QA failed (${failures.length}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log(`Static QA passed (${jsFiles.length} JS modules checked).`);
