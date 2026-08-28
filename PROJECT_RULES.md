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
9. Footer

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

Filters / filter dimensions:

- ค้นหาทั้ง Dashboard
- อำเภอ
- อปท.
- ประเภทระบบ
- สถานะระบบ
- คุณภาพน้ำดื่ม
- ความเพียงพอของน้ำ

Cascading:
- District → Local Authority

### Global Search

Search ต้องค้นจากข้อมูลที่ผู้ใช้รู้จัก เช่น:
- ชื่อระบบประปา
- ชื่อหมู่บ้าน
- อำเภอ / ตำบล / อปท.
- หน่วยงานผู้รับผิดชอบ / หน่วยงานที่เกี่ยวข้อง
- label ภาษาไทยของประเภทระบบ สถานะ คุณภาพน้ำ และความเพียงพอของน้ำ

ห้ามใช้ generated internal ID เช่น `PY-W-...` / `PY-V-...` เป็น searchable user-facing concept

Search ต้องทำงานร่วมกับ filter อื่นแบบ AND

### Unified filter behavior

ทุก Filter ต้องกระทบพร้อมกัน:
- KPI
- Monitoring summary
- Map
- Charts
- Watchlist

การเปลี่ยนอำเภอต้องล้าง Local Authority ซึ่งเป็น dependent filter
System Type / Status / Drinking Quality / Water Quantity / Search ต้องคงอยู่ตามปกติ
ยกเว้น system-level filter ที่ไม่มี record อยู่เลยใน area ใหม่ (District/Local Authority ใหม่) ให้ล้างเฉพาะค่าที่กลายเป็น context-invalid เพื่อไม่ให้เกิด hidden/stale filter
Search ไม่ถูกล้างอัตโนมัติ

ตัวกรองจาก Chart ต้องใช้ state กลางชุดเดียวกับ dropdown/search
ห้ามมี filter logic แยกเฉพาะ DOM ของ Chart

Active filter chips:
- แสดง filter ที่กำลังใช้งานเป็นภาษาไทย
- กด × ล้างเฉพาะมิตินั้น
- internal code/ID ห้ามหลุดใน chip หรือ aria-label

`ล้างตัวกรอง` ต้องล้าง Search + dropdown + chart cross-filter ทั้งหมดและกลับข้อมูลจังหวัดทั้งหมด


### Filter Option Availability — LOCKED

Dropdown ต้องเป็น **contextual / faceted availability** จาก accepted Public Dataset หลัง Public projection

กฎ:
- `ทั้งหมด` ต้องมีเสมอ
- ห้าม hard-code non-empty System Type / Operational Status / Drinking Quality / Water Quantity options ใน HTML
- District แสดงเฉพาะ District ที่มี public village อยู่จริง
- Local Authority แสดงเฉพาะ Local Authority ที่มี public village อยู่จริงภายใต้ District ที่เลือก
- System Type คำนวณจาก current area + Status + Drinking Quality + Water Quantity โดย self-exclude System Type
- Operational Status คำนวณจาก current area + System Type + Drinking Quality + Water Quantity โดย self-exclude Operational Status
- Drinking Quality คำนวณจาก current area + System Type + Operational Status + Water Quantity โดย self-exclude Drinking Quality
- Water Quantity คำนวณจาก current area + System Type + Operational Status + Drinking Quality โดย self-exclude Water Quantity
- ค่าที่มี 0 record ภายใต้ context ของ dropdown นั้น ห้ามเสนอเป็นตัวเลือกใหม่
- active value ของมิตินั้นต้องยัง representable ได้ถ้าค่าเองยังมีอยู่ใน selected area แต่ combination กับ independent filters อื่นเป็น 0 เพื่อรักษา AND semantics และป้องกัน hidden filter
- เมื่อเปลี่ยน District / Local Authority แล้ว active system-level value ไม่มี record อยู่เลยใน area ใหม่ ให้ clear เฉพาะค่าที่ context-invalid
- Free-text Search เป็น independent AND filter และไม่ใช้เพื่อลด dropdown option list
- `NO_DATA` / `UNKNOWN` แสดงได้เมื่อมี record ที่ normalize เข้าหมวดนั้นจริงใน context
- ถ้าในอนาคต successful load/refresh เพิ่มข้อมูลที่ทำให้ค่าใหม่มี record ใน context ปัจจุบัน ค่าใหม่ต้องปรากฏอัตโนมัติ

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

