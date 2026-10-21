# Technician district scope (local proposal)

The frontend form in `technician/` now requires one district for each technician account. The corresponding backend changes are in `technician-district-scope.patch`, based on `D:\Codex Project\KebNamComplete.zip`. That ZIP is a reference snapshot, **not a verified export of the currently deployed Apps Script project**. Reconcile every hunk with the current Apps Script Editor source before any release. Do not deploy this patch blindly.

## Contract

- `users` gets a final column named `district`. Admin rows may leave it blank. Technician rows use the exact district name in `villages.district`.
- `technicians.create` and `technicians.update` accept a required `request.district`, validate it against `villages`, and return `user.district`. The create path keeps `must_change_password: false`; password reset keeps its existing `true` policy.
- `technicians.list`, `auth.login`, `auth.me`, and `data.bootstrap` expose the assigned district in their existing user object. `data.bootstrap.featureFlags.technicianDistrictScope` is `true` only from a backend enforcing the policy.
- Admins retain access to all districts. A technician without an assignment is denied Management bootstrap, Dashboard reads, system details, history, updates, and deletions. A technician with an assignment receives only village, system, and source records for that district. Direct system reads, updates, deletes, and history requests also check district on the server.
- Changing an account's district revokes its existing sessions, so an open session cannot continue using data from the previous assignment.
- The browser refuses to create/update a technician account if the backend lacks the scope feature flag. It also refuses to open a technician dashboard without the feature flag and assigned district.

## Rollout and migration gate

1. Review the current Apps Script source against the ZIP based patch. In particular, preserve all newer live edits, including the already changed `must_change_password: false` create policy.
2. Validate a copy of the Management spreadsheet schema before production migration. The backend patch reads either the original 16 column `users` schema or the new 17 column schema, but account create/update with district is rejected until the new column exists.
3. After backend review and tests, deploy the backend first. Add `district` as the final `users` header, without moving or changing existing columns. Existing technicians remain unassigned and cannot use Management until an admin assigns each one through the edited account form.
4. Deploy the frontend only after the backend feature flag, schema migration, and district assignment are verified. A frontend only deployment cannot provide server side authorization.
5. Validate synthetically and then in an approved environment: Admin all district visibility; assigned technician own district read/edit/delete/history; denial of cross district requests sent directly to the API; unassigned technician denial; session revocation after reassignment; correct summaries; account create/update; disabled/deleted account behavior; audit and recovery behavior.

## Limits

- No Apps Script, spreadsheet, or Production change was made by this local task.
- The patch is not guaranteed to apply to the current Apps Script Editor state. It was built from the local ZIP, which predates at least the direct Editor change to the account creation password policy.
- The browser mock tests verify the frontend contract and request payload. They do not prove that the live backend enforces district authorization.
- The full isolated Technician browser run on this local working tree had 109 passes and 9 failures in unrelated UI and accessibility scenarios. Those failures need triage before release; this task does not classify them as pre-existing without a baseline comparison.
