# Village Water Supply Dashboard — PROJECT_RULES

> Source of Truth สำหรับโครงการ `dashboard ประปา`
>
> ก่อนแก้โค้ดทุกครั้ง ให้เปิดอ่านไฟล์นี้ก่อน
> ห้ามเปลี่ยนข้อที่ระบุว่า **LOCKED** เว้นแต่ผู้ใช้สั่งเปลี่ยนโดยตรง

---

## 1) เป้าหมายระบบ — LOCKED

Dashboard สำหรับแสดงและวิเคราะห์ข้อมูลประปาหมู่บ้าน จังหวัดพะเยา

ระบบเป็น **READ-ONLY DASHBOARD**

อนุญาต:
- ดูข้อมูล
- Filter
- วิเคราะห์
- ดูกราฟ
- ดูแผนที่
- ดูรายละเอียด
- Focus/Zoom ระบบบนแผนที่
- Scroll/Drill-down แบบอ่านอย่างเดียว

ห้าม:
- Add
- Edit
- Delete
- Save
- Verify/Approve ที่เขียนกลับข้อมูล
- POST / PUT / PATCH / DELETE จาก Frontend ไปฐานข้อมูล

---

## 2) Architecture หน้าเว็บ — LOCKED

เป็น **One-page Executive Dashboard**

ลำดับเนื้อหา:

1. Header
2. Section Navigation
3. Global Filter
4. Overview / KPI / Monitoring Summary + Map
5. วิเคราะห์รายพื้นที่
6. คุณภาพน้ำ / ปริมาณน้ำ
7. ประเภทระบบประปา
8. ระบบที่ต้องเฝ้าระวัง
9. ความครบถ้วนของข้อมูล
10. Footer

ไม่ทำ Multi-page SPA

---

## 3) UI Direction — LOCKED

แนวทาง:
- Modern Government BI
- Water Utility Dashboard
- Data-first
- Light-first
- Clean
- Low visual noise

อ้างอิงด้าน composition:
- KPI/summary อยู่ใกล้ Map
- Map ไม่ควรกินทั้ง viewport
- ไม่ต้องเหมือน reference dashboard ตรง ๆ

สี:
- Background: `#F8FAFC` / light slate
- Card: `#FFFFFF`
- Primary: Water Blue
- Green = ใช้การได้ / ปกติ
- Amber = เฝ้าระวัง / น้ำไม่เพียงพอ
- Red = ใช้การไม่ได้ / ปัญหา
- Rose = คุณภาพน้ำไม่ผ่าน
- Gray = ไม่มีข้อมูล

ห้าม:
- Gradient แบบตกแต่ง
- Glow / Neon
- Visual noise มากเกินไป

Radius:
- 8–12px โดยประมาณ

Shadow:
- เบามาก
- ใช้ border เป็นหลัก

---

## 4) Typography — LOCKED

Font หลัก:

`Sarabun`

โหลดจาก Google Fonts:

`https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap`

Weights:
- 400
- 600
- 700
- 800

ข้อความ UI สำหรับผู้ใช้ต้องเป็นภาษาไทยให้มากที่สุด

---

## 5) Frontend Stack — LOCKED

ใช้:
- HTML
- Tailwind CSS
- Vanilla JavaScript
- Font Awesome
- SweetAlert2
- Chart.js
- Leaflet

### Tailwind Rule

**Tailwind CSS ต้องเป็น framework หลักของ Layout/Responsive**

Tailwind รับผิดชอบ:
- Grid
- Flex
- Spacing
- Typography
- Responsive breakpoints
- Visibility
- Sizing
- Alignment
- Card layout
- UI states ที่เหมาะสม

`app.css` ใช้เฉพาะ:
- Leaflet overrides
- Chart.js edge cases
- scrollbar
- stacking/z-index edge cases
- library-specific styling
- CSS ที่ Tailwind ทำได้ไม่เหมาะ

### Production Tailwind

ห้ามใช้:

