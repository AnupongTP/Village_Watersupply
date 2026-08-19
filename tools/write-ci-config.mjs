import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const mode = String(process.argv[2] || 'mock').trim().toLowerCase();
const configPath = path.join(root, 'assets/js/config.js');

if (!['mock', 'real'].includes(mode)) {
  throw new Error(`Unknown config mode: ${mode}`);
}

if (mode === 'real') {
  const apiUrl = String(process.env.APPS_SCRIPT_API_URL || '').trim();
  if (!apiUrl) throw new Error('Missing APPS_SCRIPT_API_URL secret');

  const parsed = new URL(apiUrl);
  if (parsed.protocol !== 'https:') throw new Error('APPS_SCRIPT_API_URL must use HTTPS');

  fs.writeFileSync(configPath, `export const CONFIG = ${JSON.stringify({
    APP_NAME: 'Village Water Supply Dashboard',
    PROVINCE: 'พะเยา',
    API_URL: apiUrl,
    USE_MOCK_DATA: false
  }, null, 2)};\n`);

  console.log('Wrote real API test config without logging the secret URL.');
} else {
  fs.writeFileSync(configPath, `export const CONFIG = ${JSON.stringify({
    APP_NAME: 'Village Water Supply Dashboard',
    PROVINCE: 'พะเยา',
    API_URL: '',
    USE_MOCK_DATA: true
  }, null, 2)};\n`);

  console.log('Wrote mock-data test config.');
}
