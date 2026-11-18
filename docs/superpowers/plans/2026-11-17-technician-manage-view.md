# Technician Manage View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้าช่างมีปุ่ม "🛠️ จัดการข้อมูล" ใต้ header Reference ที่ค้นหาแล้วกดแก้ไขได้ในคลิกเดียว พร้อมแท็บประวัติ/บัญชีช่าง และเก็บชิ้นส่วนดีไซน์เดิม (หน้าโหลด, login invalid, ป้าย scope, ชื่อ) ให้เข้าธีม

**Architecture:** แก้ใน Candidate ผ่าน generator `build-reference-technician.py` (markup/CSS/patch `technician.js` แบบ replace มี assert anchor) และ bridge เขียนมือ `technician/assets/reference-technician.js`; ย้าย section เดิมของ `technician.js` เข้า `#view-manage` โดยการนำทาง/สิทธิ์ยังเป็นของ `technician.js` แล้วซิงก์ไป root หลังผ่านทั้งชุด

**Tech Stack:** Vanilla JS/HTML/CSS, Python generators, Playwright + axe-core, node:test

**Spec:** `docs/superpowers/specs/2026-11-17-technician-manage-view-design.md`

## Global Constraints

- ไม่แตะ Backend/Auth/SQL/สิทธิ์อำเภอ/R5.1; สิทธิ์จาก backend: `UPDATE_SYSTEM`, `DELETE_SYSTEM`, `MANAGE_TECHNICIANS`
- ไม่เพิ่มความสามารถ ไม่เปลี่ยน dialog แก้ไข/ลบ/บันทึก/expectedVersion/การจัดการบัญชี; การค้นหาคง `searchableText()` เดิม
- หน้า บทสรุปผู้บริหาร / รายละเอียดข้อมูล ต้องไม่เปลี่ยน
- generator หน้าช่างอ่านต้นฉบับจาก `output/ui-ux-preview/promotion-backup-2026-11-17/root-before/` (ห้ามอ่าน root ที่แปลงแล้ว); regenerate ในสำเนาแยกด้วย scratch script แล้วคัดลอกเฉพาะไฟล์ที่ต่าง
- รักษา working changes password-policy ใน `technician.js`; ห้าม reset/restore/clean; ไม่ commit/push/deploy (ขั้น commit ในแผนนี้ = บันทึก ledger เท่านั้น จนกว่าเจ้าของงานสั่ง)
- ห้ามเรียก API จริง; Node ที่ใช้ v24.15.0 (รายงานตามจริง)
- สีโทน Reference: `#5b3fd6`, `#7c5cf0`, เส้น `#e4e0fb`, ข้อความเข้ม `#1c1b4b`/`#26215c`; ข้อความผ่าน WCAG AA 4.5:1
- ข้อความ: ชื่อ "KwanKukkeb – Phayao Village Water Supply Dashboard"; ป้ายล็อก "แก้ไขไม่ได้: ข้อมูลต้นทางมีปัญหา"; แท็บ "📋 รายการระบบประปา" / "🕘 ประวัติการแก้ไข" / "👥 บัญชีช่างเทคนิค"

## Review Focus

1. ออกจากระบบแล้วเข้าใหม่ (คนละบัญชี/คนละอำเภอ): section ที่ย้ายต้องกลับที่เดิม ไม่ค้างข้อมูลผู้ใช้ก่อน และแท็บบัญชีช่างตามสิทธิ์ผู้ใช้ใหม่ → Task 2 test logout-switch-role
2. เปิดลิงก์ตรง `#historyPanel` / `#techniciansPanel` / `#watchlist` หลังรีเฟรช (session resume): ไปถึงแท็บที่ถูก ไม่หลุดไป header เก่า, ไม่มีสิทธิ์ → ภาพรวม → Task 2 test deep-link
3. ช่างกด ⋯ → ดูประวัติ: อยู่ใต้ header Reference, กรอกรหัสระบบให้, ไม่ยิง API ซ้ำ → Task 2 test history-from-row
4. หน้าจอ 390px: ปุ่มแก้ไขกดได้ (≥44px สูง) ไม่ล้นแนวนอน → Task 3 test mobile-card
5. บัญชีไม่มี `UPDATE_SYSTEM`: ไม่มีปุ่มแก้ไขในแถว และกด Enter บนแถวไม่เปิดโหมดแก้ไข → Task 3 test no-permission

---

### Task 1: ธีมชิ้นส่วนเดิม — login invalid, หน้าโหลด, ชื่อ, ป้าย scope