```html
<script src="https://cdn.tailwindcss.com"></script>
```

ใน Production Release

ต้อง build Tailwind เป็น static CSS เช่น:

```text
src/input.css
    ↓
Tailwind CLI
    ↓
assets/css/tailwind.css
```

หน้าเว็บโหลด:

```html
<link rel="stylesheet" href="assets/css/tailwind.css">
<link rel="stylesheet" href="assets/css/app.css">
```

---

## 6) Responsive Behavior — LOCKED

Responsive ไม่ใช่ Desktop ที่ถูกย่อ

### Desktop ≥ 1200px

- Header เต็ม
- Section nav
- Global filter เป็นแนวนอน
- Overview:
  - Summary/KPI/Alerts ทางซ้าย
  - Map ทางขวา
- Charts ใช้ grid ที่เหมาะสม
- Watchlist = Scrollable Table + Sticky Header

### Tablet 768–1199px

- Overview reflow
- KPI อยู่ด้านบน
- Alerts ตามลงมา
- Map เต็มความกว้าง
- Filter ต้องไม่แน่น
- Charts ลด column ตามพื้นที่จริง

### Mobile < 768px

ลำดับ:
1. Compact Header
2. Horizontal-scroll Section Navigation
3. Compact Filter button/panel
4. KPI 2 columns
5. Compact Monitoring rows/cards
6. Map
7. Charts
8. Watchlist Cards
9. Data completeness

ต้อง:
- ไม่มี horizontal page overflow
- Text อ่านได้จริง
- Tap target ไม่เล็กเกิน
- Drawer เป็น full-screen / near-full-screen
- Watchlist scroll ภายใน container
- Map ไม่สูงเกิน viewport

Viewport ที่ต้อง QA:
- 1920×1080
- 1440×900
- 1366×768
- 1024×768
- 768×1024
- 440×956
- 390×844
- 360×800

---

## 7) Sticky / Z-index / Anchor Rules — LOCKED

ปัญหาที่เคยเกิด:
- Leaflet Map ลอยทับ Header
- Map ทับ Navigation
- Map ทับ Filter
- Section anchor ถูก sticky header บัง

ดังนั้น:

- Leaflet ต้องถูกกักใน stacking context ของ Map Card
- Map pane/control ห้ามลอยออกนอก Card
- Header/Nav/Filter z-index ต้องชัดเจน
- Sticky offset ต้องสัมพันธ์กัน
- ทุก section anchor ต้อง scroll ไปตำแหน่งที่หัวข้อยังมองเห็น
- กด `#map-section`, `#system-structure` ฯลฯ ต้องไปถูก section

ห้ามถือว่า Responsive ผ่านจนกว่าจะทดสอบ anchor/scroll จริง

---

## 8) Google Sheets Data Model — LOCKED

Spreadsheet ID:

`1zVvlmM2xZx5wfOVX8iIT2yYCHPXVf2K0ZZFOqS8E8zE`

Sheets:

1. `mainplumbing`
   - Raw/reference
   - Dashboard ไม่ query โดยตรง

2. `villages`
   - 1 row = 1 village
   - PK: `village_id`

3. `water_systems`
   - 1 row = 1 water system
   - PK: `system_id`
   - FK: `village_id`

4. `village_water_sources`
   - long format
   - 1 row = village × source type
   - PK: `source_id`
   - FK: `village_id`

Relationships:

```text
villages 1:N water_systems
villages 1:N village_water_sources
```

---

## 9) Known Data Scale

โดยประมาณ:

- Villages: 808
- Water systems: 733
- Village water source rows: 5,656
- Villages with waterworks: 647
- Villages without waterworks: 161

Map usable coordinates:
- 599 / 733 โดยประมาณ

---

## 10) Data Codes vs UI Labels — LOCKED

Database ใช้ Code ภาษาอังกฤษได้

UI ห้ามโชว์ Code โดยตรง

ตัวอย่าง:

