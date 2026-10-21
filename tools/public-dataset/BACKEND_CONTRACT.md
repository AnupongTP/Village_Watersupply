# Phase 1C local publication contract

## Phase 3A LOCAL source-authority prototype (not deployed)

`local-source-authority.mjs` is an isolated OS-temp journal model. It does not
call Google Sheets, Apps Script, Management, Netlify, or the browser. Each
transition writes a new generation file and a completion marker. A completed
generation is visible only while every observed generation is complete and
integrity-checked; an incomplete newer generation blocks the authority rather
than exposing an older READY generation. Each generation also has a
small status sidecar, which lets `SOURCE_STATUS` and `RECOVERY_STATUS` report
state without parsing or returning private row bodies. Journal inspection
does hash private journal bytes to reject incomplete generations. The sidecar
is integrity checked against the same completion marker. It records the last committed revision,
not live Google Sheets freshness. A directory lock serializes
participating operations. File sync is requested, but directory-entry survival
after power loss and stale-lock recovery are **not proven**. A partial journal
file can require manual inspection; the model never declares such a write
committed. The journal contains synthetic private rows and raw submissions and
must never be placed in a publishable directory.

| State | Meaning | Publication |
| --- | --- | --- |
| `READY` | No unresolved intent; committed rows, eligibility, and table/header digest matches the durable journal; a complete read can be checked | A fresh candidate may be prepared under the local fence |
| `WRITING` | Durable intent precedes the first participating normalized write | Blocked |
| `NEEDS_RECONCILE` | Partial, interrupted, or bypassed write has uncertain outcome | Blocked |
| `BLOCKED` | Consistency cannot be established safely | Blocked |

Revision zero is an explicitly validated initial synthetic generation. The
whole-dataset `sourceRevision` increments once when a new mutation with a
distinct id has completed its expected normalized changes, fresh physical
readback, and complete eligibility decisions. It is never derived from row
versions, timestamps, request counts, or content hashes. The committed digest
covers normalized rows, eligibility decisions, and table/header identity; it
is an integrity check, not the source revision. The durable intent
contains the expected final three-sheet rows before any normalized write.
`resolve()` validates an independently observed journal readback and the full
final rows before writing the READY/next-revision marker. A duplicate commit
returns the existing revision. An unchanged interrupted intent may be aborted
only with a fresh readback matching its pre-write rows, with no revision
advance. Partial writes remain unresolved; the model does not silently roll
them back. A separate, explicit drift reconciliation requires a fresh readback
and complete eligibility, and advances the revision once after validation.

Feature 3 raw submissions are recorded first and keyed for idempotency.
`village_id_ref` must identify an existing synthetic village, or a new village
with explicit synthetic `newVillageEvidence`. Starting normalization without
that raw record is rejected. The local contract permits exactly one new water
system linked to that village, preserves existing rows, permits at most one
new village, and never changes `waterSources`. This evidence flag is a LOCAL
fixture device, not an assertion about the deployed Feature 3 API. A raw
`RECEIVED`, `FAILED`, or `PROCESSED` text is never publication proof. If
normalized writes are partial, the fence remains closed. If all expected
normalized writes are present, recovery may commit after readback and explicit
eligibility, regardless of stale raw status text. The model never edits raw
status merely to make the authority appear consistent.

### Phase 3A critical safety corrections (LOCAL only)

The committed generation now contains `committedMutations`, keyed by mutation
ID, and `rawConsumption`, keyed by raw submission ID. A committed mutation
stores a stable fingerprint of its ID, kind, ID-ordered expected normalized
rows, raw submission ID, and Management audit evidence, plus its original
revision. A Feature 3 consumption entry binds the raw submission to the
committed mutation, exactly one created water-system ID, and that fingerprint.
The consumption entry, committed identity, and revision advance are written
in the **same** completed journal generation. Replaying the identical
committed request returns its original revision. A changed request with the
same mutation ID fails as `MUTATION_IDEMPOTENCY_CONFLICT`; a new mutation ID
attempting to reuse a consumed raw submission fails as
`RAW_SUBMISSION_ALREADY_CONSUMED`. A pending intent retains its raw-submission
reservation through restart. A proven unchanged pre-write abort removes the
pending intent without recording consumption. Raw processing-status text is
never used as consumption evidence.