**Files:**
- Modify: `output/ui-ux-preview/execution/build-reference-technician.py` (CSS block ท้ายไฟล์; markup `#bootView`)
- Modify: `output/reference-ux-candidate/index.html` (ชื่อ — ทำแล้วในต้นแบบ ตรวจซ้ำ)
- Test: `tests/e2e/reference-review-regressions.spec.js`, `tests/e2e/error-empty.spec.js` (แก้ข้อความแล้ว), `tests/e2e/technician-mock.spec.js:185` (เคส blank login เดิม)

**Interfaces:** Produces CSS selectors `#bootView.resume-shell` ธีมม่วง; ไม่มี JS interface ใหม่

- [ ] **Step 1: เขียน test `CANDIDATE-UX-10: session resume screen uses the Reference purple header and KwanKukkeb title`**
  ตั้ง token ใน localStorage แล้วหน่วง `data.bootstrap` ไว้ (Promise ค้าง) → assert `#bootView` visible, `#bootView .resume-header` มี `background-image` ที่มี `linear-gradient`, ข้อความ header มี `KwanKukkeb`, `#bootTitle` = `กำลังโหลดข้อมูล...`, axe `color-contrast` บน `#bootView` ไม่มี violation; ปล่อย Promise → `#referenceDashboard` visible
- [ ] **Step 2: รัน** `VWS_UI_SOURCE_ROOT=output/reference-ux-candidate node node_modules/@playwright/test/cli.js test --config tests/reference-ux-isolated.config.js -g "CANDIDATE-UX-10"` — Expected: FAIL (header ขาว/ไม่มี KwanKukkeb)
- [ ] **Step 3: แก้ generator** — (a) markup `#bootView .resume-header`: แทนชื่อ/คำบรรยายเดิมด้วย `KwanKukkeb – Phayao Village Water Supply Dashboard` + บรรทัดไทย `กว๊านกักเก็บ แดชบอร์ดประปาหมู่บ้าน จังหวัดพะเยา`, ลบ `.resume-nav` เดิม (เมนูที่กดไม่ได้), เพิ่มตัวหมุนใน `.resume-content`; (b) CSS: header ไล่สี `linear-gradient(135deg,#5b3fd6,#7c5cf0)` ตัวอักษรขาว, พื้น `#f8f7ff`, ตัวหมุนสี `#5b3fd6` (เคารพ `prefers-reduced-motion`); (c) login invalid: เปลี่ยน selector ธีมเป็น `#loginView .field-label input:not([aria-invalid="true"])` สำหรับ border-color/focus
- [ ] **Step 4: regenerate + รัน** UX-10, `technician-mock.spec.js -g "blank login fields"`, `error-empty.spec.js`, `-g "CANDIDATE-UX-09: district technician"` (ป้าย scope contrast) — Expected: PASS ทั้งหมด
- [ ] **Step 5: ledger** `Task 1: complete` พร้อมคำสั่ง/ผล

### Task 2: View จัดการข้อมูล — ปุ่ม, แท็บ, ย้าย section, การนำทาง

**Files:**
- Modify: `output/ui-ux-preview/execution/build-reference-technician.py` (ต้นแบบมี nav button, `#view-manage`, patch toggle `#dashboardWorkspace`, CSS แท็บ, ซ่อน `.gf`)
- Modify: `output/reference-ux-candidate/technician/assets/reference-technician.js` (ต้นแบบมี `ownsWorkspace`, `setManageTab`, `showManage`, `moveInto`/`restoreMoved`)
- Test: `tests/e2e/reference-review-regressions.spec.js` (UX-09 มีแล้ว 3 เคส)

**Interfaces:**
- Produces: `window.VWSReferenceTechnician.ownsWorkspace(workspace: string): boolean` (true เฉพาะ `'historyPanel'|'techniciansPanel'` เมื่อ view mount และมี `#view-manage`); `#view-manage[data-tab]` ∈ `list|historyPanel|techniciansPanel`; `.manage-tab[data-manage-tab][aria-current="page"]`
- Consumes (technician.js เดิม): `navigateToSection(id)`, hash routing (`hashchange` → `restoreSection`), `handleSystemAction('history',id)` → `navigateToSection('historyPanel')`+`loadHistory(id)`