| Code | UI |
|---|---|
| `GROUNDWATER_SMALL` | ประปาบาดาลขนาดเล็ก |
| `GROUNDWATER_MEDIUM` | ประปาบาดาลขนาดกลาง |
| `GROUNDWATER_LARGE` | ประปาบาดาลขนาดใหญ่ |
| `SURFACE_SMALL` | ประปาผิวดินขนาดเล็ก |
| `SURFACE_MEDIUM` | ประปาผิวดินขนาดกลาง |
| `SURFACE_LARGE` | ประปาผิวดินขนาดใหญ่ |
| `SURFACE_VERY_LARGE` | ประปาผิวดินขนาดใหญ่มาก |
| `UNKNOWN` | ไม่ระบุประเภท |
| `WORKING` | ใช้การได้ |
| `NOT_WORKING` | ใช้การไม่ได้ |
| `PASS` | ผ่านเกณฑ์ |
| `FAIL` | ไม่ผ่านเกณฑ์ |
| `SUFFICIENT` | เพียงพอ |
| `INSUFFICIENT` | ไม่เพียงพอ |
| `NO_DATA` | ไม่มีข้อมูล |

Presentation mapping ต้องใช้ใน:
- Filter
- Chart
- Map Popup
- Watchlist
- Drawer
- Summary
- Tooltip

### Presentation Layer Discipline — LOCKED

ค่าที่เป็น enum/code ต้องผ่าน mapper กลางใน `assets/js/labels.js` ก่อน render เสมอ
ห้ามแปลแบบกระจายตาม component ถ้ามี mapper กลางอยู่แล้ว

Internal IDs เช่น:
- `PY-W-000609`
- `PY-V-0001`
- `PY-S-...`

เป็น technical identifiers สำหรับ relation/lookup ภายในระบบเท่านั้น
**ห้ามแสดงเป็นข้อความ user-facing** ใน:
- Watchlist
- Mobile Card
- Map Popup
- Drawer title/content
- Data completeness modal
- aria-label / accessible name
- fallback เมื่อ `system_name` หรือ `village_name` ว่าง

อนุญาตให้ใช้ ID ใน:
- JavaScript lookup
- Map marker index
- `data-*` attribute ที่ผู้ใช้ไม่เห็น
- foreign-key relation

เมื่อชื่อระบบว่าง ให้ใช้ชื่อสำหรับผู้ใช้ เช่น `ระบบประปาหมู่บ้าน` หรือ `ระบบประปา <ชื่อหมู่บ้าน>` ห้าม fallback เป็น `system_id`

QA ต้องตรวจทั้ง:
1. known enum mappings ทุก domain
2. generic token รูปแบบ `ALL_CAPS_WITH_UNDERSCORE`
3. internal ID pattern `PY-...-digits`
4. visible text และ accessible names หลังเปิด Drawer / Popup / Modal

---

## 11) Global Filters — LOCKED

Filters:

- อำเภอ
- อปท.
- ประเภทระบบ
- สถานะระบบ
- คุณภาพน้ำดื่ม

Cascading:
- District → Local Authority

ทุก Filter ต้องกระทบพร้อมกัน:
- KPI
- Monitoring summary
- Map
- Charts
- Watchlist

`ล้างตัวกรอง` ต้องกลับข้อมูลจังหวัดทั้งหมด

---

## 12) Map Rules — LOCKED

Library:
- Leaflet

Default basemap:
- Satellite / Esri World Imagery

Home:
- บริเวณกว๊านพะเยา

Home center:
- `[19.171194, 99.874972]`

### Coordinate Validation

ห้ามใช้:

```js
Number(value)
```

กับ blank โดยไม่ตรวจ blank ก่อน เพราะ:

```js
Number('') === 0
```

พิกัดว่างห้ามกลายเป็น `0,0`

ระบบต้อง:
- ไม่ plot blank coordinates
- ไม่ plot invalid coordinates
- ไม่ plot coordinates outside conservative Phayao bounds

