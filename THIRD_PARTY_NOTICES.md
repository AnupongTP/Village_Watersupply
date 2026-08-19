# Third-party notices

โปรเจกต์นี้ใช้ไลบรารีภายนอกดังต่อไปนี้

- Tailwind CSS 4.1.10 — MIT License. Production CSS ถูก build เป็น `assets/css/tailwind.css`; ไม่ใช้ Tailwind Play CDN.
- Font Awesome Free 6.7.2 — Icons: CC BY 4.0, Code: MIT License. Release นี้ bundle เฉพาะ JavaScript/SVG icon data และ **ไม่ bundle font binaries**.
- Leaflet 1.9.4 — BSD-2-Clause License. โหลด CSS/JS จาก unpkg ใน runtime.
- Chart.js 4.4.7 — MIT License. โหลดจาก jsDelivr ใน runtime.
- SweetAlert2 11.26.25 — MIT License. โหลดจาก jsDelivr ใน runtime.
- Google Fonts: Sarabun — โหลดจาก Google Fonts ใน runtime ตาม requirement ของโครงการ; ไม่มีไฟล์ฟอนต์ถูก bundle ใน Release.

Basemap ของแผนที่ใช้ Esri World Imagery และแสดง attribution ผ่าน Leaflet control ตาม source ที่กำหนดในโค้ด.
