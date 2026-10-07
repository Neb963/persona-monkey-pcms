# P032 — PCMS dashboard shell v2 as UI client

State at this checkpoint: **COMMITTED · independent CI pending**

- Claim: `CLM-P032-001`, epoch **1**, owner `gpt-5-6-sol`.
- Claim base: `4d1dfb314fef2f64bf5e89c67f6060c8d897d899`.
- Implementation branch: `agent/gpt-5-6-sol/p032-t032-1`.
- Product/test checkpoint: `d86d9660581a1f6f18def357504ab168df866fd3`.
- Accepted contract read: `pcms.ui-client/v1` at P028 checkpoint
  `401fa524225b35c45eaf239112974c27492d3bbc`; its current contract blob remains
  `4c33e91607f710cb52feb09b352d75cf87c5d8d1`.
- No contract writes, resources or migration slots were added.

## Implemented scope

### T032.1 — shell, tokens, primitives and router v2

- Added a closed v2 route grammar for Overview, Attention, Accounts, Generators, module pages, Activity,
  Settings sections and Search.
- Legacy `#/modules` and empty/root links canonicalize to v2 destinations.
- Invalid, stale entity and unavailable-module links fail closed to Overview with a visible reason.
- Added the shared status-token vocabulary and rehosted the accepted P026 views into the v2 shell.
- Existing Accounts/module operator forms remain in place; P033 module contributions and P034 Accounts redesign
  are intentionally not implemented.

### T032.2 — Core status, receipts and Attention

- The dashboard UI client exposes bounded receipt projections returned by the already accepted durable
  `pcms.ui-client/v1` command path. No new operation or receipt store was invented.
- HumanTasks remain the durable operator handoff and are projected into the action tray.
- Local action feedback is keyed per action/subject instead of overwriting one global `Working…` state.
- Focused integration coverage proves the existing durable receipt is replayed consistently across independent
  clients and remains after those clients disappear; HumanTasks are likewise visible to a newly constructed client.

### T032.3 — Diagnostics and multi-tab behavior

- Core/Broker technical fields moved from Overview to `#/settings/diagnostics`.
- Cached `pcms.status.v1` is presented as **Idle** until a live request proves **Running**; initialization failure
  is **Unavailable**. Starting remains an explicit transient state.
- Projection refresh remains driven by the P028 `storage.session` revision signal. P032 adds no polling or
  UI operation timer.
- Receipt and revision subscriptions are tab-local listeners only; closing a dashboard does not construct,
  own or keep alive Core.

## Acceptance mapping

| Gate | Evidence in this checkpoint |
| --- | --- |
| A032-01 | `router-v2.js`; `routes.test.mjs`; `shell.test.mjs`; dashboard source boundary scan |
| A032-02 | durable P028 receipts + P012 HumanTasks; `durability.test.mjs`; subject-scoped action tray; no global Working state |
| A032-03 | cached/live Core presenter; Diagnostics page; revision subscription; no UI polling |

## Verification performed before PR

An exact-blob syntax/static pass was run against checkpoint `d86d9660581a1f6f18def357504ab168df866fd3` through the connected repository API:

- all modified P032 app JavaScript and all `tests/pcms/p032/*.test.mjs` parsed successfully after module-import stripping;
- exactly one `renderOverview` implementation exists;
- `app.js` uses `resolvePcmsRouteV2` and no longer uses the legacy parser;
- `runtime.subscribe((revision) => …)` remains the refresh trigger and `app.js` contains no `setInterval`;
- `live-controls.js` contains no generic `Working…` / `Working...` state;
- Diagnostics and action-tray DOM are present, accepted P026 control IDs are retained, and there are no duplicate IDs.

A normal network checkout is unavailable in this execution container, so this document does **not** claim a local
Node execution of the P032 test files. The phase-owned paths do not include `package.json` or workflow files, so
P032 does not alter CI merely to make its new tests auto-discoverable. Independent PR workflows and their exact
run IDs will be recorded here after they complete.

## Scope boundary

No successor phase was started. In particular, this checkpoint adds no P033 module contribution contract, no P034
Accounts redesign, no P035 popup work, no timer ownership, no module lifecycle changes and no migration.
