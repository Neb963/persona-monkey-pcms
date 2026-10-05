# P021 — PCMS UI shell / notifications / search evidence

Phase state: **IN_PROGRESS**.

## Implemented scope

P021 turns the derivative PCMS entry page into a bounded, read-only shell without creating a second operational authority.

- semantic Overview / Attention / Accounts / Search navigation;
- Attention notifications projected only from accepted P012 `HumanTask.listAttention()`;
- Account projection sourced only from accepted P014 `Accounts.listAccounts()`;
- deterministic bounded search across non-secret Account identity fields and open HumanTask title/kind/priority/subject metadata;
- HumanTask instructions and arbitrary operator payloads are not indexed or rendered by search;
- no `cookieStoreId` is retained or searched as account identity;
- internal deep links use an explicit fragment grammar for Overview, Attention, Accounts, and Search;
- entity deep links are canonical, percent-encoded, and validated against the current projection before display;
- stale entity links fail closed to Overview rather than authorizing an operation;
- unknown routes, external URLs, extra query parameters, controls, and malformed encodings are rejected;
- dynamic UI content is assigned with DOM text nodes/`textContent`, not `innerHTML`;
- the shell performs no HumanTask resolution, Account mutation, browser/native/network operation, raw IndexedDB access, or PersonaMonkey-internal access.

The accepted repository does not yet have the P023 cross-module composition root that supplies live Accounts/HumanTask instances to the extension page. P021 therefore keeps data sources injectable and the standalone P021 entry page mounts the same shell against empty read-only sources. P023 owns the later cross-module wiring; P021 does not invent an interim privileged transport.

Implementation files:

- `extension/pcms/app/errors.js`
- `extension/pcms/app/deep-links.js`
- `extension/pcms/app/projections.js`
- `extension/pcms/app/app.js`
- `extension/pcms/app/index.html`
- `extension/pcms/app/app.css`

Focused tests:

- `tests/pcms/p021/harness.mjs`
- `tests/pcms/p021/projections.test.mjs`
- `tests/pcms/p021/deep-links.test.mjs`
- `tests/pcms/p021/boundary.test.mjs`

## Acceptance mapping

### A021-01 — navigation / attention shell

Covers semantic navigation, deterministic priority ordering, notification/account badges, critical count, read-only P012/P014 source boundaries, and shell DOM structure.

### A021-02 — search / projections

Covers AccountId/display name/personaUid/provider search, open HumanTask title/kind/priority/subject search, deterministic ranking and result bounds, omission of HumanTask instructions, rejection of malformed/accessor-shaped source data, and fixed projection failure errors.

### A021-03 — deep-link safety

Covers canonical internal fragment construction/parsing, percent-encoded entity IDs, stale-entity rejection, bounded query normalization, and rejection of external/unknown/injection-like links and extra parameters.

## Verification status

Focused exact-source execution and independent Actions evidence will be recorded after the committed test checkpoint is published.

The repository root `npm run verify` does not auto-discover `tests/pcms/p021/*.test.mjs`; root Actions are independent repository/claim/upstream/Firefox evidence rather than the focused P021 behavior run.

No P025/P026 LIVE evidence is claimed.
