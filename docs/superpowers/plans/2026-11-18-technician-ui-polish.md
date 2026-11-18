# Technician/Public UI Polish + Manage Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปุ่มรีเฟรชเข้าที่, เนื้อหาหน้าจัดการอยู่ในการ์ดแบบ Reference, กล่องแจ้งเตือนเล็กตามธีม, และแผนที่ในหน้าจัดการที่ปุ่มแผนที่ในแถวซูมได้ในหน้าเดียว

**Architecture:** แก้ใน Candidate ผ่าน generators (assert anchors) + ไฟล์เขียนมือ (`technician/assets/reference-technician.js`, `assets/js/reference-start.js`); แผนที่หน้าจัดการเป็น Leaflet instance ใหม่ใน bridge ที่ใช้ตัวช่วยวาดหมุด/popup ที่ `VWSReferenceView.mount()` เปิดออกมา และรับข้อมูลรายการจาก `technician.js` ผ่าน hook; ซิงก์ root ท้ายสุด

**Tech Stack:** Vanilla JS, Leaflet + markercluster (มีแล้ว), Python generators, Playwright + axe-core

**Spec:** `docs/superpowers/specs/2026-11-18-technician-ui-polish-design.md`

## Global Constraints
- ไม่แตะ Backend/SQL/Auth/สิทธิ์อำเภอ/R5.1; ไม่เปลี่ยนเนื้อหา/พฤติกรรมหน้า บทสรุปผู้บริหาร/รายละเอียดข้อมูล (ยกเว้นตำแหน่งปุ่มรีเฟรช)
- popup เรียก action เดิมเท่านั้น (`openSystem(id)`, `handleSystemAction('edit',id)`); bridge ไม่ตัดสินสิทธิ์เอง
- generated files แก้ผ่าน `output/ui-ux-preview/execution/build-reference-view.py` / `build-reference-technician.py` เท่านั้น; regen: `bash output/ui-ux-preview/gemini-review/manage-view/regen.sh` สองรอบ รอบสองไม่มี "updated"
- เขียนมือใน Candidate: `technician/assets/reference-technician.js`, `assets/js/reference-start.js`, `technician/assets/technician.css`, `technician/assets/technician-ui.js`
- ไม่เรียก API จริง; ไม่ commit/push/deploy; รายงาน Node ที่ใช้ (v24.15.0)
- โทนสี Reference: `#5b3fd6`, `#7c5cf0`, เส้น `#e4e0fb`, ข้อความเข้ม `#1c1b4b`; ข้อความผ่าน WCAG AA 4.5:1
- toast: กว้าง ≤ 360px (คอม) / ≤ viewport−32px (มือถือ), สูง ≤ 96px บรรทัดเดียว, ตัวอักษร 14px
- แผนที่หน้าจัดการ: สูง ~420px คอม / ~260px มือถือ (≤767px); หมุด = `state.filteredSystems` ทั้งชุดที่มีพิกัดถูกต้อง
- ข้อความใหม่: "ระบบนี้ถูกกรองออกจากรายการปัจจุบัน"; ปุ่มรีเฟรชมือถือ `aria-label="รีเฟรชข้อมูล"`
- Targeted: `VWS_UI_SOURCE_ROOT=output/reference-ux-candidate node node_modules/@playwright/test/cli.js test --config tests/reference-ux-isolated.config.js -g "<pattern>"`; test ใหม่ใน `tests/e2e/reference-review-regressions.spec.js` ชื่อขึ้นต้น `CANDIDATE-POLISH-`

## Review Focus
1. Logout แล้ว login เป็นช่างอำเภออื่น: แผนที่หน้าจัดการไม่ซ้อน ไม่ค้างหมุดของผู้ใช้ก่อน → Task 3 test logout-switch
2. ค้นหาจนไม่เหลือระบบ: แผนที่ไม่ error ว่างเปล่า และกดปุ่มแผนที่ของแถว (ไม่มีแถว) ไม่ได้ → Task 3 test empty-filter
3. ระบบมีพิกัดแต่ถูกกรองออกแล้วสั่งโฟกัส (เช่นจาก deep link/การเรียกตรง): แจ้ง "ระบบนี้ถูกกรองออกจากรายการปัจจุบัน" ไม่เปลี่ยน view → Task 3 test filtered-out
4. มือถือ 390px: แผนที่ไม่ดักการเลื่อนหน้าจนเลื่อนไปถึงรายการไม่ได้ (Leaflet `scrollWheelZoom`/drag บนมือถือ) → Task 3 test mobile-scroll (เลื่อนหน้าผ่านแผนที่ด้วย `page.mouse.wheel` แล้วรายการมองเห็น)
5. หน้าจัดการเปิดก่อน view mount/ระหว่างรีเฟรชข้อมูล: แผนที่อัปเดตหลังรีเฟรช ไม่สร้างซ้ำ → Task 3 test refresh-updates (กดรีเฟรช → หมุดยังจำนวนเท่าเดิม, Leaflet container มี 1 อัน)

