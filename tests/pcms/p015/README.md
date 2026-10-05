# P015 — Deployer module evidence

Phase state: **IN_PROGRESS**.

## Implemented scope

P015 adds a bounded Deployer feature module under `pcms-modules/p015/**`.

- durable Deployment identity owns exactly one stable Perchance generator target;
- desired state stores a monotonic desired revision and SHA-256 source hash, never source bytes;
- observed state advances only after a confirmed applied RemoteOperation;
- account identity is durable `AccountId`; provider execution is resolved through an account-scoped ProviderGate;
- mutation intent uses the accepted P013 `generator.update` action and stable generator target identity;
- module state is moved to ACTIVE before ProviderGate dispatch, preventing concurrent desired-state changes from racing an in-flight mutation;
- ambiguous outcomes enter RECONCILE and cannot be retried until RemoteOps reconciliation proves the outcome;
- reconciled NOT_APPLIED reuses the same RETRYABLE RemoteOperation; direct NOT_APPLIED requires a new durable operation identity before another dispatch;
- restart-style ACTIVE state can be recovered from authoritative RemoteOperation state;
- the module exposes a read-only UI projection with sync state and permitted actions, without adding DOM/browser authority.

## Acceptance mapping

### A015-01 — desired/observed model

Covers durable target ownership, desired revision/hash, confirmed observation, source-byte exclusion, account/provider validation, target uniqueness and CAS fencing.

### A015-02 — stable target mutation

Covers account-scoped ProviderGate execution, accepted Perchance `generator.update` contract use, stable target/intent fingerprinting, transient source hash verification, durable RemoteOperation identity and safe retry identity.

### A015-03 — reconciliation/UI

Covers post-apply and pre-apply ambiguity, reconcile-before-retry, restart recovery, blocked desired changes while outcome is unresolved, and deterministic UI-ready status/action projection.

No live provider, Firefox DevTools MCP, raw browser/native API, guessed Perchance selector, or successor-phase behavior is included.
