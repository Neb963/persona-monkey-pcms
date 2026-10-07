# P032 — PCMS dashboard shell v2 as UI client

Evidence state: **COMMITTED · inherited CI PASS · A032-02 BLOCKED · PR #42 DRAFT**

- Claim: `CLM-P032-001`, epoch **1**, owner `gpt-5-6-sol`.
- Claim base: `4d1dfb314fef2f64bf5e89c67f6060c8d897d899`.
- Implementation branch: `agent/gpt-5-6-sol/p032-t032-1`.
- Original product/test checkpoint: `d86d9660581a1f6f18def357504ab168df866fd3`.
- Bootstrap/unavailable-shell fix checkpoint: `d5f76d0adb31422ba0d9292d9f6afbc9b5067ad1`.
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
- **Gap:** these checks verify Core persistence, not that the action tray can enumerate completed/failed receipts
  created by another tab after a close/reopen. The accepted UI-client contract has no read-only receipt-list RPC.

### T032.3 — Diagnostics and multi-tab behavior

- Core/Broker technical fields moved from Overview to `#/settings/diagnostics`.
- Cached `pcms.status.v1` is presented as **Idle** until a live request proves **Running**; initialization failure
  is **Unavailable**. Starting remains an explicit transient state.
- Projection refresh remains driven by the P028 `storage.session` revision signal. P032 adds no polling or
  UI operation timer.
- Receipt and revision subscriptions are tab-local listeners only; closing a dashboard does not construct,
  own or keep alive Core.
- Fixed a duplicate `bootPcmsApp()` invocation; exactly one dashboard client is now initialized per tab.
- Added a read-only navigation/Diagnostics fallback when Core bootstrap is unavailable, disabling existing mutation forms.

## Acceptance mapping

| Gate | Evidence in this checkpoint |
| --- | --- |
| A032-01 | `router-v2.js`; `routes.test.mjs`; `shell.test.mjs`; dashboard source boundary scan |
| A032-02 | **BLOCKED**: Core receipts and HumanTasks persist, but other tabs and reopened tabs cannot enumerate prior receipt records through `pcms.ui-client/v1`. `durability.test.mjs` records the pending cross-tab tray acceptance gate. |
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
P032 does not alter CI merely to make its new tests auto-discoverable.

## Independent PR verification

PR **#42** verified checkpoint `4c9b1f79cd29da7271283902b8fe4fcf09aa2623` successfully:

- repository `verify`: run **37694604631**, job **113043096361** — **PASS**;
- `firefox-developer-edition`: run **37694604595**, job **113043095959** — **PASS**.

The pinned-Firefox job passed the inherited P026 regression suite, P028 background Core/UI protocol suite, P030
sandbox suite, the packaged-XPI lifecycle/platform probe, and the runtime-supplied sandbox-controller probe. The
packaged-XPI probe opens the real `pcms/app/index.html`, exercises two dashboard clients against one background
Core, closes all PCMS tabs, wakes Core again with zero dashboards, and restarts the profile. Thus this run is the
independent browser evidence for the rehost and multi-tab/no-tab guarantees that P032 inherits from P028.

The new `tests/pcms/p032/*.test.mjs` suites remain phase-owned focused regression assets. Existing workflow/package
ownership does not auto-discover them, and P032 intentionally did not broaden its claim to modify CI. Their exact
branch blobs did pass the pre-PR syntax/static invariant check described above.

## Scope boundary

No successor phase was started. In particular, this checkpoint adds no P033 module contribution contract, no P034
Accounts redesign, no P035 popup work, no timer ownership, no module lifecycle changes and no migration.

## Post-PR adversarial review and blocker

A further source audit found two errors not covered by the inherited packaged-XPI checks:

1. `app.js` called `bootPcmsApp()` twice at its tail. This could duplicate UI listeners and control handlers.
   Commit `d5f76d0adb31422ba0d9292d9f6afbc9b5067ad1` removes the second call and adds a regression assertion.
2. The unavailable-Core failure path previously left `primaryNav` empty and Diagnostics hidden. The same commit
   installs a read-only route shell, keeps Diagnostics accessible, and disables P026 mutation forms.

After these corrections, inherited CI passed on the exact implementation-fix checkpoint:

- repository `verify`: [run 37695873000](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37695873000) — **PASS**;
- `firefox-developer-edition`: [run 37695873021](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37695873021) — **PASS**.

Fourteen exact P032 test bodies (router, primitives, UI-client and shell) were also executed against branch source
using a V8 sandbox with Node module/test/readFile assertion shims: **14 PASS, 0 FAIL**. This is narrower than a
native Node test run and does not include `durability.test.mjs`. The checked source is the branch as of
`d5f76d0adb31422ba0d9292d9f6afbc9b5067ad1`.

**Unresolved A032-02 acceptance requirement:** a two-client simulation using the actual
`createPcmsUiClient` implementation and a shared transport produced the following observations:
- tab A command receipt callback: **1**;
- tab B revision callback: **1**, receipt callback: **0**;
- all tabs closed, tab C reopened: receipt callback: **0**;
- background durable receipt record: **1**.

The client only receives receipt projections attached to *its own command responses*. The accepted P028
`pcms.ui-client/v1` operation allow-list exposes no read-only receipt enumeration or lookup. A stored Core
receipt cannot therefore be reconstructed into the action tray after a different tab's command or after
all tabs close. A032-02's full two-tab/reopen acceptance is **not demonstrated and must not be marked accepted**.

**Governance blocker:** supplying a bounded, secret-safe Core receipt-list/read RPC needs contract and background
dispatcher edits (currently owned by P028, outside P032's `extension/pcms/app/**` write scope), plus
independent tests proving cross-tab/reopen consistency. P032's claim has no contract writes. Do not bypass this
by reading raw Core storage, creating a dashboard-owned receipt database, or broadening the claim silently.

**Disposition:** keep PR #42 **draft**, claim epoch 1 **ACTIVE**, and P032 **not ACCEPTED** pending an explicit
contract/ownership allocation. No successor phase was touched or started.
