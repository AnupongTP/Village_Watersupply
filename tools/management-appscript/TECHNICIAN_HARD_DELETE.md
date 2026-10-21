# Technician account hard deletion

## Current state

The live Management Apps Script Editor was inspected on 2026-10-22. Its `mgmtDeleteTechnician()` still calls `mgmtOpsAccountStateMutationFacade_()` with status `DELETED`; the `users` row remains and `mgmtCreateTechnician()` rejects the old username. The current Editor also has `must_change_password: false` for account creation. The ZIP in `D:\Codex Project\KebNamComplete.zip` is older and must not be pasted over the Editor source.

The only historical `DELETED` technician row found in the connected `Village_Watersupply` spreadsheet was removed from `users` after confirming a committed `TECHNICIAN_DELETE` audit and a revoked session. The audit and session history were retained. No other user row was removed.

## Future delete implementation

`technician-hard-delete.js` contains two functions to insert into the **current** `ManagementOperationsBackend.gs`: a restoration helper and a replacement `mgmtDeleteTechnician()`. Keep the existing disable and enable functions. The frontend route and request shape remain `technicians.delete` with `userId`, `expectedVersion`, `reason`, and `clientInfo`.

The replacement checks administrator permission, technician role, status, record version, and username uniqueness; writes a `PREPARED` audit with `after: null`; revokes sessions; removes the `users` row; verifies removal; and commits the audit. It compensates a failed intermediate deletion when possible. If audit commit fails after row removal, it leaves `PREPARED` for the existing deterministic user-audit recovery path. New accounts with a reused username receive a new `user_id`; old audit records remain linked to the old `user_id`.

This local snippet is **not installed or deployed** into Apps Script. The browser refused access to the local snippet file under its URL security policy, and no workaround was attempted. To finish the future-delete behavior, review the snippet against the current Editor, add the helper, replace only the existing `mgmtDeleteTechnician()` function, save, run synthetic Apps Script tests, create a new Web App deployment version for the endpoint used by Technician, then verify the deployed action with a synthetic account. Do not upload the whole older ZIP.

The local Technician confirmation was intentionally left unchanged. Update its wording to describe permanent removal only after the deployed backend actually performs it; otherwise the message would overstate the current behavior.

## Verification

- `node --test tests/unit/management-technician-hard-delete.test.mjs` exercises success, stale version, missing reason, Sheet deletion failure, audit commit failure, and administrator-account protection with synthetic data.
- `node --check tools/management-appscript/technician-hard-delete.js` validates syntax only.
- No live `technicians.delete` request was made as part of this change.

## Remaining gate

The in-progress `technician-district-scope.patch` is separate. Reconcile both changes against the current Editor before deployment, especially the user schema and role permissions. Do not install the ZIP over the Editor source.
