# GitHub Actions setup

Repository: `AnupongTP/Village_Watersupply`

## Secret

ตั้งค่าแล้ว: `APPS_SCRIPT_API_URL`

Repository → Settings → Secrets and variables → Actions

ค่าต้องเป็น Google Apps Script Web App URL ที่ลงท้าย `/exec` และห้าม commit URL จริงลง source.

## ลำดับติดตั้ง RC4 + CI ที่ถูกต้อง

1. Backup local project.
2. Merge ไฟล์ RC4 เข้า repository/local project โดยรักษา `assets/js/config.js` ของเครื่องจริงไว้.
3. ใช้ Node.js 22 แล้วสร้าง lockfile ก่อน commit:

```powershell
node --version
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

4. ตรวจว่า `package-lock.json` ถูกสร้างที่ repository root.
5. รัน local static/unit checks:

```powershell
npm ci --no-audit --no-fund
npm run build:css
npm run qa:static
npm run test:unit
```

6. Commit source + generated `assets/css/tailwind.css` + `package-lock.json` พร้อมกัน แล้ว push.
7. GitHub Actions `Dashboard Playwright QA` จะรัน Chromium จริงบน GitHub runner.
8. เมื่อ workflow หลักผ่าน ให้รัน `Real Apps Script Smoke Test` แบบ manual หนึ่งครั้งเพื่อทดสอบ Secret/API จริง.
9. ถ้า workflow fail ให้เปิด artifact `playwright-report-*` และ `playwright-test-results-*`; ห้าม merge/release จนกว่าการทดสอบจะผ่าน.

## Workflows

### Dashboard Playwright QA
รันเมื่อ push/PR เข้า `main` และ manual dispatch. ตรวจ source hygiene, syntax, Tailwind production build, unit tests, Chromium E2E, responsive/layout, map actions, document preview, presentation-code leakage, screenshots/traces.

### Real Apps Script Smoke Test
รัน manual และทุกวัน 08:00 ประเทศไทย (01:00 UTC). ใช้ `GET` เท่านั้น ตรวจ schema จริง แล้วเปิด Dashboard ด้วย API จริง.

### Generate npm lockfile
เป็น fallback กรณีเครื่อง local ไม่มี Node.js 22. รัน workflow นี้ manual, ดาวน์โหลด artifact `npm-package-lock`, วาง `package-lock.json` ที่ root, commit และ push. Primary QA workflows จะไม่ใช้ `npm install` fallback; ต้องมี lockfile และใช้ `npm ci` เท่านั้น.

## Read-only guarantee
CI มี static gate ตรวจว่า frontend ไม่มี `POST`, `PUT`, `PATCH`, `DELETE` และ real API smoke ใช้ GET เท่านั้น.