## 14) Public Data Quality Boundary — LOCKED

Public Dashboard **ไม่แสดง Data Completeness / Data Quality inspection UI**

ห้ามแสดงใน Public Dashboard:
- เมนู `ความครบถ้วน`
- section `ข้อมูลประกอบ Dashboard`
- section `ความครบถ้วนของข้อมูล`
- metric ความครบถ้วนของพิกัด / กำลังผลิต / ปีที่ก่อสร้าง / ผลคุณภาพน้ำ
- source-quality issue count
- modal ตรวจรายการข้อมูลไม่ครบ
- action สำหรับแก้/ตรวจ/รับรองข้อมูล

เหตุผลเชิงสถาปัตยกรรม:
- Public Dashboard มีหน้าที่สื่อสถานการณ์ประปาที่เผยแพร่แล้ว
- Data completeness เป็นงานตรวจคุณภาพข้อมูลและ data governance
- ความสามารถดังกล่าวย้ายไป `Dashboard ช่าง / ระบบจัดการข้อมูลประปาหมู่บ้าน` ในอนาคต
- Public Dashboard ยังเป็น READ-ONLY เหมือนเดิม

Temporary R5.1 public suppression:
- ซ่อน system ที่ latitude หรือ longitude ว่าง
- ซ่อน village ที่ `has_village_waterworks` เป็นจริง แต่ไม่มี linked system ใน **source system set เดิมก่อน coordinate suppression**
- ห้ามลบข้อมูลจาก Google Sheet
- ห้าม hardcode ว่า “เอา 244 แถวแรกออก”; ต้องคำนวณจากสอง rule ข้างต้น
- current audited baseline คือ 133 system + 111 village = 244 issue rows
- rule นี้เป็น temporary public projection ไม่ใช่ publication governance ถาวร

Long-term:
- Data quality / review / publish / hide / fix เป็นหน้าที่ Management Dashboard แยกต่างหาก
- เมื่อมี backend publication governance แล้ว Public API ควรส่งเฉพาะข้อมูลที่เผยแพร่ได้ และ frontend temporary suppression ต้องถูกทบทวน/ถอดเพื่อป้องกัน double filtering

---

## 15) Charts — LOCKED

Chart.js

กราฟหลัก:
- สถานการณ์รายอำเภอ
- คุณภาพน้ำดื่ม
- ความเพียงพอของน้ำ
- ประเภทระบบประปา

ชื่อ section คุณภาพ/ปริมาณ:
- `คุณภาพน้ำและปริมาณน้ำโดยรวม`

กฎพื้นฐาน:
- Labels ภาษาไทย
- ไม่มี database code หลุด
- ไม่มี NaN / Infinity
- Responsive
- Doughnut ห้ามใหญ่เกิน Card
- Destroy instance ก่อน re-render
- Filter ต้องกระทบข้อมูล chart

### Chart Cross-filter

Chart ที่ต้อง interactive:
- District bar → filter `district`
- System Type bar → filter `systemType`
- Drinking Quality doughnut → filter `drinkingWaterQuality`
- Water Quantity doughnut → filter `waterQuantity`

Behavior:
- คลิก bar/segment → กรอง Dashboard ทั้งหน้า
- คลิกค่าที่เลือกอยู่ซ้ำ → ยกเลิกเฉพาะ filter มิตินั้น
- filter อิสระมิติอื่นต้องคงอยู่
- District เปลี่ยนแล้วล้างเฉพาะ Local Authority
- selected chart element ต้องมี visual selected state ที่อ่านออก

Chart distribution ต้องใช้ self-exclusion ของมิติตัวเอง:
- Chart ต้องยังเห็นค่าทางเลือกอื่นของมิตินั้นหลังเลือก filter
- แต่ยังต้องเคารพ filter อื่นทั้งหมด
- ตัวอย่าง: เมื่อเลือก `คุณภาพน้ำดื่ม: ผ่านเกณฑ์` กราฟคุณภาพน้ำยังคำนวณ PASS/FAIL/NO_DATA ภายใต้ filter อื่น เพื่อให้สลับค่าได้โดยไม่ต้องล้างทั้งหมดก่อน

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

