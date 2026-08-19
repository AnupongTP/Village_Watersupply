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

### Security / Safety
- Document URLs accept HTTP/HTTPS only.
- Navigation is generated only from numeric coordinates already accepted by map validation.
- CI does not commit or print the Apps Script API secret.
- Dashboard remains read-only.
