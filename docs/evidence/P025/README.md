# P025 — Live acceptance 1

Phase state: **MERGED — corrective candidate ready for manual LIVE acceptance**.

## Rejected first candidate

The first P025 candidate XPI, SHA-256 `2f54280f96f08013c9499566e3044edfa98a3609966ff1ea734f71b54e8a0cc6`, is **superseded and rejected**.

Live operator inspection found that it still presented primarily as PersonaMonkey Route Manager and exposed only a thin PCMS shell. That candidate must not be used for acceptance.

## Corrective implementation

The corrective P025 build:

- installs as **PersonaMonkey PCMS**;
- uses **PersonaMonkey PCMS** as the toolbar action title;
- routes add-on Preferences directly to `pcms/app/index.html`;
- makes **Open PCMS** the primary popup action while retaining a separate PersonaMonkey settings link;
- boots the accepted P023 full module integration composition;
- injects the accepted P014–P019 factories into the production composition root;
- exposes live read-only module surfaces for Explorer, Deployer, Refresher, Statistics and Provisioning, plus Accounts, Attention and Search;
- keeps provider mutation drivers fail-closed in P025; representative real mutations remain P026;
- preserves PersonaMonkey as the sole authority for browser/page execution, personas, routing, Mullvad and control leases via Integration-v1 semantics;
- keeps the frozen PersonaMonkey baseline byte-identical by snapshotting explicit derivative overlays.

## Verification

Corrective PR head `832bd262660ade3403da45359980f198078b786a` passed:

- repository verification run **700** / run id **37437154338** — **success**;
- pinned Firefox Developer Edition run **695** / run id **37437154406** — **success**.

Focused corrective release workflow run **37437228734** passed:

- **9/9** P021/P025 focused tests;
- **3/3** upstream-integrity checks;
- exact frozen PersonaMonkey baseline rerun with original XPI SHA-256 `928b94a871d70455e42c2a8269a7adec27c59b3c5937e7618f80da218fb126e1`;
- derivative XPI reproducibility across UTC and Europe/Warsaw;
- ZIP integrity;
- installed manifest identity `PersonaMonkey PCMS`;
- Preferences target `pcms/app/index.html`;
- popup contains `Open PCMS`;
- module dashboard contains Explorer, Deployer, Refresher, Statistics and Provisioning;
- P014–P019 module files are present in the XPI.

Corrective XPI:

- version: **1.2.0**;
- Gecko ID: **persona-route-manager@local**;
- SHA-256: `0ca203d9b63aa98897807efc546810cf6593a1f48e4e3c6ff6e8fe4ff6c07b03`;
- artifact id: **11399449572**;
- artifact ZIP digest: `sha256:5e9823f7b4f950c53d46083e2ce7c2423ec2c60176f6085f6219eb47a101fd05`.

PR #29 merged as `f7bf3af605f9f5e726cd26207e88d9a5c6bff2f5`. The PR-head product tree and merge product tree are identical.

Merged main `f7bf3af605f9f5e726cd26207e88d9a5c6bff2f5` passed:

- repository verification run **701** / run id **37437426128** — **success**;
- pinned Firefox Developer Edition run **696** / run id **37437426096** — **success**.

## LIVE acceptance still required

- **A025-01:** corrective candidate pending manual clean-install/product-surface evidence.
- **A025-02:** pending manual Persona/Mullvad continuity evidence.
- **A025-03:** pending manual Perchance session/provider compatibility evidence.

P025 must not be marked `ACCEPTED`, and P026 must remain `BLOCKED`, until all three LIVE acceptance IDs pass on the corrective XPI.
