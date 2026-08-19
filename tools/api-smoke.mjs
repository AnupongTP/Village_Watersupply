const apiUrl = String(process.env.APPS_SCRIPT_API_URL || '').trim();

if (!apiUrl) {
  throw new Error('Missing APPS_SCRIPT_API_URL secret');
}

const parsed = new URL(apiUrl);
if (parsed.protocol !== 'https:') {
  throw new Error('APPS_SCRIPT_API_URL must use HTTPS');
}

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
  const response = await fetch(apiUrl, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: controller.signal
  });

  if (!response.ok) {
    throw new Error(`Real API smoke failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object') throw new Error('Real API returned non-object payload');
  if (payload.success === false) throw new Error(payload.message || 'Real API returned success=false');

  for (const key of ['villages', 'waterSystems', 'waterSources']) {
    if (!Array.isArray(payload[key])) throw new Error(`Real API missing array: ${key}`);
  }

  console.log(JSON.stringify({
    success: true,
    villages: payload.villages.length,
    waterSystems: payload.waterSystems.length,
    waterSources: payload.waterSources.length,
    generatedAt: payload.generatedAt || null
  }));
} finally {
  clearTimeout(timeoutId);
}
