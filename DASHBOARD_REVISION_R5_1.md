# Dashboard Revision R5.1 — Public Candidate Specification

Status: USER-REQUIREMENT / TEST CANDIDATE
Base commit: `cac7b26aa15165aa8b6ed5cdbfdf046606102a79`
Date: 2026-08-28

## 1. Scope

Public Dashboard remains a one-page READ-ONLY dashboard. R5.1 changes only the public presentation/projection and QA contract. It does not edit Google Sheet data, Feature 3, Apps Script write flows, or future management workflow.

## 2. Public page order

1. Header
2. Section navigation
3. Global filters
4. Overview / KPI / Monitoring + Map
5. District analysis
6. Water quality / quantity
7. Water-system type
8. Watchlist
9. Footer

`Data Completeness / ข้อมูลประกอบ Dashboard / ความครบถ้วนของข้อมูล` is removed from the Public Dashboard entirely.

## 3. Temporary Public Suppression

Compute from the source payload on every successful load.

Rule A — hidden systems:
- hide every water system where latitude OR longitude is blank

Rule B — hidden villages:
- hide every village whose `has_village_waterworks` is true and which has no linked water system in the ORIGINAL source water-system set
- compute Rule B before Rule A

Do not:
- delete source rows
- mutate Google Sheet
- hardcode a row count of 244
- recalculate Rule B after coordinate suppression

Current audited snapshot baseline:
- source villages: 811
- source systems: 735
- hidden systems missing coordinate: 133
- hidden waterworks villages without original linked system: 111
- temporary issue rows suppressed: 244
- public villages: 700
- public systems: 602
- public watchlist unique union: 236
- NOT_WORKING: 39
- INSUFFICIENT: 116
- drinking-water FAIL: 200
- usable conservative Phayao map coordinates: 601

These numbers are regression evidence for the audited snapshot, not magic constants. If the live source changes, re-audit before changing code.

## 4. Public Data Quality Boundary

Public must not expose:
- completeness percentage cards
- missing-coordinate issue list
- missing-construction-year metric
- source-quality issue count
- data-quality modal
- fix/review/verify/publish controls

These belong to the future authenticated `Dashboard ช่าง / ระบบจัดการข้อมูลประปาหมู่บ้าน`.

Long-term target:
`Collection → Raw/Processor/Normalized → Management/Review/Governance → Public projection → Public GET API → Public Dashboard`

The temporary frontend projection is not a security boundary. Permanent publication control should happen before hidden/internal data reaches the browser.

## 5. Monitoring

Watchlist condition:
`NOT_WORKING OR INSUFFICIENT OR FAIL`

Total is a unique system union. Never add category counts.

Monitoring block must show:
- unique total in the same visual group as the three issue controls
- NOT_WORKING
- INSUFFICIENT
- drinking-water FAIL
- note: `1 ระบบอาจพบมากกว่า 1 ประเด็น จึงไม่สามารถนำตัวเลขย่อยมาบวกกันเป็นยอดรวมได้`

Quick filters keep existing centralized AppState/filter semantics, self-exclusion counts, toggle behavior, AND combination and synchronization with dropdown/chart/chips/clear-all.

## 6. Refresh semantics

Maintain two timestamps:
- `sourceGeneratedAt`: timestamp supplied by API
- `lastSuccessfulLoadAt`: browser timestamp after payload is fetched, parsed, validated and accepted

Requirements:
- in-flight guard prevents duplicate refresh
- refresh button exposes `aria-busy`
- failed refresh preserves previous AppState data
- failed refresh preserves previous successful-load timestamp
- initial load failure uses initial-load error message
- refresh failure explicitly tells the user that the previously loaded data remains displayed
- keep current 25-second API timeout until latency evidence justifies change

## 7. Typography and hierarchy

Font: Sarabun.

Must verify Thai lower/upper marks are not clipped, especially words such as `ข้อมูล`, `หมู่บ้าน`, `คุณภาพน้ำ`.

The application title `ระบบข้อมูลประปาหมู่บ้าน` must visually outrank section titles. Fix clipping through line-height/spacing/container behavior rather than shrinking text as the primary fix.

## 8. Charts

District chart remains grouped bar because both series are counts.

Accessibility improvement:
- stronger series contrast
- non-color cue through distinct point/legend shapes
- retain centralized chart cross-filter behavior
- no dual axis

## 9. Unified public scope

After a successful load, KPI, filters/search, charts, map, monitoring, watchlist and detail lookup must use the same projected public `AppState.data`.

A hidden system must not reappear through search, chart, watchlist, map or detail entry points.

## 10. Filter option availability

Dropdown options are contextual/faceted from the accepted Public Dataset after public projection.

Requirements:
- `ทั้งหมด` always exists.
- District comes from public villages.
- Local Authority is District-dependent and comes from public villages.
- System Type self-excludes its own dimension and honors current area + Status + Drinking Quality + Water Quantity.
- Operational Status self-excludes its own dimension and honors current area + System Type + Drinking Quality + Water Quantity.
- Drinking Quality self-excludes its own dimension and honors current area + System Type + Operational Status + Water Quantity.
- Water Quantity self-excludes its own dimension and honors current area + System Type + Operational Status + Drinking Quality.
- Hide a non-active alternative when it has zero records in that dropdown context.
- Preserve an already-active value in its own control when it still exists in the selected area but independent AND filters make the combined result zero.
- When District/Local Authority changes, clear only system-level active values that have no record anywhere in the new area.
- Free-text Search remains an independent AND filter and does not shrink dropdown option lists.
- Do not hard-code non-empty system/status/quality/quantity choices in HTML.
- Future collected/processed values appear automatically after successful refresh when they become available in the current context.
- `NO_DATA` / `UNKNOWN` appears only when at least one contextual record normalizes into that category.


## 11. QA gates before push

Local deterministic gates:
- `git diff --check`
- JavaScript syntax check
- `npm ci --no-audit --no-fund`
- `npm run build:css`
- `npm run qa:static`
- `npm run prepare:test:mock`
- `npm run test:unit`
- `npm run test:e2e -- --project=chromium-desktop`
- restore production `assets/js/config.js` after mock tests

Manual real-data pre-push gate through local server + Cloudflare Tunnel:
- source/API loads successfully
- public baseline is reconciled with current live source
- no Public Data Completeness UI
- monitoring counts and filters are correct
- refresh success/failure behavior is correct
- no hidden record leaks
- map and drawer remain functional
- no internal IDs/database enums leak
- responsive visual review at 1920x1080, 1440x900, 1366x768, 1024x768, 768x1024, 440x956, 390x844, 360x800
- no horizontal page overflow
- no Thai glyph clipping

Only after all local/manual gates pass: commit/push branch, run GitHub Actions, then Real API smoke. Do not call the candidate PASS/RC until those repository gates pass.
