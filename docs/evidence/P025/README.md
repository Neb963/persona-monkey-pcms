# P025 — Live acceptance 1

Phase state: **IN PROGRESS — manual LIVE evidence pending**.

## Production-wiring blocker found before live acceptance

Source inspection of the P024 release candidate showed that the real PCMS page existed but production startup mounted an `emptyProjection`, the accepted P014–P019 feature sources were outside the XPI build root, and no production Persona Broker transport connected PCMS to PersonaMonkey Integration v1.

P025 therefore first repairs the release wiring before asking the operator to perform live acceptance.

## Deterministic release-wiring scope

- adds a dedicated same-extension PCMS transport into the existing PersonaMonkey Integration-v1 dispatcher;
- gives built-in PCMS a stable first-party principal while retaining the existing local Direct, destructive, external-automation and executable-install authority flags;
- boots PCMS with real IndexedDB-backed Core storage, Audit Journal, RemoteOps/recovery, module registry/runtime, HumanTasks and Accounts projections;
- requires a successful read-only `system.status` Persona Broker request before declaring the live bridge connected;
- packages the accepted top-level `pcms-modules/` sources into the XPI;
- exposes the Perchance Central Management System page from the toolbar popup;
- records the four necessary PersonaMonkey/upstream file edits as explicit derivative overlays while retaining their frozen upstream blob identities.

No live Perchance mutation driver is fabricated in P025. Representative external mutations remain P026 and must preserve RemoteOperation/reconciliation rules.

## Acceptance status

- **A025-01:** pending manual installed-FDE evidence.
- **A025-02:** pending manual Persona/Mullvad continuity evidence.
- **A025-03:** pending manual Perchance session/provider compatibility evidence.

P025 must not be marked ACCEPTED, and P026 must remain BLOCKED, until all three LIVE acceptance IDs are supported by real operator evidence.