พิกัดผิดยังตรวจ backend/frontend logic ได้
แต่ **ไม่ต้องแสดงหัวข้อ “พิกัดอยู่นอกขอบเขตพะเยา” ใน UI**

Known outlier:
- `PY-W-000591`
- `9.218651, 99.832377`

ห้าม auto-correct

### Marker

Semantic:
- Red = NOT_WORKING
- Amber = INSUFFICIENT
- Rose = FAIL
- Green = WORKING
- Gray = unknown/no data

บน Satellite:
- Marker ต้องมี stroke/halo ให้มองเห็น

### Map UX

ต้องมี:
- Home
- Fit visible points
- Popup
- Focus system from Watchlist
- Layer switcher ได้ถ้าจำเป็น

Map ห้ามใหญ่จนกลืน Dashboard

---

## 13) Monitoring / Watchlist — LOCKED

ชื่อ section:

`ระบบที่ต้องเฝ้าระวัง`
หรือ
`ระบบที่ควรติดตามสถานการณ์`

เงื่อนไข:

```js
operational_status === 'NOT_WORKING'
OR water_quantity === 'INSUFFICIENT'
OR drinking_water_quality === 'FAIL'
```

ห้ามจำกัดแค่ 20 รายการแรก

ถ้าพบ 283 ระบบ:
- ต้องเข้าถึงครบ 283 ระบบ

Desktop:
- Table
- Scroll ภายใน container
- Sticky table header

Mobile:
- Cards
- Scroll ภายใน container

แต่ละรายการ:
- ดูแผนที่
- ดูรายละเอียด

ไม่มี workflow:
- assign
- resolve
- verify
- edit

---

## 14) Data Completeness — LOCKED

ชื่อ:

`ความครบถ้วนของข้อมูล`

เป็น section รอง
ไม่ให้แย่งความสำคัญจากข้อมูลประปา

แสดงได้:
- พิกัดใช้งานได้
- กำลังผลิต
- ปีที่ก่อสร้าง
- ผลคุณภาพน้ำดื่ม

อาจมี read-only detail

ไม่แสดง:
- `พิกัดอยู่นอกขอบเขตพะเยา`

ไม่ทำ:
- Edit
- Fix
- Verify
- Status workflow

---

## 15) Charts — LOCKED

Chart.js

กราฟหลัก:
- สถานการณ์รายอำเภอ
- คุณภาพน้ำดื่ม
- ความเพียงพอของน้ำ
- ประเภทระบบประปา

กฎ:
- Labels ภาษาไทย
- ไม่มี database code หลุด
- ไม่มี NaN / Infinity
- Responsive
- Doughnut ห้ามใหญ่เกิน Card
- Destroy instance ก่อน re-render
- Filter ต้องกระทบข้อมูล chart

---

## 16) Detail Drawer — LOCKED

Read-only

ต้อง:
- เปิดจาก Watchlist
- ปิดด้วย X
- ปิดด้วย Escape
- คลิก backdrop ปิดได้
- Mobile full-screen
- Scroll content ได้
- ข้อมูลเป็นภาษาไทย
- Focus handling เหมาะสม

ห้าม:
- Add
- Edit
- Delete
- Save

---

## 17) API / Config Rule — LOCKED

Frontend อ่านข้อมูลจาก Google Apps Script Web App

`config.js` ของเครื่องจริงมี API URL `/exec`

### Critical rule

Patch/Release ที่ส่งให้ผู้ใช้ **ห้ามทับ `config.js` จริงโดยไม่จำเป็น**

ถ้าต้องมี test config:
- ใช้เฉพาะใน QA environment
- อย่า package ทับ production config โดยไม่แจ้ง

---

## 18) Error / Empty / Loading States

ต้องมี state สำหรับ:

- Loading
- API error
- Network error
- Malformed JSON
- No filtered data
- No map points
- Empty watchlist
- Empty chart dataset

ห้าม:
- Loading ค้าง
- Blank white section
- NaN
- uncaught exception

