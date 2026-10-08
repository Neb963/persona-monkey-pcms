# P034 — Accounts UX with Persona/account pickers

State: **PR_OPEN**. Claim CLM-P034-001, claimEpoch 1, branch `agent/gpt-6/p034-t034-1`. This evidence is the implementation checkpoint, not acceptance.

## Governance
- Dependency P032 ACCEPTED. Original claim base `1ea1c08286c976ebd3bbc6aaa32169f18e74a603`.
- P035 holds a separate active claim with disjoint product write paths. P034's exact app mounting, Core composition, package and Firefox workflow paths were allocated via serialized governance commit `0b82d566ace67cf31d9fae15eb476ce907176db2`.
- No PersonaMonkey or raw browser authority was added; all state mutations pass through existing Core accounts commands.
- No migration, contract write, provider live operation, CAPTCHA bypass or successor phase was introduced.

## Implementation
- `views/accounts/accounts-view.js`: bounded table (25 per page), name/persona search, provider/route filters, account deep links, details and rebind dialog.
- `views/accounts/model.js`: deterministic slug key generation with collision suffixes, sorting/filtering/pagination, validated Persona and last observed route status. Unverified provider session is explicitly Unknown.
- `ui/picker/entity-picker.js`: keyboard-searchable reusable picker of named Personas, disabling Personas bound to other accounts, no free-text durable IDs.
- `pcms-modules/p014/accounts.js` and Core composition: fail-closed durable RemoteOperation inspection before and after target Persona resolution. Account-scoped correlation is read from durable operation context when available. Unknown correlation blocks rather than replays/rebinds.
- The old P026 form IDs are hidden to preserve inherited assertions. P040, not P034, owns eventual removal.

## Acceptance mapping
| Gate | Deterministic evidence |
| --- | --- |
| A034-01 | `tests/pcms/p034/accounts-model.test.mjs` validates auto-generated IDs and picker usage; packaged Firefox creates the dialog and verifies read-only key and picker DOM |
| A034-02 | `tests/pcms/p034/rebind-guard.test.mjs` checks initial/racing unresolved guards, unchanged account state and successful resolved rebind; packaged Firefox verifies disabled rebind and visible warning |
| A034-03 | 52-account Node fixture validates page/sort/filter/deep links; `tests/pcms/p034/packaged.mjs` drives 25/25/2 rows and detail in exact pinned Firefox Developer Edition 154.0b10 |

## CI evidence and limitations
- Repository verification for checkpoint `1e4c3d4d373856d2f84ffb7c53ed8a574d76362d`: [verify #37709932604](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37709932604) — PASS.
- P034 packaged-Firefox job at [run #37709932642](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37709932642) — PASS; inherited broader run status must be checked independently.
- Prior packaged-Firefox run #37709764755 exposed a **test-only** wrong assertion against the detail panel. Fixed in `1e4c3d4d373856d2f84ffb7c53ed8a574d76362d` (the UI and 52-row pagination were functioning).
- Routing labels use PersonaMonkey's last-observed public health from `persona.list`. They do not claim a live `route.get` check or session authentication. Absent provider probe, session remains Unknown.
- No live Perchance or operator-firefox proof is claimed; those belong exclusively to P043/P044.