---

### Task 1: ปุ่มรีเฟรชเข้าที่ (หน้าสาธารณะ + หน้าช่าง)

**Files:** Modify `output/reference-ux-candidate/assets/js/reference-start.js` (สร้าง `#btnRefresh`), `output/ui-ux-preview/execution/build-reference-view.py` (CSS `.reference-refresh`), `build-reference-technician.py` (CSS `.topbar-actions` ใน `#referenceDashboard .app-header`); Test: regressions spec

**Interfaces:** Produces — ปุ่มรีเฟรชหน้าสาธารณะ `#btnRefresh` อยู่ใน `.app-header` บรรทัดเดียวกับชื่อที่ ≤767px; หน้าช่าง `#refreshButton` ใน `.topbar-actions` ขวาบน

- [ ] **Step 1: test** `CANDIDATE-POLISH-1: refresh buttons sit in the header row without wrapping or clipping` — สำหรับ public และ technician(admin) ที่ 1440×900 และ 390×844: ปุ่มรีเฟรช visible; `scrollWidth <= clientWidth+1` ของปุ่ม (ไม่ตัดข้อความ) ที่ 1440; ที่ 390 ปุ่มมี `aria-label="รีเฟรชข้อมูล"` และ `top` ของปุ่มอยู่ในช่วงความสูงของบรรทัดชื่อ (`|btn.top - title.top| < title.height`) ไม่ต่ำกว่า `.main-nav` bottom; `.app-header` ไม่ล้นแนวนอน; คลิกแล้วยังเรียกโหลดข้อมูลใหม่ (public: request `data/mock` หรือ public API ใน fixture เพิ่มขึ้น; technician: `data.dashboard` เพิ่ม 1)
- [ ] **Step 2: รัน** — Expected FAIL (มือถือปุ่มอยู่ใต้เมนู / คอมหน้าช่างตัดข้อความ)
- [ ] **Step 3: แก้** — public: ย้ายจุดแทรกปุ่มใน `reference-start.js` ให้อยู่ใน container แถวชื่อ/ขวาบน, มือถือแสดงไอคอน `↻` อย่างเดียวพร้อม aria-label (ข้อความ "รีเฟรช" ซ่อนแบบ visually-hidden); technician: CSS ให้ `.topbar-actions` ใน Reference header เป็น flex ไม่หด (`flex:none`), ปุ่มขนาดเท่าปุ่มผู้ใช้, มือถือซ่อนข้อความเหลือไอคอน
- [ ] **Step 4: regen ×2 + รัน** `-g "CANDIDATE-POLISH-1|CANDIDATE-UX-10|header area follows"` — Expected PASS

### Task 2: การ์ดระยะขอบในหน้าจัดการ + toast ธีม Reference

**Files:** Modify `build-reference-technician.py` (CSS ใต้ `#view-manage`), `output/reference-ux-candidate/technician/assets/technician.css` หรือ CSS generator สำหรับ toast (`technician-ui.js` `notify()` สร้าง element — ตรวจ class ที่ใช้แล้ว style ด้วย CSS เท่านั้น); Test: regressions spec

**Interfaces:** Produces — class การ์ด `.manage-card` (หรือ style ตรงบน section เดิม) ที่ Task 3 ใช้ห่อแผนที่

