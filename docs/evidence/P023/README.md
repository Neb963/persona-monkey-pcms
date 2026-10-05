# P023 — Full module integration wave evidence

Phase state: **IN_PROGRESS**.

## Implemented scope

P023 adds a narrow PCMS Core integration layer under `extension/pcms/integration/**`. It composes accepted mechanisms and module factories without moving feature policy into Core.

- shared P005 storage is adapted into bounded singleton/keyed state-store contracts used by P014–P019;
- Persona lookup is adapted only through P009 `persona.get`, preserving `personaUid` as the durable identity;
- account-scoped ProviderGate and RemoteOperation-reader adapters are supplied to Deployer/Refresher;
- Provisioning receives a bounded RemoteControl composed only from ProviderGate mutation/reconciliation plus RemoteOps read;
- real module factories remain injected; Core does not import `pcms-modules/**` or duplicate their policy;
- P012 HumanTask and P014 Accounts instances are wired directly into the accepted P021 UI projection;
- P016 Explorer reservations are materialized into P015 Deployments through an idempotent, fail-closed bridge;
- P018 Statistics consumes the same P007 Audit Journal instance used by shared services;
- P019 Provisioning receives the same Accounts/HumanTask authority surfaces as the rest of the composition;
- P022 module lifecycle is exposed over the accepted package registry/runtime;
- P020 backup/restore is instantiated with recovery checks derived from integrated Account↔Persona reconciliation and provider compatibility probes;
- no raw `browser.*`, native RPC, raw IndexedDB, PersonaMonkey internals, provider transport, or global workflow/scheduler authority is introduced.

Implementation files:

- `extension/pcms/integration/errors.js`
- `extension/pcms/integration/adapters.js`
- `extension/pcms/integration/explorer-deployer.js`
- `extension/pcms/integration/recovery-checks.js`
- `extension/pcms/integration/composition.js`

Focused tests:

- `tests/pcms/p023/harness.mjs`
- `tests/pcms/p023/contracts.test.mjs`
- `tests/pcms/p023/integration.test.mjs`
- `tests/pcms/p023/boundary.test.mjs`

## Acceptance mapping

### A023-01 — cross-module contracts

Covers the shared state-store/CAS adapters, Persona Broker read boundary, construction of the real accepted P014–P019 factories, live Accounts/HumanTask→P021 UI projection wiring, P018 journal sharing, Refresher account integration, and the idempotent Explorer→Deployer materialization contract.

### A023-02 — integration-wave verification

The committed integration suite imports the real accepted P014–P019 factories together with P005/P007/P010/P011/P020/P021/P022 Core surfaces. Static guards prove Core composition does not import feature-policy source or gain browser/native/raw-storage authority.

### A023-03 — combined recovery acceptance

Covers backup of shared Accounts, HumanTask/Audit, Explorer, and Deployer state; post-backup divergence; staged restore under RECOVERY_HOLD; restoration of the shared module/UI projection state; module-generation reconciliation; Account↔Persona reconciliation; provider compatibility checks; hold release only after all checks clear; and Statistics replay from the restored journal tail.

## Verification status

Focused exact-source execution and independent Actions evidence will be recorded after the committed integration checkpoint is published.

The root `npm run verify` workflow does not auto-discover `tests/pcms/p023/*.test.mjs`; root Actions remain independent repository/claim/upstream/Firefox evidence.

No P025/P026 LIVE evidence is claimed.
