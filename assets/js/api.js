import { CONFIG } from './config.js';

const REQUEST_TIMEOUT_MS = 25000;

export async function loadData() {
  if (CONFIG?.USE_MOCK_DATA) {
    return loadMockData();
  }

  const apiUrl = String(CONFIG?.API_URL || '').trim();
  if (!apiUrl) {
    throw new Error('ยังไม่ได้กำหนด API_URL ใน assets/js/config.js');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`API ตอบกลับ HTTP ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new Error('API ส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้');
    }

    validatePayload(payload);
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('การเชื่อมต่อ API ใช้เวลานานเกินกำหนด กรุณาลองใหม่');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadMockData() {
  const [villages, waterSystems, waterSources] = await Promise.all([
    fetchJson('../../data/mock/villages.json'),
    fetchJson('../../data/mock/water_systems.json'),
    fetchJson('../../data/mock/village_water_sources.json')
  ]);

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    villages,
    waterSystems,
    waterSources
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`โหลดไฟล์ ${url} ไม่สำเร็จ`);
  return response.json();
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('API ไม่ได้ส่งข้อมูล Dashboard กลับมา');
  }

  if (payload.success === false) {
    throw new Error(payload.message || 'API ตอบกลับว่าไม่สำเร็จ');
  }

  const required = ['villages', 'waterSystems', 'waterSources'];
  for (const key of required) {
    if (!Array.isArray(payload[key])) {
      throw new Error(`API ไม่มีชุดข้อมูล ${key} ที่ถูกต้อง`);
    }
  }
}
