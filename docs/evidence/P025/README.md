# P025 — Live acceptance 1

Phase state: **IN PROGRESS — corrective candidate required after operator rejection**.

## Operator rejection of the first P025 candidate

The first P025 candidate XPI, SHA-256 `2f54280f96f08013c9499566e3044edfa98a3609966ff1ea734f71b54e8a0cc6`, is **superseded and must not be used for acceptance**.

Although it contained PCMS source files, live operator inspection correctly found that the installed product still presented itself as **PersonaMonkey Route Manager** and exposed only a thin Accounts/Attention projection shell. The accepted Explorer, Deployer, Refresher, Statistics and Provisioning modules were packaged but not presented as the actual PCMS product surface.

That is a P025 clean-install/product-surface failure, not a cosmetic issue.

## Corrective scope

The corrective P025 candidate:

- installs as **PersonaMonkey PCMS**;
- uses **PersonaMonkey PCMS** as the toolbar action title;
- routes the add-on Preferences entry directly to `pcms/app/index.html`;
- makes **Open PCMS** the primary popup action while retaining a separate PersonaMonkey settings link;
- boots the accepted P023 full module integration composition rather than the reduced Accounts-only live core;
- injects the accepted P014–P019 feature factories into the production composition root;
- presents live read-only module surfaces for Explorer, Deployer, Refresher, Statistics and Provisioning, plus Accounts, Attention and Search;
- keeps provider mutations fail-closed in P025; representative real mutations remain P026;
- retains PersonaMonkey as the sole authority for browser/page execution, personas, routing, Mullvad and control leases through Integration-v1 semantics;
- preserves frozen PersonaMonkey source identities separately from explicit derivative overlays.

## Acceptance status

- **A025-01:** previous candidate rejected; corrective candidate not yet tested live.
- **A025-02:** pending corrective-candidate live Persona/Mullvad continuity evidence.
- **A025-03:** pending corrective-candidate live Perchance session/provider compatibility evidence.

P025 must not be marked `ACCEPTED`, and P026 must remain `BLOCKED`, until the corrective XPI passes all three LIVE acceptance IDs.