- [ ] **Step 1: test** `CANDIDATE-POLISH-2: manage view content sits inside Reference cards with inner padding` — admin, เปิดจัดการ: สำหรับแท็บรายการและแท็บบัญชีช่าง ที่ 1440 และ 390: section หลัก (`#watchlist` header/ค้นหา/ผลรายการ, `#techniciansPanel`) มี `background-color` ขาว, `border-radius >= 12px`, และ heading แรก `getBoundingClientRect().left - section.left >= 14`; ขอบซ้ายของการ์ด = ขอบซ้ายของการ์ด `.gf`/การ์ดแรกในหน้าบทสรุปผู้บริหาร (±2px) ที่ viewport เดียวกัน
- [ ] **Step 2: test** `CANDIDATE-POLISH-2: toasts are compact Reference-styled boxes` — เรียกเหตุการณ์ที่ขึ้น toast ที่มีอยู่แล้ว (เช่น รีเฟรชสำเร็จ หรือ `page.evaluate(()=>window.VWSTechnicianUI.showWarning('ทดสอบ'))`) ที่ 1440 และ 390: กล่องกว้าง ≤360 (คอม) / ≤ viewport−32 (มือถือ), สูง ≤96, font-size 14px, ผ่าน axe color-contrast
- [ ] **Step 3: รัน** — Expected FAIL
- [ ] **Step 4: แก้ CSS** (ไม่เปลี่ยนข้อความ/เวลา toast, ไม่เปลี่ยน DOM ของ technician.js นอกจากที่จำเป็น); regen ×2
- [ ] **Step 5: รัน** `-g "CANDIDATE-POLISH-2|CANDIDATE-UX-09|CANDIDATE-UX-11"` — Expected PASS

### Task 3: แผนที่ในหน้าจัดการ (A1)

**Files:** Modify `build-reference-view.py` (เปิด API จาก mount), `build-reference-technician.py` (markup `#manageMap` ใน `#view-manage`, hook ใน `technician.js`, CSS), `output/reference-ux-candidate/technician/assets/reference-technician.js`; Test: regressions spec

**Interfaces:**
- Produces (view, ผ่าน generator ที่คืนจาก `mount()`): `markerIcon(system): L.DivIcon` และ `popupHtml(system, actions): string` ที่ใช้ตัวช่วยเดิม (`makeIcon`, popup builder ของหน้าแรก) — `system` เป็นรูปแบบ row ของ technician (`system_id, system_name, latitude, longitude, operational_status, ...`) แปลงผ่าน `VWSReferenceModel` เดียวกับที่ view ใช้
- Produces (bridge `window.VWSReferenceTechnician`): `syncManageMap(systems: object[]): void`, `focusManageMap(id: string): boolean` (true = พบหมุดและเปิด popup), `ownsMapAction(): boolean`
- Produces (technician.js patch): ปลาย `renderSystemsTable()` เรียก `window.VWSReferenceTechnician?.syncManageMap?.(state.filteredSystems)`; ใน `handleSystemAction` กรณี `'map'`: ถ้า `window.VWSReferenceTechnician?.ownsMapAction?.()` → `if(!window.VWSReferenceTechnician.focusManageMap(id))toast('ระบบนี้ถูกกรองออกจากรายการปัจจุบัน','warning')` แทน `navigateToSection('map-section')`; ส่ง callback เพิ่มใน `VWSReferenceTechnician.render(d,onOpenSystem,user,{onEditSystem:id=>handleSystemAction('edit',id),canEditSystem:s=>s.managementMutable===true&&hasPermission('UPDATE_SYSTEM')})`
- Consumes: Task 2 การ์ด

- [ ] **Step 1: tests (RED)** ใน regressions spec:
  - `CANDIDATE-POLISH-3: manage map shows one marker per filtered system with coordinates` — admin, fixture 2 ระบบมีพิกัด → `#manageMap .leaflet-marker-icon` (หรือ cluster นับรวม) แสดง 2; พิมพ์ `#searchInput` = `s1` → เหลือ 1
  - `CANDIDATE-POLISH-3: row map button zooms on the manage map without leaving the manage view` — คลิก `.system-map-button` แถว s1 → `#view-manage` ยัง visible, `#view-exec` hidden, popup `#manageMap .leaflet-popup-content` มีชื่อระบบ s1, ไม่มี toast
  - `CANDIDATE-POLISH-3: popup actions open detail and edit dialogs per permission` — popup ปุ่ม "รายละเอียด" → `#systemDialog`; "แก้ไข" → `#editDialog`; บัญชีไม่มี `UPDATE_SYSTEM` → ไม่มีปุ่ม "แก้ไข" ใน popup
  - `CANDIDATE-POLISH-3: district technician map shows only own-district markers` — ช่างจุน → 1 หมุด
  - Review Focus 1–5: `…logout-switch` (admin → logout → ช่างจุน: `.leaflet-container` ใน `#manageMap` = 1, หมุด 1), `…empty-filter` (ค้นหา `zzz` → 0 หมุด ไม่มี pageerror), `…filtered-out` (`page.evaluate(()=>window.VWSReferenceTechnician.focusManageMap('s2'))` หลังค้นหา `s1` → คืน false; ผ่าน handleSystemAction จะขึ้นข้อความ "ระบบนี้ถูกกรองออกจากรายการปัจจุบัน"), `…mobile-scroll` (390×844: `page.mouse.wheel(0,1200)` เหนือแผนที่ → `#searchInput` in viewport), `…refresh-updates` (กดรีเฟรช → `.leaflet-container` ใน `#manageMap` = 1, หมุด 2)
