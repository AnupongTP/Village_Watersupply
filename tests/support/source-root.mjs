import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function resolveUiSourceRoot() {
  const configured = String(
    process.env.VWS_UI_SOURCE_ROOT || process.env.VWS_FRONTEND_SOURCE_ROOT || ''
  ).trim();
  return configured ? path.resolve(repoRoot, configured) : repoRoot;
}

export function resolveUiSourcePath(...segments) {
  const uiRoot = resolveUiSourceRoot();
  const rel = path.join(...segments);
  const candidate = path.resolve(uiRoot, rel);
  if (candidate !== uiRoot && !candidate.startsWith(`${uiRoot}${path.sep}`)) {
    throw new Error(`UI source path escapes source root: ${rel}`);
  }
  const normalized = rel.replaceAll('\\', '/');
  if (
    !fs.existsSync(candidate) &&
    uiRoot !== repoRoot &&
    (normalized.startsWith('data/mock/') || normalized === 'data/mock' || normalized.startsWith('tools/'))
  ) {
    const fallback = path.resolve(repoRoot, rel);
    if (!fallback.startsWith(`${repoRoot}${path.sep}`)) {
      throw new Error(`Fallback path escapes repo root: ${rel}`);
    }
    return fallback;
  }
  return candidate;
}