`rawLedgerComplete` records whether all prior committed identities and raw
consumptions are accounted for. Older LOCAL journal shapes without that proof
cannot certify READY or return a trusted revision, even if their prior rows
look valid. Replaying an unknown identity fails as
`MUTATION_IDENTITY_UNVERIFIABLE`; new Feature 3 processing fails as
`RAW_CONSUMPTION_UNVERIFIABLE`. No identity is guessed from current rows or
raw status. Such history needs evidence-backed manual migration outside the
read-only gateway.

The gateway now reserves a structurally valid nonce **synchronously before**
awaiting authorization. An in-flight duplicate is rejected. The reservation
is retained after denied/failed authorization or a source error; exhaustion
of the bounded nonce set fails closed. It is process-local only: a restart or
another process has an independent set. A Production gateway needs durable,
distributed replay control and separately reviewed authentication.

Before selecting any committed generation, the authority scans journal
generation names and verifies that every generation from 1 through the
newest has a JSON record, status sidecar, and matching complete marker. A
missing file or invalid marker yields `JOURNAL_INTEGRITY_UNRESOLVED`.
`SOURCE_STATUS` returns BLOCKED with no trusted revision; verified reads,
publication, and mutations reject. No file is automatically deleted,
overwritten, renamed, or reused. Manual recovery requires preservation of
all bytes, proof of whether any normalized write occurred, the original
intent and physical readback, audit/eligibility evidence, and a reviewed
decision on revision ordering. The model does not implement that recovery.
The existing directory lock remains in place and is never stolen or removed
automatically after a crash.

Management update and physical Hard Delete use the same fence. Hard Delete
requires synthetic audit/tombstone evidence and verifies that exactly one
previously present system is physically absent while other rows stay intact;
it neither soft-deletes nor restores a
row. A PREPARED operation with an uncertain physical outcome stays
`NEEDS_RECONCILE` until the final rows and readback can be proved. Readers
do not invoke recovery. A previously generated candidate cannot establish
CURRENT after a newer verified deletion; the local publisher rejects it once
the newer revision is published, and local GET requires fresh matching proof.
The synthetic Management update path cannot add or remove normalized row IDs.

`verifiedGeneration()` reads the persisted journal separately for source rows
and independent evidence, checks table names, required headers, row ID sets,
counts, revision and fence state, and compares the persisted generation before
and after reading. It then reuses `inspectSourceRead()`,
`selectPhysicalPublicationEligible()`, and `createPublicSnapshot()` (schema 4,
policy `REVIEW_DEFAULT_DENY_2026_10_21_V1`, nine withheld fields, R5.1 once).
The synthetic observer is a separate read of the **same local journal**, not
a proof of independent Google Sheets authority. It cannot establish complete
live drift detection. Known bypass edits are quarantined. Apps Script
ScriptLock protects only participating paths and is not a cross-project or
manual-Sheet-edit transaction fence.

`local-private-gateway.mjs` specifies an in-process private interface with
`SOURCE_STATUS`, `VERIFIED_SOURCE_READ`, and `RECOVERY_STATUS`. Status calls
read metadata only and trigger no recovery. The read action returns source
rows only after an injected authorization check; actions are allowlisted,
nonces are rejected on replay within the process, and request/response sizes
are bounded. Errors return categories, not raw records. A body containing
`success: false` is rejected even if a future HTTP transport reports 200.
These are **LOCAL mock controls**. Future server-to-server authentication,
durable replay protection, credential storage, response pagination/limits,
timeouts, log hygiene, and deployment restrictions need a separate reviewed
design. CORS does not authenticate requests. Technician credentials must not
be reused, and no gateway credential may appear in browser JavaScript.

`publishReady()` is a synthetic end-to-end demonstration: it holds the local
source fence while producing a fresh candidate and calling the existing local
publisher. The source journal and publication journal do not form a shared
transaction, and no equivalent cross-service lock or Netlify Blob ordering
guarantee is asserted. Other callers can still directly invoke the generic
local publisher; a future integration must enforce the authority gate at its
only publication entry point.

**Unresolved Production gates:** identify the actual deployed owner Apps
Script project and all participating writers; add durable revision/intent and
recovery to Feature 3 and Management without violating raw-first or audited
Hard Delete; prove three-sheet consistent reads and independently attested
completeness/eligibility; detect or quarantine manual edits and separate
project writers; validate a private gateway authentication and replay scheme;
prove Netlify publication CAS/visibility; design Public freshness and offline
IndexedDB warnings. The local tests are authored but not executed in Phase
3A, and this prototype is not a working Apps Script gateway.

This is an engineering specification, not an Apps Script or Netlify deployment.
The local model uses synthetic evidence. Its source revision, independent
completeness attestation, and publication decisions do **not** exist as verified
Production capabilities.

