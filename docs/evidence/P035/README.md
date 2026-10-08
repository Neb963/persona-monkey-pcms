# P035 — Toolbar popup PCMS status block

## Provenance and claim

- Phase: P035; tasks T035.1, T035.2 and T035.3.
- Claim: `CLM-P035-001`; owner `gpt-6`; epoch `1`; branch `agent/gpt-6/p035-t035-1`.
- Feature/test candidate commit: `1b2d26c6f02b7a28d6bf5ce0a1c6cc4ca76e74bc`.
- PR: https://github.com/Neb963/persona-monkey-pcms/pull/48
- Independent `verify` CI: https://github.com/Neb963/persona-monkey-pcms/actions/runs/37709670126 — **PASS** for the exact candidate above.
- Pinned Firefox Developer Edition workflow: https://github.com/Neb963/persona-monkey-pcms/actions/runs/37709669991 — scheduled on the exact candidate above; see the workflow for its final conclusion.

## Changes

- `extension/popup/popup.js` reads only `browser.storage.session["pcms.status.v1"]` and projects whitelisted non-secret fields. It never calls a PCMS Core constructor or makes PCMS UI/Core requests.
- Stable active `personaUid` matches the non-secret `personaAccounts` projection. A validated Account ID is URI-encoded in `#/accounts/<id>`; the popup reuses and focuses a PCMS dashboard tab or opens one.
- Status block displays Running, Starting, Unavailable, and cached Idle/last-known status, attention counts, recovery hold, and the account link. Unmanaged context shows only attention/hold (not account details).
- Popup retains fixed 370px body width, compact ellipsis text, and a bounded 560px scrolling main surface. Existing route/privacy controls remain intact.
- The frozen upstream `popup.js` now lives in the exact-byte snapshot alongside upstream popup HTML/CSS. Derived popup files are recorded by blob SHA and byte size in `docs/upstream/import-manifest.json`.

## Acceptance evidence (candidate commit above)

| ID | Verified evidence | Result |
| --- | --- | --- |
| A035-01 | Node regression asserts intrinsic fixed 370px body width, no viewport-relative body sizing, bounded 560px content, and ellipsis for long labels. | **PASS (U)**; targeted graphical ESR/FDE popup measurement not yet executed |
| A035-02 | VM-based browser mock injects secret, cookieStoreId and HumanTask instruction fields into the session summary; rendered PCMS status contains none. Frozen upstream provenance integrity also passes. | **PASS (U, SEC regression)** |
| A035-03 | VM-based browser mock verifies Core statuses, stable Persona-account mapping, invalid-ID rejection, correct account hash, existing-tab reuse/focus, new-tab creation, unmanaged hiding, recovery hold and live session-summary updates without Core RPC. | **PASS (U)**; targeted packaged FDE popup navigation not yet executed |

## Verification performed

- Independent hosted `verify` workflow `37709670126`: **SUCCESS**. This runs `verify:repo`, `verify:views`, `verify:claims`, P032 tests, Firefox harness contract tests, and `verify:upstream`. `tests/upstream/import-integrity.test.mjs` imports `tests/pcms/p035/popup.test.mjs` as part of that path.
- Initial `verify` workflow caught three regression failures (cross-realm test comparison, singular attention copy, and Core Unavailable precedence). All three were corrected before the successful candidate run.
- Separate packaged Firefox workflow includes inherited P027/P028/P029/P030/P032 checks; it does **not** itself navigate or measure the new popup as P035-targeted browser acceptance. Do not treat a green inherited browser run as proof of those unexecuted P035 browser assertions.

## Status

Implementation is published in PR #48; claim and phase remain `PR_OPEN`.
Do not mark `ACCEPTED` until targeted Firefox popup rendering/navigation evidence (and any required independent integration-wave verification) is recorded. No successor phase was started.
