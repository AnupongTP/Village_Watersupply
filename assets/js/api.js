import { CONFIG } from './config.js';
import { resolveMockDataUrls } from './api-paths.js';

const REQUEST_TIMEOUT_MS = 25000;

export async function loadData() {
  if (CONFIG?.USE_MOCK_DATA) {
    return loadMockData();
  }

  const apiUrl = String(CONFIG?.API_URL || '').trim();
  if (!apiUrl) {
    throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อข้อมูล');
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
      throw new Error(`โหลดข้อมูลไม่สำเร็จ (รหัส ${response.status}) กรุณาลองใหม่`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new Error('ระบบข้อมูลส่งข้อมูลกลับมาในรูปแบบที่อ่านไม่ได้');
    }

    validatePayload(payload);
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('การเชื่อมต่อข้อมูลใช้เวลานานเกินกำหนด กรุณาลองใหม่');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadMockData() {
  const urls = resolveMockDataUrls(import.meta.url);
  const [villages, waterSystems, waterSources] = await Promise.all([
    fetchJson(urls.villages, 'หมู่บ้าน'),
    fetchJson(urls.waterSystems, 'ระบบประปา'),
    fetchJson(urls.waterSources, 'แหล่งน้ำ')
  ]);

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    villages,
    waterSystems,
    waterSources
  };
}

async function fetchJson(url, label) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`โหลดข้อมูลตัวอย่าง${label}ไม่สำเร็จ`);
  return response.json();
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('ระบบข้อมูลไม่ได้ส่งข้อมูลแดชบอร์ดกลับมา');
  }

  if (payload.success === false) {
    throw new Error(payload.message || 'ระบบข้อมูลตอบกลับว่าไม่สำเร็จ');
  }

  const required = ['villages', 'waterSystems', 'waterSources'];
  for (const key of required) {
    if (!Array.isArray(payload[key])) {
      throw new Error('ข้อมูลแดชบอร์ดไม่ครบถ้วนหรือไม่ถูกต้อง');
    }
  }
}
