# Changelog

## Unreleased — 2026-08-19

### QA — Playwright release-gate stabilization
- E2E dashboard readiness now waits for the initial SweetAlert loading overlay to finish closing before scroll/hash assertions.
- Direct-hash assertions now wait for the target section to reach a safe visible position instead of treating the hash string alone as completion.
- SweetAlert Data Completeness geometry assertions wait for the popup opening animation to finish before measuring final layout.
- Geolocation permission-denial coverage scopes Thai guidance to the active SweetAlert popup, avoiding a strict-locator collision with the container.

### Changed — Data Completeness modal layout
- Reworked the Data Completeness detail modal into a fixed header / scrollable content / fixed footer structure.
- Added a top-right `×` close action while retaining the bottom `ปิด` action.
- Desktop issue rows now use compact `ระบบ / พื้นที่`, `ประเด็น`, and `การทำงาน` columns.
- Mobile issue rows keep compact actions beside the record instead of placing a full-width Detail button on a separate row.
- Mobile modal width now uses nearly the full viewport while preventing horizontal overflow.
- Progressive-reveal footer is omitted entirely when a section has 20 or fewer rows; sections above 20 retain `แสดง X จาก Y รายการ` + `แสดงเพิ่มเติม`.

### Accessibility / QA — Data Completeness modal
- Added explicit list/section semantics and accessible close/action labels without exposing internal IDs.
- Added Playwright coverage for fixed modal chrome, compact desktop columns, 390px mobile density, 360px action accessibility, and overflow boundaries.

### Added
- Map toolbar action `ตำแหน่งฉัน` using browser Geolocation API only on explicit user action.
- Distinct user-location marker and privacy notice; user coordinates are not persisted or sent to the data backend.
- Floating `กลับด้านบน` control with reduced-motion handling and Leaflet-control collision avoidance.
- Unit and browser regression coverage for user-location success/error handling and back-to-top behavior.

### Changed
- Removed the visible `กว๊านพะเยา` button from the Map toolbar; the internal home view remains a default/fallback map state.
- Global Filter is no longer sticky; sticky UI is limited to Header + Section Navigation.
- Data Completeness `แผนที่` closes the modal, scrolls to the Map, focuses the system marker, and opens its popup.
- Data Completeness `รายละเอียด` automatically restores the previous modal context after the shared Drawer closes, including progressive-reveal counts and scroll position.
- System map focus no longer depends on a fixed timeout before opening the marker popup.

### Accessibility / Safety
- Geolocation errors are explained in Thai for denied permission, unavailable position, timeout, unsupported browser, and insecure context.
- Back-to-top honors `prefers-reduced-motion` and transfers focus to the page header before scrolling.
- Drawer/modal sequencing avoids simultaneous focus traps.
- Dashboard remains read-only.

### Added — Cross-filter / Data Completeness
- Global Dashboard search for user-facing system, village, area, and agency text.
- Shared `waterQuantity` filter dimension.
- Cross-filter interactions from District, System Type, Drinking Quality, and Water Quantity charts.
- Active filter chips with per-filter removal.
- Data Completeness progressive reveal: 20 rows initially, then 20 more per click until complete.
- Read-only Detail actions inside Data Completeness issue rows.
- Map actions inside Data Completeness only for systems with usable coordinates.
- Read-only village detail rendering for village-only source issues.
- Unit and browser regression coverage for unified filtering, chart toggles, search, pagination boundaries, and Data Completeness actions.

### Changed
- Section heading `คุณภาพน้ำและปริมาณน้ำ` is now `คุณภาพน้ำและปริมาณน้ำโดยรวม`.
- District changes clear only dependent Local Authority; independent system/status/quality/quantity/search filters remain active.
- Charts render their own dimension with self-exclusion so alternate bars/segments remain selectable while a chart filter is active.
- Data Completeness now follows the same active filtered dataset as the rest of the Dashboard.
- Detail Drawer metadata can switch between system detail and read-only village/area detail without duplicating the drawer shell.

### Safety
- Search deliberately excludes generated internal IDs from searchable user-facing fields.
- Chart clicks mutate the same `AppState.filters` used by dropdowns instead of filtering DOM elements independently.
- Dashboard remains read-only; no write HTTP methods or data-edit workflow were added.

## 1.0.0-rc.4 — 2026-08-19

### Added
- Map popup action `รายละเอียด` using the same shared system detail renderer as the Watchlist.
- Map popup action `นำทาง`.
- Desktop navigation opens Google Maps Directions with the selected system coordinates.
- Mobile navigation chooser for Google Maps, platform map handler, and Google Maps web fallback.
- `assets/js/system-detail.js` as the single shared Detail Drawer renderer.
- `assets/js/navigation.js` for navigation URL generation and mobile chooser behavior.
- `assets/js/document-preview.js` for safe document URL normalization and preview-first links.
- Document reference card near the top of the Detail Drawer.
- GitHub Actions Playwright QA workflow.
- Separate read-only real Apps Script smoke workflow using `APPS_SCRIPT_API_URL` secret.
- Unit regression tests for navigation URLs and document previews.
- Browser regression tests for popup actions, presentation leakage, filters, responsive layouts, anchors, map containment, and real API loading.

### Changed
- Document links no longer point directly to DLA PDF downloads when a web preview URL can be constructed.
- Watchlist and Map popup now share one Detail Drawer implementation to prevent UI divergence.
- PROJECT_RULES now defines permanent rules for map actions, document preview, GitHub Actions, and real API smoke tests.

### Security / Safety
- Document URLs accept HTTP/HTTPS only.
- Navigation is generated only from numeric coordinates already accepted by map validation.
- CI does not commit or print the Apps Script API secret.
- Dashboard remains read-only.

### Fixed — deployment path hotfix
- Mock-data URLs are now resolved from the owning ES module URL instead of `document.baseURI`.
- Apache subdirectory deployments such as `/Village_Watersupply/` no longer escape to `/data/mock/...` when mock mode is enabled.
- Added regression tests for both domain-root and subdirectory URL resolution.