---

## 19) QA Workflow — LOCKED

ก่อนส่งงานทุกครั้ง:

### Step 1 — Read this file

อ่าน `PROJECT_RULES.md`

### Step 2 — Static QA

ตรวจ:
- JavaScript syntax
- module import
- duplicate IDs
- missing files
- production assets
- read-only methods
- database code leakage

### Step 3 — Build Candidate

Candidate ที่ทดสอบ
=
Candidate ที่จะ ZIP ส่ง

ห้ามมี test copy กับ release copy คนละชุด

### Step 4 — Playwright Functional QA

ทดสอบ:
- Initial load
- Filter
- Cascading district → local authority
- Clear filters
- KPI
- Charts
- Map
- Map focus
- Watchlist
- Drawer
- Error state
- Empty state

### Step 5 — Responsive/Layout QA

ตรวจทุก viewport ที่กำหนด

ต้องตรวจ:
- element overlap
- clipping
- horizontal overflow
- sticky collision
- z-index
- anchor positioning
- scroll behavior
- map dimensions
- table/card reflow
- drawer/modal viewport fit

### Step 6 — Visual Screenshot QA

ต้องถ่าย screenshot แล้ว **เปิดดูจริง**

ห้ามถือว่า test ผ่านเพราะ automated assertion ผ่านอย่างเดียว

ตรวจ:
- hierarchy
- spacing
- readability
- map dominance
- text size
- card density
- alignment
- navigation usability
- mobile reflow

### Step 7 — Regression

ถ้าแก้ bug หลัง QA:
- รัน QA ใหม่
- ห้ามแก้แล้ว ZIP ทันที

### Step 8 — Package

ZIP เฉพาะ Candidate ที่ผ่าน QA

พร้อม:
- QA report
- screenshots
- checksum ถ้าจำเป็น

---

## 20) Definition of Done — LOCKED

Release ห้ามเรียกว่า “ผ่าน” ถ้ายังมีข้อใดข้อหนึ่ง:

- Map ซ้อน Header/Nav/Filter
- Responsive เป็น Desktop shrink
- Horizontal overflow
- Anchor ไปผิด section
- Text เล็กจนอ่านไม่ได้
- Chart label ซ้อน
- Watchlist ดูไม่ครบ
- Code ภาษาอังกฤษหลุด UI
- Console มี uncaught JS error
- API error แล้วหน้าเสีย
- Read-only ถูกละเมิด
- Tailwind Play CDN warning ใน production

Release Candidate ถือว่าพร้อมเมื่อ:

```text
Data correct
+ Functional correct
+ UI hierarchy correct
+ Responsive behavior correct
+ No overlap/clipping
+ Read-only
+ Production Tailwind
+ Playwright QA
+ Visual screenshot review
```

---

## 21) Change Discipline

ก่อนเปลี่ยน architecture:
- ตรวจว่าขัดกับ LOCKED requirement หรือไม่

ก่อนเพิ่ม library:
- ต้องมีเหตุผล

ก่อนเพิ่ม custom CSS:
- ถามก่อนว่า Tailwind ทำได้หรือไม่

ก่อนเพิ่ม feature:
- ตรวจว่าเป็น Dashboard read-only หรือกำลังกลายเป็น workflow app

ก่อนส่ง:
- อ่านไฟล์นี้อีกครั้ง

---

## 22) Current Priority

ลำดับงานปัจจุบัน:

1. Production Tailwind build
2. Desktop stacking / Map overlap bug
3. Sticky offsets / anchor behavior
4. Responsive architecture Desktop / Tablet / Mobile
5. Visual UX polish
6. Playwright QA ใหม่ทั้งหมด
7. Release Candidate ใหม่

ห้ามรื้อ:
- Database
- Google Apps Script API
- Business logic ที่ถูกต้องอยู่แล้ว

เว้นแต่ QA พบ regression จริง

---

Last updated: 2026-08-19 (RC3 presentation-layer hardening)
