// ตัวอย่างไฟล์ตั้งค่าเท่านั้น
// สำหรับติดตั้งใหม่ ให้คัดลอกไฟล์นี้เป็น config.js แล้วกำหนด API_URL จริง
// Release package จะไม่สร้าง/ทับ config.js เพื่อป้องกัน URL ของระบบจริงสูญหาย
export const CONFIG = {
  APP_NAME: 'Village Water Supply Dashboard',
  PROVINCE: 'พะเยา',
  API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  USE_MOCK_DATA: false
};
