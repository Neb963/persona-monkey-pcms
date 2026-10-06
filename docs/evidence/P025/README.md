# P025 — Live acceptance 1

Phase state: **MERGED — manual LIVE evidence pending**.

## Production-wiring blocker found before live acceptance

Source inspection of the P024 release candidate showed that the real PCMS page existed but production startup mounted an `emptyProjection`, the accepted P014–P019 feature sources were outside the XPI build root, and no production Persona Broker transport connected PCMS to PersonaMonkey Integration v1.

P025 therefore repaired the release wiring before asking the operator to perform live acceptance.

## Implemented release-wiring scope

- added a dedicated same-extension PCMS transport into the existing PersonaMonkey Integration-v1 dispatcher;
- gave built-in PCMS a stable first-party principal while retaining the existing local Direct, destructive, external-automation and executable-install authority flags;
- booted PCMS with real IndexedDB-backed Core storage, Audit Journal, RemoteOps/recovery, module registry/runtime, HumanTasks and Accounts projections;
- required a successful read-only `system.status` Persona Broker request before declaring the live bridge connected;
- packaged the accepted top-level `pcms-modules/` sources into the XPI;
- exposed the Perchance Central Management System page from the toolbar popup;
- preserved the four original PersonaMonkey blobs under `docs/upstream/source/**` and recorded the derivative files separately, so the frozen upstream build remains byte-identical.

No live Perchance mutation driver is fabricated in P025. Representative external mutations remain P026 and must preserve RemoteOperation/reconciliation rules.

## Deterministic verification

Final PR head `f3af60f7bd1db4f9de4dbf0b156e4ceaf357e2b9` passed:

- repository verification run **669** / run id **37433547602** — **success**;
- pinned Firefox Developer Edition run **664** / run id **37433547598** — **success**.

Focused release workflow run **37433770962** from the exact PR-head product tree passed:

- **3/3** P025 wiring tests;
- **3/3** upstream-integrity checks;
- exact frozen PersonaMonkey baseline rerun, including frozen XPI SHA-256 `928b94a871d70455e42c2a8269a7adec27c59b3c5937e7618f80da218fb126e1`;
- derivative XPI reproducibility across UTC and Europe/Warsaw;
- ZIP integrity and explicit presence of shipped P014 and P019 module files.

Derivative P025 XPI:

- version: **1.2.0**;
- Gecko ID: **persona-route-manager@local**;
- SHA-256: `2f54280f96f08013c9499566e3044edfa98a3609966ff1ea734f71b54e8a0cc6`;
- artifact id: **11398500959**;
- artifact ZIP digest: `sha256:6a176099a25bae2f63877d94f8a5c498f95d2afdd8027ede2155408168209261`.

PR #27 merged as `a3bd79c9d469e94210d9d235a16ea0fa6a3d1d16`.

The exact merged-main commit passed:

- repository verification run **670** / run id **37433938459** — **success**;
- pinned Firefox Developer Edition run **665** / run id **37433938488** — **success**.

## LIVE acceptance still required

- **A025-01:** pending manual installed-FDE evidence.
- **A025-02:** pending manual Persona/Mullvad continuity evidence.
- **A025-03:** pending manual Perchance session/provider compatibility evidence.

P025 must not be marked `ACCEPTED`, and P026 must remain `BLOCKED`, until all three LIVE acceptance IDs are supported by real operator evidence.
