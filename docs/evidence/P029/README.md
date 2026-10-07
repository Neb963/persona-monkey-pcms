# P029 — Durable PCMS timers woken by extension alarms

Scope: **P029 only** / T029.1–T029.3. Claim `CLM-P029-001` epoch **1**; branch `agent/gpt-5-6-sol/p029-t029-1`.
Base main `4d1dfb314fef2f64bf5e89c67f6060c8d897d899`, integrated with current main `ee354c07326f13fa9cc3db7563449aaeebac98d4` without overwriting disjoint P032 changes.

## Implementation and invariants

- **A029-01**: `extension/pcms/services/timers.js` extends the accepted P012 audit/CAS state machine with the `pcms.timers.ensure/v1` convergence operation, durable miss reasons and an alarm-rearm hook. The timer service—not `browser.alarms`—remains the authority. `extension/pcms/background/alarms/coordinator.js` maps the earliest scheduled durable due time onto `pcms.timers.next` and maintains a five-minute `pcms.core.heartbeat` alarm; both are recreated on Core start. Duplicate/spurious wake handling is serialized and idempotent.
- **A029-02**: Startup/wake recovers interrupted `DISPATCHING` timers into durable `MISSED` records, then calls declared schedules and runs only a bounded due pass. A declaration can request one catch-up of the interrupted occurrence; other terminal outcomes and old backlog are not replayed. A subsequent alarm continues remaining work with a bounded yield. The sole product declaration in P029 is the Core continuity fixture; no provider mutation or independent module scheduler is introduced.
- **A029-03**: The P029 packaged-XPI harness confirms two forced Firefox event-page suspensions (with no PCMS page left open), next-due alarm wake, a `FIRED` durable record, cold profile restart, alarm recreation, and another unload/wake/fire cycle. `core.timers` evidence is obtained via the existing Core/UI backup protocol, not privileged module IndexedDB access.

## Acceptance evidence

| Gate | Verification |
| --- | --- |
| A029-01 | `tests/pcms/p029/timers.test.mjs`, `alarms.test.mjs`, `host.test.mjs`, `boundary.test.mjs`; inherited P012 timer regression suite |
| A029-02 | Duplicate declarations, overdue `MISSED`, interrupted catch-up once, no `DISPATCHING` takeover, duplicate/spurious alarms and bounded continuation tests |
| A029-03 | `tests/pcms/p029/packaged.mjs` in exact pinned Firefox Developer Edition `154.0b10`, built packaged XPI, zero-PCMS-tab/forced-unload/profile-restart proof |

Independent passing **PR checkpoint**, branch head `387323b77af40c50c64741b1564c6d4ce31f1f6b`:

- [Repository verification run 37696634348](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37696634348): **SUCCESS**.
- [Pinned Firefox run 37696634345](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37696634345): **SUCCESS**; packaged `firefox-packaged-p029` artifact ID **11516085867**, job 113049863291.
- The packaged report is reproduced verbatim in [`packaged-report.json`](./packaged-report.json). It identifies CI's tested PR integration SHA `fe972d301e96cb2d52341a699e6e29a4e0a0f5f3`, browser archive SHA-256 `681913108bba655d7ec6fadfac2731141b23e48dca88d1988a4d95a6bdaff164`, product XPI SHA-256 `5d1a749f746c9a5aaa336968a933b10083022af19885489c5142099954a93615`, and `passed:true`.
- The report records both `forceIdleUnload` outcomes as `stopped`; durable timer revisions advance **1 → 3 (FIRED)** and, after profile restart, **4 → 6 (FIRED)**. All three packaged checks are true. Existing PersonaMonkey alarm `persona-mullvad-idle` remains independent.

The companion push run 37696629432 failed on a redundant immediate check observing a transient `starting` state *after* Firefox's test hook had already returned `stopped`. Commit `d9f54561041e8e842fa47669fafc4ef57c237ddf` eliminates only that race-prone duplicate assertion; it retains explicit confirmation from the Firefox unload hook, timer-state checks and the full two-cycle proof. That later commit requires independent CI before a final state beyond PR_OPEN is justified.

## Constraints and remaining gates

- Work is confined to P029's declared claim paths and the explicitly claimed background/CI wiring; no migration slots and no unrelated module feature work.
- The `core.p029.continuity` callback performs no provider mutation. No Perchance, Mullvad live routing, operator secrets, or production external side effects are used. Hosted pinned-FDE evidence is **not** P043/P044 provider-live acceptance.
- **Status at this evidence checkpoint:** implementation published and PR opened; acceptance gates have a successful packaged checkpoint. Do not represent P029 as `MERGED` or `ACCEPTED` before corresponding governance transitions and merged-main verification.