## Local candidate disclosure and version identity

The current candidate uses snapshot schema `4` and public projection policy
`REVIEW_DEFAULT_DENY_2026_10_21_V1`. These identify a **review proposal**, not
approval to publish. `projection.mjs` admits only its explicit field allowlist.
The water-system fields `responsible_agency`, `shared_village_name`,
`establishment_agency`, `transfer_agency`, `transfer_other`, and
`transfer_document_url` are withheld pending disclosure approval. The optional
aliases `owner`, `transfer_year`, and `document_url` are withheld by default too.
Other existing allowlisted fields, including `system_id`, `village_id`,
`owner_type`, `transfer_year_be`, and source/village relation IDs, remain
provisional. Unknown source columns, raw submissions, auth, audit, session,
and Management-only properties are not public snapshot fields. Allowlisted
values must be JSON scalars or null; unsafe objects and non-finite numbers
reject the candidate. The projection retains the existing R5.1 order and is
owned once by `SERVER_R5_1` in the local consumer path.

`contentHash` checksums the canonical, ID-ordered three-array public payload.
`datasetVersion` checksums that same canonical payload **plus** schema version
and public policy revision. Observation time, `generatedAt`, and trusted
`sourceRevision` are separate metadata and do not change dataset identity.
Old schema or policy snapshots fail active validation, including Public reads
from the local store. Matching source revision and payload checksum cannot
confirm CURRENT when dataset versions differ. Schema 4 also requires the
`EXPLICIT_POLICY_MIGRATION_V1` publication-contract marker. Schema 3 objects
with this same restrictive field policy can be inspected only by the narrow
migration reader; schema 2, an unknown policy, or corrupted history cannot.

Withheld agency and shared-village text will no longer match global system
search in `assets/js/filters.js`. `assets/js/system-detail.js` will show empty
agency/transfer text, no document preview link, and may show a transfer section
with only remaining year/status fields. `owner_type` labels still work, but
the legacy `owner` fallback is absent. Public UI parity and disclosure must
be reviewed before any loader switches to these snapshots; the deployed
Dashboard still uses its existing Public GAS response and is unchanged here.

## Explicit local schema migration

The selected model keeps the append-only object and generation files. It
adds a dedicated `migrateLocalSnapshot()` path for **only** schema 3 with
`REVIEW_DEFAULT_DENY_2026_10_21_V1` to active schema 4 with that same policy.
This is a schema/publication-protocol change, **not** a source mutation or an
additional disclosure approval. A future policy transition needs a separately
reviewed predecessor validator and transition rule; there is no `force` or
arbitrary policy namespace switch. Normal publication still requires a newer
trusted source revision and cannot cross publication identities silently.

The migration caller supplies a newly created in-memory candidate from a
complete independently attested three-sheet read and explicit eligibility
decisions. The candidate must carry a trusted monotonic source revision. The
historical object is checked for byte integrity, snapshot metadata hash,
restricted field allowlist, ID/relationship/count integrity, exact schema and
policy, and agreement with the old pointer. It establishes the prior identity
and source-revision floor; it does **not** prove that the old data is fresh.
The candidate's source revision must be at least that floor. Because this
schema-only transition retains the same Public field policy, a same-revision
migration also requires `candidate.contentHash === predecessor.contentHash`.
The `datasetVersion` values must differ because schema identity changed, so
they are not compared for equality across the transition. A newer trusted
source revision may carry different Public content. The publisher rejects a
same-revision mismatch as `MIGRATION_CONTENT_CONFLICT` during preflight, and
storage repeats the check after re-reading the pointer and validated predecessor
under the local directory lock. A lower revision is rejected across identities;
a same-revision conflict within the active identity remains rejected. The new
object is validated on readback before a higher append-only generation is
written. The `.complete` marker activates that generation. There is no
in-place overwrite. A content conflict leaves the previous generation intact
but unavailable as CURRENT under active schema 4.

Before and during migration, a pointer to schema 3 fails active Public GET
validation and returns `POLICY_MIGRATION_REQUIRED` / UNAVAILABLE when its
historical integrity can be checked; damaged or unsupported history stays
UNAVAILABLE without data. After activation, Public GET still needs
a newly trusted candidate with matching source revision **and** dataset
version to return CURRENT. No GET or version read writes storage. Previous
objects remain recovery artifacts, never automatic Public fallbacks. A failed
candidate write or interrupted pointer write leaves the old generation
active but unavailable under schema 4. A timeout after pointer activation is
indeterminate; retry with the trusted candidate recognizes the already
published identity, including equivalent content with a different observation
time. A different candidate at the same revision and policy is a conflict.

