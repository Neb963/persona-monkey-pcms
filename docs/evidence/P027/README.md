# P027 — Packaged Firefox harness and platform evidence

Implementation scope: T027.1–T027.3 under CLM-P027-001, epoch 1.

## Acceptance mapping

- **A027-01:** exact Mozilla Developer Edition **154.0b10**, linux-x86_64/en-US; archive SHA-256
  `681913108bba655d7ec6fadfac2731141b23e48dca88d1988a4d95a6bdaff164`.
  Mozilla checksum source: https://archive.mozilla.org/pub/devedition/releases/154.0b10/SHA256SUMS.
  The installer verifies the archive before extraction and checks the executable version. Pre-154 pins fail validation.
- **A027-02:** `PackagedFirefox` persistently installs unsigned XPIs in a disposable test profile, opens/closes
  extension tabs, sets `extensions.background.idle.timeout`, observes background state without waking it, and
  restarts the same profile. A dependency-free Marionette v3 client provides bounded commands, fragmented UTF-8
  framing, correlation and explicit errors. No Firefox DevTools MCP, geckodriver, or Chromium is used.
- **A027-03:** the existing builder supplies the unchanged P026 product XPI. The packaged run checks Integration v1
  connection, all five feature modules, operator controls, IndexedDB backup, two dashboard tabs and persistent
  installation/storage after restart. The workflow also executes the 15 inherited P026 deterministic regressions.
  A separate fixture XPI proves platform assumptions; it is never merged into the product archive.

## Platform probe

The `firefox-packaged-p027` Actions artifact records the exact commit, workflow run, browser/archive hash and
product-XPI hash, plus the following observations:

- default idle timeout and elapsed natural idle unload;
- non-persistent module background with window/document;
- background state with an open extension view, with a view plus MessagePort, and with only a background self-port;
- synchronous message listener wakes a new background context;
- storage.session survives idle unload and clears at browser restart; storage.local persists;
- DOM timer disappears on unload; one same-named replacement alarm fires and wakes a new context;
- alarms clear at browser restart;
- manifest sandbox plus sandbox CSP supports runtime-supplied evaluation, returns opaque-origin messages,
  has no browser/chrome APIs and blocks an actual loopback HTTP fetch (server receives zero requests).

Port results describe these fixture configurations, not a universal liveness guarantee. PCMS must still avoid
relying on ports or views for correctness, as ADR-002 requires. The fixture is platform evidence, not proof of
production module wiring (P030/P031), background-authoritative PCMS (P028), or real provider compatibility.

## ESR decision

Follow accepted ADR-003 default **(b)**: retain `strict_min_version: 153.0` and built-in functionality; runtime
modules must degrade to `UNAVAILABLE · Requires Firefox 154+` below 154 when wired in P030. P027 changes only
CI's pin. It does not claim runtime feature detection is already implemented in the product.

## Verification

Local harness/protocol tests: **5/5**. Firefox contract tests: **5/5**. P026 regressions: **15/15**.
The initial full local packaged run passed; root-container debugging required `MOZ_DISABLE_CONTENT_SANDBOX=1`.
That run is development evidence only. Hosted acceptance must run with the OS content sandbox enabled; the report
records the distinction. Required independent CI and exact final commit/run references are recorded below once
observed. No live provider, Mullvad, account secrets, operator profiles, or routing inputs are used.

Primary platform references:

- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts/Convert_to_non-persistent
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/sandbox
- https://firefox-source-docs.mozilla.org/testing/marionette/Protocol.html

## Independent CI checkpoint

PR #36 head `7b4f96736010c918468ec5d5b0929b958f77d995` passed repository verification
[run 37674154414](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37674154414) and packaged Firefox
[run 37674153753](https://github.com/Neb963/persona-monkey-pcms/actions/runs/37674153753).
The exact tested PR integration commit was `caa9534d15897a3be9439d53f2e668e1f168dd41`.
The report recorded content-sandbox disabling **false**, default unload **30035 ms**, running with an open view
(and with a view plus port), stopped with a background self-port alone, and all storage/alarm/sandbox checks PASS.

The final harness also asserts the product background unloads with zero dashboards, bounds the protocol greeting,
and gives the DOM-timer/old-alarm probes wider timing margins. Those refinements are awaiting final-head CI.
Current state: **PR_OPEN**; no merged/accepted state claimed yet.
