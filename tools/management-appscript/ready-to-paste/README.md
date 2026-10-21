# Ready-to-paste Management Apps Script sources

These four `.gs` files are complete source replacements for the identically named files in the **current** `KebNamComplete` Apps Script Editor. They were built from the local ZIP only after SHA-256 comparison confirmed that the Editor's Auth, Read, and Mutation files exactly matched the ZIP, and Operations exactly matched the ZIP with its existing `must_change_password: false` account-creation edit.

The bundle includes both the previously requested technician district assignment and the subsequent technician account hard-delete change. The ZIP at `D:\Codex Project\KebNamComplete.zip` was not changed. This bundle has not been pasted into or deployed from Apps Script.

## Paste targets

1. `ManagementAuthBackend.gs` → same-named file in Apps Script Editor.
2. `ManagementReadBackend.gs` → same-named file in Apps Script Editor.
3. `ManagementMutationBackend.gs` → same-named file in Apps Script Editor.
4. `ManagementOperationsBackend.gs` → same-named file in Apps Script Editor.

Paste the **entire contents** of each prepared file over the entire contents of its identically named Editor file. Do not paste the older ZIP originals instead. Do not replace unrelated `.gs` or `.html` files.

## Required data setup before using district-scoped accounts

The current `users` tab has 16 headers. Add `district` as the **17th header in Q1**, leaving A:P unchanged. Admin rows may leave Q blank. Each existing active technician must receive the exact district name used in `villages.district` in their Q cell. Under the requested policy, technicians without an assigned district cannot use the Management dashboard. The backend accepts the old 16-column schema for existing reads but rejects new technician creation and district updates until Q1 exists.

Save all four Editor files, run the existing Apps Script synthetic tests in a safe copy, then create a new Web App deployment version for the endpoint used by Technician. Verify the deployed behavior with synthetic accounts before relying on it. Pasting source alone does not change an already deployed `/exec` version.

## Behavior included

- Technician creation and update require one valid district and return it in the user view. New accounts retain `must_change_password: false`; password reset retains `true`.
- Admins see all districts. A technician sees only their assigned district; direct reads, history, updates, and system deletes enforce the same boundary on the server. Reassigning a technician revokes existing sessions.
- `technicians.delete` now physically removes the technician row from `users`, revokes sessions, and retains a sanitized audit record. Its API request shape is unchanged. The historical `DELETED` row was already removed separately after verifying its audit and session state.

## Local verification

All four prepared files passed JavaScript syntax checks. The synthetic technician hard-delete tests passed. These checks do not prove live Apps Script or Sheet behavior. No live Management API request or deployment was performed while preparing this bundle.
