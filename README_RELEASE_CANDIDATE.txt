Village Water Supply Dashboard — v1.0 RC4
============================================

RC4 เน้น Map Actions, Navigation, Document Preview และ GitHub Actions/Playwright CI

สิ่งที่เพิ่ม
---------
- Popup บนแผนที่มีปุ่ม รายละเอียด / นำทาง
- รายละเอียดจาก Map และ Watchlist ใช้ renderer กลางเดียวกัน: assets/js/system-detail.js
- Desktop นำทางเปิด Google Maps Web ด้วยพิกัด destination
- Mobile แสดงตัวเลือกแอปนำทางก่อน
- เอกสารอ้างอิงย้ายขึ้นด้านบนของ Detail Drawer
- เอกสาร PDF ของ info.dla.go.th เปิดผ่าน web preview ก่อน ไม่ใช้ download attribute
- Google Drive/Docs/Sheets/Slides URL ถูก normalize เป็น preview URL
- เพิ่ม GitHub Actions + Playwright E2E + Real API smoke test
- PROJECT_RULES.md อัปเดตกฎถาวรสำหรับ Map Actions, Document Preview และ CI

ติดตั้งบนเครื่องจริง
----------------
1. Backup C:\ms4w\Apache\htdocs\Village_Watersupply
2. Merge ไฟล์จาก RC4 เข้าโฟลเดอร์เดิม
3. ห้ามลบ/ทับ assets\js\config.js ของเครื่องจริง
4. Ctrl+F5 หลังติดตั้ง

GitHub
------
อ่าน GITHUB_ACTIONS_SETUP.md ก่อน push RC4
ต้องสร้าง package-lock.json และ commit ก่อนให้ Dashboard Playwright QA ผ่าน

หมายเหตุ
--------
- Dashboard ยังคง Read-only
- ไม่มี POST/PUT/PATCH/DELETE
- navigation และ document preview เปิดปลายทางภายนอกใน browser/app เท่านั้น ไม่เขียนข้อมูลกลับ Sheet
