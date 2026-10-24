# Village_Watersupply — canonical LOCAL Supabase source

Project reference: `wfxudiciylpcmjbecbhk`.

## Source boundary

`source-provenance.json` records the owner's Edge Function handoff ZIP and SHA-256 values.
`public-data` and `runtime-worker` match that ZIP after newline normalization.
`management` follows the server-authoritative Auth job with `mid=begin.jobId||mid;`.
Its system-update adapter also sends only canonical changed fields (including
derived dependent values), preserving untouched SQL NULLs instead of rewriting
the complete normalized row. Historical audit records are never rewritten.
Cloud source remains **UNVERIFIED**: access to read Cloud source was denied. Local tests are not Cloud integration tests.
The existing bundled Processor code is preserved; no Feature 3 or KebNamComplete changes are included.

## SQL: fresh installation versus existing databases

- `sql/install/01_…` through `11_…` are the single existing reviewed schema baseline for an **empty, new application database only**. They retain the baseline dependencies; they do not enable a new Sheets sync system.
- Fresh-install `02_202610230002_commands.sql` includes `WHERE singleton IS TRUE` in `app.audit_commit()`.
- `sql/management-retry-and-audit.sql` is the specific **manual upgrade patch**. It replaces only `app.audit_commit()` and `api.auth_job_begin()`, without replacing tables, importing rows, changing function owners or resetting grants.
- The upgrade patch preserves the confirmed Production singleton predicate, and prevents multiple pending account-creation jobs for the same normalized username. A matching request from the same authorized actor resumes the existing job ID; mismatched pending requests remain blocked.
- **Never rerun the installation sequence on Production or an existing application database.** Review the exact upgrade patch against the installed function definitions, then obtain separate authorization before any Hosted execution. No Hosted execution has been performed here.

## Public live reads (LOCAL patch; not installed on Cloud)

`sql/public-live.sql` replaces only the body of the existing service-only
`api.public_snapshot()` RPC. Public responses are computed from current tables
through the existing `app.public_expected()` server allowlists and visibility
rules. The RPC name, Edge Function and frontend contract remain unchanged.
The existing function owner and EXECUTE grants are retained; no browser-role
grants, table writes, authority/session touches or snapshot publications are added.

For a fresh installation apply this patch after the baseline `install/01-11`;
for an existing installation review/apply only this patch with separate approval.
Do not rerun the baseline. Reapplying this specific patch does not change data.
The installed Cloud function definition/ACL must be compared with the baseline
before installation; Cloud source remains UNVERIFIED.

All data and revision reads use one SQL STABLE statement snapshot. A committed
change appears on the next request; a browser already displaying data is not
automatically pushed updates. Existing explicit offline/cache fallback remains.
Public reads no longer need a Worker publication after each source revision.
Private snapshots and the Worker's account cleanup are unchanged: do not remove
existing schedules indiscriminately.

`datasetVersion` remains an opaque SHA-256 public-content identifier; this reader
hashes PostgreSQL's deterministic JSONB representation, so its value may differ
once from the previous JavaScript-serialized hash for equivalent data. It does
not include timestamps, credentials or private fields and is stable thereafter
for unchanged public data. No persisted snapshot hash is overwritten.

Focused synthetic SQL + endpoint/cache contract test:

```powershell
node tests/backend/supabase-public-live.mjs
```

Direct reads trade background snapshot rebuilding for per-request database work.
Synthetic timings are not Production latency/capacity guarantees. No Cron,
Realtime subscription, schema import or Cloud installation is part of this patch.

## System history and committed save summary (LOCAL patch)

`sql/history-and-summary.sql` adds allowlisted before/after values to authorized
system history and a committed `changeSummary` to system-update receipts.
For a new installation, apply baseline install scripts 01–11, then
`sql/management-retry-and-audit.sql`, then `sql/history-and-summary.sql`.
For an existing installation already using the retry/audit fix, review and apply
only `sql/history-and-summary.sql`. Do not rerun the full installation or import.
Applying the older retry/audit patch later replaces `audit_commit()` and removes
the summary addition; reapply the history patch afterwards if needed.

The patch preserves historical events, authorization, function ownership/ACL and
the authority singleton predicate. Technician historical shared-village values
are district-filtered; malformed legacy shared values are explicitly redacted.
Frontend summaries use committed server values, not assumed submitted values.
Until the SQL patch is installed, the UI explicitly reports unavailable details.
No Edge Function source change or Cloud execution is included in this history
patch. Its synthetic local SQL test is `tests/backend/supabase-system-delta.mjs`.

## Credential retry storage

The browser stores only opaque mutation IDs and hashes of noncredential request fields in tab-scoped `sessionStorage`. Passwords, password hashes and raw tokens are not added to the recovery journal; `localStorage` and IndexedDB are not used for it. The existing session mechanism is unchanged.
An unresolved creation cannot silently become another creation by editing its payload. After refresh, the operator must reenter credentials in the existing form. Matching retries reuse the journal ID; server-side pending-job checks also cover a new browser mutation ID. Different credentials/payload that cannot be safely matched remain blocked; there is no automatic cancellation or bypass.

## Focused LOCAL checks

From the repository root:

```powershell
node --test tests/unit/supabase-transport.test.mjs tests/unit/supabase-management-engine.test.mjs tests/unit/public-cache-model.test.mjs
node tests/backend/supabase-management.mjs
node tests/backend/supabase-system-delta.mjs
node node_modules/@playwright/test/cli.js test tests/e2e/technician-mock.spec.js --workers=1 --reporter=list
```

The SQL test requires the existing isolated `vws-supabase-candidate-20261023` Docker container. It creates a uniquely named local database and uses invented Auth table doubles/records only. It never connects to Supabase Cloud. Existing test databases are not reset or dropped.

Keep `output/`, private import files, XLSX, archives, CLI `.temp` metadata and secrets out of Git. Deployment, Cloud installation, real data import and live Auth verification require separate authorization.
