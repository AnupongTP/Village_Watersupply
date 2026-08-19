const DEFAULT_GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 30_000
});

export async function requestCurrentUserPosition({
  geolocation = globalThis.navigator?.geolocation,
  secureContext = globalThis.isSecureContext,
  options = DEFAULT_GEOLOCATION_OPTIONS
} = {}) {
  if (secureContext === false) {
    throw createLocationError('INSECURE_CONTEXT');
  }

  if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
    throw createLocationError('UNSUPPORTED');
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      position => {
        const normalized = normalizeUserPosition(position);
        if (!normalized) {
          reject(createLocationError('INVALID_POSITION'));
          return;
        }
        resolve(normalized);
      },
      error => reject(normalizeGeolocationError(error)),
      options
    );
  });
}

export function normalizeUserPosition(position) {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const accuracy = Number(position?.coords?.accuracy);
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
    timestamp: Number.isFinite(Number(position?.timestamp)) ? Number(position.timestamp) : Date.now()
  };
}

export function normalizeGeolocationError(error) {
  const code = Number(error?.code);
  if (code === 1) return createLocationError('PERMISSION_DENIED', error);
  if (code === 2) return createLocationError('POSITION_UNAVAILABLE', error);
  if (code === 3) return createLocationError('TIMEOUT', error);
  return createLocationError('UNKNOWN', error);
}

export function userLocationErrorMessage(error) {
  switch (error?.locationCode) {
    case 'INSECURE_CONTEXT':
      return 'เบราว์เซอร์อนุญาตการระบุตำแหน่งเฉพาะการเชื่อมต่อที่ปลอดภัย กรุณาเปิดผ่าน HTTPS หรือ localhost';
    case 'UNSUPPORTED':
      return 'เบราว์เซอร์หรืออุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง';
    case 'PERMISSION_DENIED':
      return 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณาอนุญาตสิทธิ์ตำแหน่งในเบราว์เซอร์แล้วลองอีกครั้ง';
    case 'POSITION_UNAVAILABLE':
      return 'อุปกรณ์ไม่สามารถระบุตำแหน่งปัจจุบันได้ กรุณาตรวจสอบ GPS หรือบริการระบุตำแหน่งแล้วลองอีกครั้ง';
    case 'TIMEOUT':
      return 'การระบุตำแหน่งใช้เวลานานเกินกำหนด กรุณาลองอีกครั้งในบริเวณที่รับสัญญาณได้ดีขึ้น';
    case 'INVALID_POSITION':
      return 'เบราว์เซอร์ส่งค่าตำแหน่งที่ไม่สามารถใช้งานได้ กรุณาลองใหม่';
    default:
      return 'ไม่สามารถระบุตำแหน่งปัจจุบันได้ กรุณาลองอีกครั้ง';
  }
}

function createLocationError(locationCode, cause = null) {
  const error = new Error(locationCode);
  error.name = 'UserLocationError';
  error.locationCode = locationCode;
  if (cause) error.cause = cause;
  return error;
}
