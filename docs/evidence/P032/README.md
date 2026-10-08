# P032 — PCMS dashboard shell v2 as UI client

State: **ACCEPTED; PR #42 merged at 76ac9e7239ef58ddbcacb4dde85d5023930ee270**. All phase acceptance gates have independent CI evidence.

## Governance and provenance

- ACCEPTED claim CLM-P032-001, epoch 1, owner gpt-5-6-sol; branch agent/gpt-5-6-sol/p032-t032-1.
- Original base main: 4d1dfb314fef2f64bf5e89c67f6060c8d897d899.
- The P028 pcms.ui-client/v1 protocol was accepted at 401fa524225b35c45eaf239112974c27492d3bbc.
- P029 merged in PR #41 at 28651a46b1a0f37a56cbe4c327eea81e9bcc7c97.
- Governance PR #43 merged at 837f0b2e149240dc3d34fc63ce52f310f908100e. It reconciled P029 to MERGED (not ACCEPTED) and expressly extended P032 ownership to the UI-client contract, background dispatcher, package script and pinned Firefox workflow, with pcms.ui-client/v1 contract-write authority.
- P032 integrated that main with a non-force, two-parent merge commit 453bdf555c593aedfb041b7906b866273d96b419, preserving P029 product changes.
- Orphaned-PENDING implementation checkpoint: cae150254b006fd178f0b7ffac2e6dac57c73f33; the current branch also includes the completion-time retention correction. No migrations, resources other than CI workflow ownership, or PersonaMonkey/browser authority were added.

## Scope and acceptance

### A032-01: Canonical shell and safe routing

- V2 canonical hash routes cover Overview, Attention, Accounts, Generators, built-in modules, Activity, Settings, Diagnostics and Search.
- Legacy routes canonicalize. Invalid or stale entity links fail closed to Overview with a reason.
- Existing P026 Accounts and module controls are rehosted, without starting P033 module-contract work or P034 Accounts redesign.
- Consistent tokens and sidebar; duplicate dashboard bootstrap was fixed at d5f76d0adb31422ba0d9292d9f6afbc9b5067ad1.

### A032-02: Core-owned durable receipts and HumanTasks

- Added the additive read-only operation uiReceipts.list to the allow-listed pcms.ui-client/v1 contract and background UI dispatcher.
- Core alone owns the existing core.ui-receipts store. A dashboard never uses raw storage, IndexedDB or its own durable receipt database.
- Each response contains at most 20 records, with ONLY receiptId, fixed allow-listed command subject, status, recordedAt and completedAt. Request hashes, command inputs/results, stored errors and raw records do not cross the UI boundary.
- Filtering matches the existing seven-day Core receipt retention, using completion time for settled commands and creation time for outstanding commands. Malformed and future-dated rows are discarded. Unknown, failed and pending outcomes are prioritized over successful ones.
- An orphaned PENDING receipt without a matching current-Core in-flight operation is reported UNKNOWN. The UI must not claim an interrupted operation is still Running or replay it.
- The action tray reads durable receipts when opened or signaled by a revision. Immediate command feedback is de-duplicated. HumanTasks remain durable, separate Attention entries.
- A failed receipt-list request leaves the rest of the UI functioning and shows an action-history-unavailable indication.
- Native P032 regressions include cross-tab revision visibility, all-tabs-closed/reopen with a new background context, failed and redacted receipts, max-results and expiry, orphaned pending and strict read-only authorization.
- Packaged pinned-Firefox A032-02 test: tests/pcms/p032/packaged.mjs opens two actual dashboard tabs, creates a Core-backed backup command receipt, verifies both DOM trays and secret-safe RPC, closes every dashboard, forces event-page unload, then reopens and checks receipt persistence without command replay.

### A032-03: Core health and multi-tab operation

- Diagnostics is available even when Core bootstrap is unavailable, with mutation forms disabled on failure.
- Core status presentation distinguishes live Running, cached Idle, Starting and Unavailable.
- Refresh remains P028 revision-driven. No dashboard operator timer, background Core construction, or raw browser automation was added.
- Unloading a tab removes its listeners and does not stop Core.

## Verification and honest acceptance boundaries

| Gate | Files and coverage |
| --- | --- |
| A032-01 | app/router-v2.js, app/primitives.js, routes.test.mjs, shell.test.mjs, inherited packaged Firefox UI probe |
| A032-02 | integration/ui-client-contract.js, background/ui-dispatcher.js, receipt-read.test.mjs, durability.test.mjs, ui-client.test.mjs |
| A032-03 | app/live-runtime.js, app/app.js, primitives.test.mjs, shell.test.mjs, P028 revision/lifecycle tests |

- Repository verification now includes npm run test:p032 under native Node. The pinned Firefox workflow also runs these P032 suites ahead of packaged-XPI probes.
- The new receipt API and native test suite passed repository verification at implementation checkpoint 801cacf5e8c8936d203a150fc0927abb27ebce4e: https://github.com/Neb963/persona-monkey-pcms/actions/runs/37701975348.
- The subsequent orphaned-PENDING correction at cae150254b006fd178f0b7ffac2e6dac57c73f33 is NOT covered by that earlier CI run. Independent verification on the final head is still required.
- Historical pre-amendment implementation checkpoint d5f76d0adb31422ba0d9292d9f6afbc9b5067ad1 passed repository verify run 37695873000 and pinned Firefox run 37695873021. Fourteen earlier P032 test bodies also passed a V8 shimming harness, not native Node; that evidence is superseded by explicit test:p032 CI.
- The old A032-02 blocker was confirmed: second/reopened tabs saw no receipts from the first tab using the P028-only response protocol. Its root cause is addressed by the amended claim and Core read-only receipt-list facade, not by UI-owned state or raw storage access.
- Hosted pinned Firefox CI is distinct from final provider-live testing, reserved for P043/P044. No successor phase is started.

## Final integration and acceptance evidence

- Final P032 PR head: d28affccad9b30a5fa94c815cc4ce0fb7096f7c1.
- Native P032 tests and repository verification: [verify run 37706520958](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37706520958), **PASS**.
- Exact pinned Firefox Developer Edition: [run 37706521058](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37706521058), **PASS**, including isolated A032-02 packaged two-tab, all-tabs-closed/background-unload/reopen receipt visibility proof, and inherited P027/P029/P030 packaged probes.
- Earlier shared-run navigation failures affected a later packaged probe. Isolating the new P032 packaged test onto a separate runner restored the P027/P029/P030 job sequence. No P029 runtime sources were changed.
- Scope audit: epoch 1 ACTIVE at integration, 20 modified paths within P032 claim ownership, branch zero behind main, no migrations or successor implementation.
- [PR #42](https://github.com/Neb963/persona-monkey-pcms/pull/42) merged with exact expected head at 76ac9e7239ef58ddbcacb4dde85d5023930ee270.
- This governance update transitions the claim and plan to ACCEPTED and regenerates status/roadmap views; no runtime changes.