- [ ] **Step 1: เพิ่ม test 3 เคส** (Review Focus 1–3):
  - `CANDIDATE-UX-09: logout then login as district technician hides account tab and shows only district systems` — admin เปิดแท็บบัญชี → logout → login ช่างจุน → แท็บบัญชี hidden, `#systemsTableBody tr` = 1, `#historyList` ไม่มีข้อมูลของรอบก่อน
  - `CANDIDATE-UX-09: deep links restore manage tabs after session resume` — โหลด `/technician/#historyPanel` พร้อม token → `#view-manage` visible, `#historyPanel` visible, `#appHeader` hidden; ช่างเปิด `#techniciansPanel` → `#view-exec` visible; `#watchlist` → แท็บรายการ โหมดเฝ้าระวัง (`#systemsModeMonitoring[aria-pressed="true"]`)
  - `CANDIDATE-UX-09: row history action opens history tab under Reference header with system id` — แถว s1 ⋯ → ประวัติ → `#historySystemId` = `s1`, `#view-manage .manage-tab[data-manage-tab="historyPanel"][aria-current="page"]`, `data.entityHistory` ถูกเรียก 1 ครั้ง
- [ ] **Step 2: รัน** `-g "CANDIDATE-UX-09"` — Expected: เคสใหม่ FAIL อย่างน้อย deep-link `#watchlist` (bridge ยัง map ไป detail/problem) และเคสที่ต้นแบบไม่ครอบ
- [ ] **Step 3: แก้ bridge** — `activate('watchlist')` → `showManage('list')` (โหมดเฝ้าระวังตั้งโดย technician.js แล้ว); sync แท็บบัญชีทุก `render()` และหลัง login ใหม่; ไม่แตะ logic อื่นที่ผ่านแล้ว; generator คงเดิมเว้นแต่ test ชี้ว่าจำเป็น
- [ ] **Step 4: รัน** `-g "CANDIDATE-UX-09|CANDIDATE-BUG-0"` — Expected: PASS ทั้งหมด
- [ ] **Step 5: ledger** `Task 2: complete`

### Task 3: แถวรายการ — ปุ่มแก้ไข, ป้ายล็อก, โทนม่วง, การ์ดมือถือ

**Files:**
- Modify: `output/ui-ux-preview/execution/build-reference-technician.py` (patch `systemRowHtml` ใน `technician.js` + CSS)
- Test: `tests/e2e/reference-review-regressions.spec.js`

**Interfaces:**
- Produces (ใน technician.js ผ่าน generator): `function systemEditControl(s): string` คืน
  `<button class="system-edit-button" type="button" data-action="edit" data-id="{id}" aria-label="แก้ไขระบบ {name}">แก้ไข</button>` เมื่อ `hasPermission('UPDATE_SYSTEM') && s.managementMutable===true`;
  `<span class="system-edit-locked">แก้ไขไม่ได้: ข้อมูลต้นทางมีปัญหา</span>` เมื่อมีสิทธิ์แต่ไม่ mutable; `''` เมื่อไม่มีสิทธิ์
- Patch anchor: `action=\`<div class="system-row-actions">${systemMapButton(s)}${systemActionTrigger(s)}</div>\`` → ใส่ `${systemEditControl(s)}` เป็นตัวแรก
- Consumes: delegated click เดิมที่ส่ง `data-action` → `handleSystemAction(action,id)` → `openSystem(id,'edit')`

- [ ] **Step 1: เพิ่ม test 4 เคส**
  - `CANDIDATE-UX-11: edit button in manage list opens the existing edit dialog` — admin, แถว s1 `.system-edit-button` คลิก → `#editDialog` visible (ไม่ต้องผ่าน dialog รายละเอียด)
  - `CANDIDATE-UX-11: account without UPDATE_SYSTEM sees no edit button` (Review Focus 5) — permissions `[]` → `.system-edit-button` count 0
  - `CANDIDATE-UX-11: immutable system shows locked label instead of edit` — `data.dashboard` คืน s1 `managementMutable:false` → แถว s1 มีข้อความ `แก้ไขไม่ได้: ข้อมูลต้นทางมีปัญหา`, ไม่มีปุ่มแก้ไข
  - `CANDIDATE-UX-11: 390px card keeps a full-width edit button without horizontal overflow` (Review Focus 4) — viewport 390×844 → `#systemsMobileList .system-edit-button` boundingBox height ≥ 44, `document.documentElement.scrollWidth <= 390`; axe `color-contrast` บน `#view-manage` ไม่มี violation