This LOCAL filesystem adapter assumes one machine's directory creation,
file sync, and completed-marker visibility. Directory-entry power-loss
durability and stale-lock recovery remain unproven. No equivalent CAS,
linearizable pointer read, atomic marker, or read-after-write guarantee has
been established for Netlify Blobs. A cloud migration would need those
provider-specific proofs and a separate authorization. Apps Script still
lacks a verified monotonic source revision, cross-sheet read/write fence,
Feature 3 partial-write publication decision, and Management PREPARED
recovery contract. Synthetic local attestations are not Production evidence.

## Minimum authoritative source contract

1. A single monotonically increasing **dataset** revision covers all three
   normalized sheets and every committed Management or Feature 3 change. A
   per-record version or changing GET timestamp cannot substitute.
2. A read returns a complete, consistent three-sheet generation and an
   independent attestation of table identity, headers, row IDs/counts, and
   publication eligibility for every present system. A manifest generated
   from the same response is insufficient.
3. Management hard deletion advances the dataset revision only after the
   deletion commits. Publication at that revision must omit the deleted system.
   A prior object can remain for recovery but cannot become CURRENT.
4. Feature 3 supplies an explicit publication-ready decision after its
   normalized writes commit. Raw submission status alone is not assumed to
   provide that decision.
5. Mutation completion and revision advancement form one recoverable contract.
   Sync delivery can be duplicated, late, or lost; reconciliation scans for
   revisions after outage and verifies the full source before publication.
6. Direct Sheet edits must either advance the authoritative revision through
   a controlled path or trigger a reconciliation that blocks CURRENT status
   until a new complete generation is verified. Apps Script ScriptLock in
   separate projects is not a shared lock.

## Design alternatives and tradeoffs

| Alternative | Relative change | Correctness and cost |
| --- | --- | --- |
| Complete read and independent verification on every public GET | Public Apps Script/read path change **NOT AUTHORIZED** | Can establish request-time equality if the read is truly consistent; likely retains most of the existing read cost. |
| Shared authoritative commit revision with conditional snapshot publish | Management and Feature 3 backend changes **NOT AUTHORIZED** | Permits cheap revision checks only if every writer, deletion, and manual edit participates. Revision check needs an independent consistency guarantee. |
| Scheduled full reconciliation plus cached GET | Backend scheduler and public path changes **NOT AUTHORIZED** | Bounds delay only when schedule, failure detection, and source completeness are proven; cannot promise immediate post-delete freshness. |
| Append-only mutation journal plus reconciliation | Backend changes **NOT AUTHORIZED** | Supports missed-event recovery, but journal and normalized sheets require an atomic or reconcilable commit protocol. |

The least invasive local next step is a synthetic end-to-end mutation/sync
fixture. A Production choice needs the user's freshness-versus-availability
decision and verified deployed backend source/behavior.

## Storage provider requirements

The local adapter uses an OS temporary directory. It writes content-addressed
objects and append-only publication generations. A completed marker is the
visibility point; a filesystem directory lock serializes promotion, and the
publisher checks the newest generation under that lock. Readers validate the
marker, SHA-256 bytes, schema, public field allowlist, IDs, relationships,
revision, and pointer identity. A previous object is recovery-only.

Adapting this to Netlify Blobs requires **verified** equivalents of atomic
create/conditional writes or compare-and-swap, linearizable pointer reads,
read-after-write object visibility, durable marker/pointer ordering, and
documented behavior after timeout, process crash, and concurrent writers.
The local filesystem tests prove none of these cloud-provider properties.
An expired/stale lock cannot be automatically stolen without a fencing
token or authoritative lease; manual recovery is required after a process
crash while holding a local lock. Power-loss durability of directory entries
is also unproven by these tests.

## Public GET policy

The local `getVersion` and `getData` methods make no writes. Without a
new trusted candidate matching the published revision and public content,
state is UNKNOWN. A newer trusted source is STALE. Missing or corrupt
pointer/object is UNAVAILABLE. Only CURRENT returns the three-array
Dashboard response, already marked `SERVER_R5_1`; the consumer does not
apply R5.1 again. No browser loader or Production fallback is changed.

The local storage API is a test adapter, not an authenticated service boundary.
Any future network endpoint needs access controls for publication and
read-only public GET routing. Hashes detect accidental corruption; they do
not authenticate an attacker with storage write access.