1. Global Filter non-sticky + anchor recalibration
2. Map toolbar: ตำแหน่งฉัน + ดูทุกจุด (เอาปุ่มกว๊านพะเยาออก)
3. R5.1 Temporary Public Suppression + Public Data Quality boundary
4. Typography / hierarchy / Monitoring grouping / Refresh semantics
5. Floating Back-to-top
6. Playwright functional/regression QA
7. Responsive + visual screenshot QA ทุก breakpoint
8. GitHub Actions + Real API smoke
9. Release Candidate ใหม่

ห้ามรื้อ:
- Database
- Google Apps Script API
- Business logic ที่ถูกต้องอยู่แล้ว

เว้นแต่ QA พบ regression จริง

---

## 23) Map Popup Actions — LOCKED

Map Popup เป็นข้อมูลสรุป ไม่ใช่ Detail View เต็มรูปแบบ

ต้องมี action เมื่อระบบมีพิกัดใช้งานได้:
- `รายละเอียด` → เปิด Detail Drawer ตัวเดียวกับ Watchlist
- `นำทาง` → เปิด navigation flow

กฎ:
- Watchlist และ Map Popup ต้องใช้ shared detail renderer เดียวกัน
- ห้าม copy markup ของ Drawer แยกหลาย component
- Shared renderer อยู่ใน `assets/js/system-detail.js`
- ปุ่มนำทางห้ามสร้าง URL จาก blank/invalid coordinate
- internal ID ห้ามแสดงใน popup หรือ accessible name

Desktop navigation:
- กด `นำทาง` แล้วเปิด Google Maps Directions ใน tab ใหม่
- destination ต้องเป็น latitude/longitude ของระบบนั้น

Mobile navigation:
- กด `นำทาง` แล้วแสดงตัวเลือก navigation ก่อน
- ต้องมี Google Maps
- ต้องมีตัวเลือกแอปแผนที่ของระบบ/แพลตฟอร์มเมื่อรองรับ
- ต้องมี Google Maps บนเว็บเป็น fallback
- ห้ามอ้างว่า browser สามารถตรวจ installed navigation apps ได้ครบทุกแอป

---

## 24) Document Reference / Preview — LOCKED

ถ้าระบบมี `transfer_document_url` หรือ document URL ที่ปลอดภัย:
- แสดง `เอกสารอ้างอิง` ใกล้ด้านบนของ Detail Drawer หลัง title/status
- ไม่มีเอกสาร → ไม่ render document card
- CTA ใช้ข้อความ `ดูเอกสาร`
- เปิดใน tab ใหม่
- ไม่มี `download` attribute
- ทุก URL ต้องผ่าน HTTP/HTTPS allowlist validation

หลักการคือ **Preview-first ไม่ใช่ Download-first**

ข้อมูลปัจจุบันมี public PDF จาก `info.dla.go.th` ซึ่ง server ต้นทางอาจบังคับ download
Frontend จึง normalize public PDF ไปยัง browser-based document viewer สำหรับ preview ก่อน
และต้องมี regression test สำหรับ URL normalization

Google Drive / Google Docs URLs:
- normalize ไป `/preview` เมื่อทำได้

ห้าม:
- execute javascript/data URI
- auto download เมื่อเปิด Drawer
- embed URL ที่ไม่ผ่าน validation

---

## 25) GitHub Actions / CI — LOCKED

Production Candidate ต้องผ่าน GitHub Actions เพิ่มจาก local/sandbox QA

CI หลักต้อง:
1. Checkout repository
2. Setup Node LTS
3. Install dependencies แบบ reproducible (`npm ci` เมื่อมี lockfile)
4. Build Tailwind production CSS
5. Run unit/static tests
6. Install Chromium + system dependencies
7. Start local HTTP server ผ่าน Playwright `webServer`
8. Run Playwright E2E
9. Upload Playwright report / screenshots / traces เมื่อ fail หรือเพื่อ review

Playwright CI ต้องใช้ Chromium จริงบน GitHub-hosted runner และ workers=1 เพื่อความเสถียร

