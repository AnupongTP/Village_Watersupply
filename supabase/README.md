# Village_Watersupply — canonical LOCAL Supabase source

Project reference: `wfxudiciylpcmjbecbhk`.

## Source boundary

`source-provenance.json` records the owner's Edge Function handoff ZIP and SHA-256 values.
`public-data` and `runtime-worker` match that ZIP after newline normalization.
`management` adds exactly one line, `mid=begin.jobId||mid;`, to follow the server-authoritative Auth job during recovery.
Cloud source remains **UNVERIFIED**: access to read Cloud source was denied. Local tests are not Cloud integration tests.
The existing bundled Processor code is preserved; no Feature 3 or KebNamComplete changes are included.

## SQL: fresh installation versus existing databases

- `sql/install/01_…` through `11_…` are the single existing reviewed schema baseline for an **empty, new application database only**. They retain the baseline dependencies; they do not enable a new Sheets sync system.
- Fresh-install `02_202610230002_commands.sql` includes `WHERE singleton IS TRUE` in `app.audit_commit()`.
- `sql/management-retry-and-audit.sql` is the specific **manual upgrade patch**. It replaces only `app.audit_commit()` and `api.auth_job_begin()`, without replacing tables, importing rows, changing function owners or resetting grants.
- The upgrade patch preserves the confirmed Production singleton predicate, and prevents multiple pending account-creation jobs for the same normalized username. A matching request from the same authorized actor resumes the existing job ID; mismatched pending requests remain blocked.
- **Never rerun the installation sequence on Production or an existing application database.** Review the exact upgrade patch against the installed function definitions, then obtain separate authorization before any Hosted execution. No Hosted execution has been performed here.

## Retry and credentials

The browser stores only opaque mutation IDs and hashes of noncredential request fields in tab-scoped `sessionStorage`. Passwords, password hashes and raw tokens are not added to the recovery journal; `localStorage` and IndexedDB are not used for it. The existing session mechanism is unchanged.
An unresolved creation cannot silently become another creation by editing its payload. After refresh, the operator must reenter credentials in the existing form. Matching retries reuse the journal ID; server-side pending-job checks also cover a new browser mutation ID. Different credentials/payload that cannot be safely matched remain blocked; there is no automatic cancellation or bypass.

## Focused LOCAL checks

From the repository root:

```powershell
node --test tests/unit/supabase-transport.test.mjs tests/unit/supabase-management-engine.test.mjs tests/unit/public-cache-model.test.mjs
node tests/backend/supabase-management.mjs
node node_modules/@playwright/test/cli.js test tests/e2e/technician-mock.spec.js --workers=1 --reporter=list
```

The SQL test requires the existing isolated `vws-supabase-candidate-20261023` Docker container. It creates a uniquely named local database and uses invented Auth table doubles/records only. It never connects to Supabase Cloud. Existing test databases are not reset or dropped.

Keep `output/`, private import files, XLSX, archives, CLI `.temp` metadata and secrets out of Git. Deployment, Cloud installation, real data import and live Auth verification require separate authorization.
