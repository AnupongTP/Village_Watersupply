# Phase 1C local publication contract

This is an engineering specification, not an Apps Script or Netlify deployment.
The local model uses synthetic evidence. Its source revision, independent
completeness attestation, and publication decisions do **not** exist as verified
Production capabilities.

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