ต้องมี test สำหรับ:
- Initial load
- Console/page errors
- Search + Filter + cascading + reset
- Chart cross-filter + toggle + active chips
- Responsive ทุก viewport ที่ล็อกไว้
- Map/Leaflet stacking
- Popup รายละเอียด
- Popup navigation
- Mobile navigation chooser
- Watchlist scroll / all rows reachable
- Drawer
- Document preview card
- Temporary Public Suppression ไม่รั่วผ่าน Search / KPI / Map / Charts / Watchlist / Detail
- Public Dashboard ไม่มี Data Completeness UI
- Refresh failure ต้องคงข้อมูลเดิมและ successful-load timestamp
- Presentation code/internal-ID leakage
- Anchors / sticky offsets / horizontal overflow
- Error / empty states
- Read-only HTTP method gate

Visual evidence สำหรับ responsive/interaction สำคัญต้อง upload แม้ automated assertions ผ่าน เพื่อให้ตรวจ screenshot จริงก่อน release

ถ้า GitHub Actions fail:
- ห้ามเรียก Candidate ว่า QA ผ่าน
- แก้แล้วต้องรัน regression ใหม่

---

## 26) Real API Smoke Test — LOCKED

Google Apps Script URL จริงต้องเก็บใน GitHub Actions Secret:

`APPS_SCRIPT_API_URL`

ห้าม commit URL จริงลง repository config สำหรับ CI

Real API smoke workflow ต้อง:
- ใช้ `GET` เท่านั้น
- ไม่แก้ข้อมูล
- ตรวจ HTTP success
- ตรวจ JSON schema: `villages`, `waterSystems`, `waterSources` ต้องเป็น arrays
- ตรวจ `success !== false`
- ไม่ print secret URL ลง logs
- แยกจาก deterministic mock-data regression เพื่อไม่ให้ external service ทำ CI หลัก flaky โดยไม่จำเป็น

---

## 27) Unified Cross-filter Interaction — LOCKED

ทุกช่องทางที่เปลี่ยน scope ของ Dashboard ต้องใช้ `AppState.filters` และ filter engine กลางชุดเดียวกัน:
- Search
- Dropdown filters
- Chart click
- Active filter chips
- Clear all

ห้ามให้ Chart กรอง DOM แยกจาก filter engine
ห้ามมี Map / KPI / Charts / Watchlist คนละ filter state

Filter combination ใช้ AND semantics ระหว่างมิติ

การ clear มี 3 ระดับ:
- คลิก selected bar/segment ซ้ำ → clear เฉพาะมิตินั้น
- กด × บน active chip → clear เฉพาะมิตินั้น
- `ล้างตัวกรอง` → clear ทุกมิติและ Search

---


---

## 29) Deployment Path Safety — LOCKED

Dashboard ต้องทำงานได้ทั้งเมื่อ deploy ที่ domain root และเมื่ออยู่ใต้ subdirectory เช่น `/Village_Watersupply/`

สำหรับ static/test assets ที่อ้างจาก ES module:
- ห้ามใช้ relative `fetch('../../...')` โดยสมมติว่า application อยู่ที่ web root เพราะ browser จะ resolve เทียบกับ `document.baseURI`
- URL ของ asset ที่เป็นเจ้าของโดย module ต้อง resolve จาก `import.meta.url` หรือ application base URL ที่กำหนดชัดเจน
- Mock-data regression ต้องมี test สำหรับ root deployment และ subdirectory deployment
- ห้ามแก้ production `config.js` เพื่อกลบปัญหา path resolution

---

---

## 30) Map User Location — LOCKED

Map toolbar ต้องมี:
- `ตำแหน่งฉัน`
- `ดูทุกจุด`

ปุ่ม `กว๊านพะเยา` ไม่แสดงใน Map toolbar แล้ว แต่ Home view ภายในยังใช้เป็น default/fallback ได้

