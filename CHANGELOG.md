# Changelog

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

### QA hardening
- Added locked-viewport map containment and hash-anchor assertions across all 8 required viewport sizes.
- Added Watchlist no-truncation regression with 25 synthetic matching records and internal-scroll verification on desktop/mobile.
- Added Drawer close/focus/mobile-fit regression coverage.
- Added Chart.js finite-data/filter-response regression coverage.
- Added explicit API-error and empty-dataset UI-state regression coverage.
- Expanded filter QA to verify District → Local Authority cascading.
- Added runtime read-only request monitoring and real-data presentation-leak checks.
- Playwright visual evidence is uploaded on successful CI runs as well as failures so screenshot review can actually occur before release.

### Security / Safety
- Document URLs accept HTTP/HTTPS only.
- Navigation is generated only from numeric coordinates already accepted by map validation.
- CI does not commit or print the Apps Script API secret.
- Dashboard remains read-only.
