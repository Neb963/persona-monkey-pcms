# P003 — PCMS namespace/UI entry + internal Persona Broker contract

Status: **CI_VERIFIED on implementation checkpoint**

Implementation checkpoint: `cac005555b374ad303a07f85f04567c8b24cc5ac`.

## A003-01 — Persona Broker contract

P003 defines a transport-neutral Persona Broker contract at
`extension/pcms/core/persona-broker-contract.js`.

The contract preserves the authoritative PersonaMonkey Integration API v1 semantics without importing PersonaMonkey service objects:

- contract version: **1**;
- durable Persona identity: **`personaUid`**;
- command catalog: **55 commands**;
- stable error vocabulary: **43 codes**;
- mutation/side-effect fencing: operation ID plus exact boot/revision precondition;
- Direct, destructive, External Automation and executable-install authority metadata retained per command;
- retry semantics retained per command;
- prototype-inherited command names are rejected.

Direct verification against the checked-in
`extension/lib/management-integration-protocol.js` at the implementation checkpoint passed all 55 command semantic comparisons and all 43 stable error-code comparisons.

## A003-02 — PCMS namespace and UI entry

P003 adds a derivative PCMS Core surface without modifying the frozen PersonaMonkey Management compatibility UI:

- `extension/pcms/core/bootstrap.js` installs an immutable `PCMS` namespace;
- repeated installation is idempotent;
- namespace collisions fail closed;
- the namespace exposes the broker contract/version/counts but marks its implementation **`pending-P009`** rather than pretending browser authority exists;
- `extension/pcms/app/index.html` is the new PCMS product entry page and loads only the PCMS bootstrap.

Boundary verification passed for the new PCMS JavaScript surface:

- no raw `browser.*`;
- no native messaging;
- no IndexedDB access;
- no PersonaMonkey service/module imports;
- no legacy `PCMS_REQUEST` / `PCMS_EVENTS` management transport.

The imported `extension/pcms/index.html`, `pcms.js`, and `pcms.css` remain untouched PersonaMonkey compatibility files.

## A003-03 — contract parity and regression coverage

Added:

- `tests/pcms/p003-contract-parity.test.mjs`;
- `tests/pcms/p003-bootstrap.test.mjs`;
- `tests/pcms/p003-boundary.test.mjs`.

The committed tests cover Integration-v1 semantic parity, request fencing, stable error codes, immutable namespace/bootstrap behavior, fail-closed namespace collision handling, authority-boundary restrictions, and separation from the frozen P002 upstream blob set.

A direct verification harness executed the committed P003 source at
`cac005555b374ad303a07f85f04567c8b24cc5ac` and passed:

- **55/55** command semantic parity checks;
- **43/43** error-code parity checks;
- side-effect request fencing;
- namespace/bootstrap invariants;
- raw-authority boundary checks;
- P002 frozen-upstream separation;
- acceptance coverage for **A003-01, A003-02, A003-03**.

The current repository workflows do not discover `tests/pcms/**`; therefore this evidence does **not** claim that those three phase-specific test files ran inside GitHub Actions. P003 does not own `.github/**` or `package.json`, so CI wiring was not widened outside the claim.

## Independent regression CI

The exact implementation checkpoint passed the repository's existing independent workflows:

- `verify` push run **37234561189** — **success**;
- pinned Firefox Developer Edition push run **37234561175** — **success**.

These workflows independently verify repository governance, frozen PersonaMonkey baseline integrity, and pinned Firefox regression. They are recorded separately from the direct P003 phase verification above.

## Scope review

Diff from the durable P003 claim checkpoint
`7a7e877862485d2d5b3fa607da645f58d33b6877` to implementation checkpoint
`cac005555b374ad303a07f85f04567c8b24cc5ac`:

- **8 files changed**;
- all paths are within `extension/pcms/**` or `tests/pcms/**`;
- **0** frozen PersonaMonkey blobs modified;
- **0** paths outside P003 product ownership.

No live provider, Mullvad, Perchance, or Firefox DevTools MCP testing is claimed for P003.