`ตำแหน่งฉัน`:
- ขอ browser geolocation เฉพาะเมื่อผู้ใช้กด
- แสดง marker ที่แตกต่างจาก marker ระบบประปา
- zoom ไปตำแหน่งผู้ใช้
- ไม่บันทึกพิกัดผู้ใช้ลง Google Sheet / Apps Script / storage
- ไม่ส่งพิกัดผู้ใช้ไป backend
- แยกข้อความ error สำหรับ permission denied / unavailable / timeout / insecure context
- ต้องรองรับ secure-context requirement ของ browser (HTTPS หรือ localhost)

---

## 31) Sticky / Back-to-top Interaction — LOCKED

Sticky UI:
- Sticky เฉพาะ Header + Section Navigation
- Global Filter ต้องอยู่ใน normal document flow และห้าม sticky/fixed
- Anchor offset คำนวณจาก Header stack เท่านั้น

Floating Back-to-top:
- ซ่อนเมื่ออยู่ใกล้ด้านบน
- แสดงเมื่อเลื่อนลงเกิน threshold ที่เหมาะสม
- อยู่มุมขวาล่างและรองรับ mobile safe area
- กดแล้วกลับด้านบน
- เคารพ `prefers-reduced-motion`
- ต้องอยู่ต่ำกว่า Drawer / SweetAlert layer
- ต้องหลบ Leaflet bottom-right controls ถ้าพื้นที่ชนกัน

---


---


## 34) Monitoring Summary Quick Filters — LOCKED

การ์ด `สถานการณ์เฝ้าระวัง / ประเด็นสำคัญ` ทั้ง 3 รายการเป็น Quick Filter ของ Global Filter เดิม:
- `ใช้การไม่ได้` → `operationalStatus = NOT_WORKING`
- `น้ำไม่เพียงพอ` → `waterQuantity = INSUFFICIENT`
- `น้ำดื่มไม่ผ่านเกณฑ์` → `drinkingWaterQuality = FAIL`

Interaction:
- ต้องใช้ `AppState.filters` + filter engine กลางชุดเดียวกับ Search / Dropdown / Chart / Chip
- กดการ์ด → ตั้งค่ามิตินั้นและ render ทั้ง Dashboard
- กดการ์ดเดิมซ้ำ → clear เฉพาะมิตินั้น
- Quick Filter คนละมิติใช้ AND semantics
- District / Local Authority / System Type / Search และ filter อิสระอื่นต้องไม่ถูกล้างเมื่อกด Quick Filter
- Dropdown / Chart / Active chip / Clear all ต้อง synchronize `aria-pressed` ของการ์ดกลับมาด้วย
- ห้ามสร้าง state/filter engine แยกเฉพาะ Monitoring Summary

Count semantics:
- การ์ดแต่ละใบต้อง self-exclude เฉพาะ filter dimension ของตัวเองขณะคำนวณจำนวน เช่นเดียวกับ cross-filter chart
- ต้องยัง honor filter อื่นทั้งหมด
- จำนวนบนการ์ดจึงสื่อจำนวนผลลัพธ์ที่ผู้ใช้จะได้เมื่อเลือกการ์ดนั้น และไม่ collapse เป็น 0 เพียงเพราะ dropdown มิติเดียวกันกำลังเลือกค่าคนละค่า

Accessibility / UI:
- ใช้ native `<button type="button">`
- ใช้ `aria-pressed="true|false"` เป็น toggle state
- Mouse / touch / Enter / Space ต้องทำงาน
- Focus-visible ต้องชัดเจนและ focus ต้องไม่หายจากการ render
- Selected state ใช้สี semantic เดิมของแต่ละประเด็น
- ห้ามแสดง database enum/internal ID ใน visible text, title หรือ accessible name
- Mobile ต้องไม่มี horizontal overflow และ tap target ต้องคงขนาดอ่าน/กดได้จริง

QA ต้องตรวจอย่างน้อย:
- toggle on/off ของทั้ง 3 มิติ
- AND semantics เมื่อเลือกหลายใบ
- preservation ของ filter อิสระ
- synchronization สองทางกับ Dropdown / Chart / Chip / Clear all
- faceted count self-exclusion
- KPI / Map / Charts / Watchlist ใช้ public scope เดียวกัน
- keyboard accessibility
- selected layout ที่ desktop + 390px + 360px


Last updated: 2026-08-28 (R5.1 temporary public suppression, remove Public Data Completeness, refresh semantics, hierarchy/accessibility)