- [ ] **Step 2: รัน** `-g "CANDIDATE-POLISH-3"` — Expected FAIL
- [ ] **Step 3: แก้ view generator** — เพิ่ม `markerIcon`, `popupHtml` ใน object ที่ `mount()` คืน (ใช้ `makeIcon` และ popup builder เดิม; popup ของหน้าจัดการใส่ปุ่ม `data-manage-action="detail|edit"` แทนลิงก์นำทาง)
- [ ] **Step 4: แก้ technician generator** — markup `<div class="manage-map-card"><div id="manageMap" role="region" aria-label="แผนที่ระบบประปาในรายการ"></div></div>` ก่อน `#manageListSlot`; ซ่อนเมื่อ `#view-manage:not([data-tab="list"])`; patches ตาม Interfaces; CSS ความสูงตาม Global Constraints; มือถือ: Leaflet `scrollWheelZoom:false`, `dragging` เฉพาะสองนิ้ว (`tap`/gesture handling ตามที่ทำได้โดยไม่เพิ่ม dependency)
- [ ] **Step 5: แก้ bridge** — สร้าง map ครั้งแรกเมื่อแท็บรายการแสดง (มีขนาด) ใช้ tile/ชั้นข้อมูลเดียวกับหน้าแรก, markercluster ค่าเดียวกับหน้าแรก; `syncManageMap` วาดหมุดใหม่ทั้งชุด (เก็บ map id→marker); `focusManageMap` scrollIntoView แผนที่ → `zoomToShowLayer` → openPopup; คลิกปุ่มใน popup → callbacks จาก technician.js; `destroy()` → `map.remove()` ล้าง marker/listener; `invalidateSize` เมื่อสลับแท็บกลับมา
- [ ] **Step 6: regen ×2 + รัน** `-g "CANDIDATE-POLISH|CANDIDATE-UX-|CANDIDATE-BUG-"` — Expected PASS ทั้งหมด

### Task 4: ปรับ test เดิม + ตรวจจบ + ซิงก์ root

- [ ] **Step 1:** รัน E2E เต็มชุดบน Candidate (`--config playwright.config.js --project=chromium-desktop --workers=2`) — บันทึกเคสไม่ผ่าน
- [ ] **Step 2:** เคสที่ผูกกับพฤติกรรมเดิมของปุ่มแผนที่ (`navigateToSection('map-section')` / toast เดิม) หรือ layout ปุ่มรีเฟรชเดิม → ปรับเป็นพฤติกรรมใหม่ โดยคง assertion เรื่องสิทธิ์/ไม่ยิง mutation/จำนวน API call; บันทึกเหตุผลใน `output/ui-ux-preview/gemini-review/manage-view/test-rulings.md` (ต่อท้ายหัวข้อ "UI polish 2026-11-18"); เคสที่เป็นบั๊กจริงแก้โค้ด RED→GREEN
- [ ] **Step 3:** E2E เต็มชุดบน Candidate อีกรอบ — Expected ผ่านทั้งหมดยกเว้น real-api 1 skipped; Unit `node --test tests/unit/*.test.mjs` 176 pass; `node tools/static-qa.mjs` passed
- [ ] **Step 4:** สำรองไฟล์ root ที่ต่างไป `output/ui-ux-preview/promotion-backup-2026-11-17/root-before-ui-polish/` (cp -p) → คัดลอกจาก Candidate → `cmp` ทุกไฟล์ 0 mismatch; Unit/static QA บน root
- [ ] **Step 5:** ภาพหน้าจอ (fixture เท่านั้น) public/technician ที่ 1440 และ 390: header, หน้าจัดการ+แผนที่, toast → `output/ui-ux-preview/gemini-review/ui-polish/`; ให้เจ้าของงานรัน E2E เต็มชุดบน root เอง (ตามที่เจ้าของงานขอ)