- [ ] **Step 2: รัน** `-g "CANDIDATE-UX-11"` — Expected: FAIL (ไม่มีปุ่ม)
- [ ] **Step 3: แก้ generator** — เพิ่ม `systemEditControl` + patch anchor (assert มีจริง); CSS ใน `#view-manage`: ปุ่มแก้ไขพื้น `linear-gradient(135deg,#5b3fd6,#7c5cf0)` ขาว, ป้ายล็อก `#fff4e5`/`#8a4b00`, ตาราง/การ์ดเส้น `#e4e0fb` หัวตาราง `#4a4a7a`, ปุ่มโหมด/ค้นหาโทนม่วงแทน sky; มือถือ ≤767px ปุ่มแก้ไข `flex:1; min-height:44px`; dialog รายละเอียด/แก้ไข/ลบ: ปรับเฉพาะสีปุ่มหลัก (`.btn-primary` ใน `#systemDialog,#editDialog,#deleteDialog` เป็นไล่สีม่วง, ปุ่มลบคงสีแดงเดิม) ไม่แตะ markup/ขั้นตอน
  - หมายเหตุ: ปุ่มแผนที่เดิมในแถว (`systemMapButton`) และเมนู ⋯ เดิม (รายละเอียด/แก้ไข/ประวัติ/ลบ) คงไว้ตามเดิม ไม่ย้ายแผนที่เข้า ⋯ — ลดการแก้ `technician.js`; บันทึกเป็น ruling
- [ ] **Step 4: รัน** `-g "CANDIDATE-UX-1|CANDIDATE-UX-09"` — Expected: PASS
- [ ] **Step 5: ledger** `Task 3: complete`

### Task 4: จัดการ test เดิมที่ไม่ผ่าน

**Files:** `tests/e2e/technician-mock.spec.js`, `tests/e2e/reference-ux-isolated.spec.js`, `tests/e2e/reference-review-regressions.spec.js` (เคส I-01+I-03), โค้ดที่ test ชี้ว่าเป็นบั๊ก

- [ ] **Step 1: baseline** — รันเต็มชุด `VWS_UI_SOURCE_ROOT=output/reference-ux-candidate node node_modules/@playwright/test/cli.js test --config playwright.config.js --project=chromium-desktop --workers=2 --reporter=list > output/ui-ux-preview/gemini-review/manage-view/baseline-e2e.log` (เบื้องหลัง) — Expected: บันทึกรายการเคสไม่ผ่านครบ
- [ ] **Step 2: จัดกลุ่มตามสาเหตุ** (อ่าน error บรรทัดแรก + บรรทัด test) ลง `output/ui-ux-preview/gemini-review/manage-view/test-rulings.md`: แต่ละเคส = (a) ผูกกับพฤติกรรมเดิมที่ spec เปลี่ยน → ระบุพฤติกรรมเทียบเท่าใหม่ หรือ (b) บั๊กจริง → ระบุไฟล์ที่ต้องแก้
- [ ] **Step 3: ปรับ test กลุ่ม (a)** — แทน selector/ขั้นตอนเก่า (ปุ่ม "กลับแดชบอร์ด", `#appHeader` ใน history/technicians, `#techniciansAccountButton` ในเมนู, hash → detail/table) ด้วยขั้นตอนใหม่ (แท็บ `.manage-tab`, `#view-manage`) โดยคง assertion เรื่องสิทธิ์, focus, scroll boundary, จำนวน API call, การล้างข้อมูลตอน logout ไว้ครบ ห้ามลบ assertion
- [ ] **Step 4: แก้บั๊กกลุ่ม (b)** แต่ละตัวด้วย RED→GREEN
- [ ] **Step 5: รันเฉพาะไฟล์ที่แก้** — Expected: PASS; ledger `Task 4: complete` + จำนวน (a)/(b)

### Task 5: ตรวจจบและซิงก์ root

- [ ] **Step 1:** Unit `node --test tests/unit/*.test.mjs`, `node tools/static-qa.mjs` (ตั้ง `VWS_UI_SOURCE_ROOT=output/reference-ux-candidate`) — Expected: 176 pass, static QA passed
- [ ] **Step 2:** E2E เต็มชุดบน Candidate — Expected: ผ่านทั้งหมด ยกเว้น `real-api.spec.js` 1 skipped
- [ ] **Step 3:** regenerate ครั้งสุดท้ายในสำเนาแยก ต้อง idempotent (รอบสองไม่มีไฟล์ต่าง) และ Candidate ตรงกับผล generator
- [ ] **Step 4:** สำรองไฟล์ root ที่จะทับไป `output/ui-ux-preview/promotion-backup-2026-11-17/root-before-manage-view/` แล้วคัดลอกเฉพาะไฟล์ที่ต่างจาก Candidate; ตรวจ `cmp` ทุกไฟล์
- [ ] **Step 5:** E2E เต็มชุดบน root (ไม่ตั้ง `VWS_UI_SOURCE_ROOT`) + Unit/static QA — Expected: เท่ากับ Step 1–2
- [ ] **Step 6:** Screenshot หน้าจัดการ ผู้ดูแล/ช่าง 1440 และ 390, หน้าโหลด, login invalid เก็บที่ `output/ui-ux-preview/gemini-review/manage-view/`; รายงานผลจริง + รายการ ruling
