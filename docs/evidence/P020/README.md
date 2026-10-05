# P020 — Backup/restore + retention evidence

Phase state: **IN_PROGRESS**.

## Implemented scope

P020 adds privileged PCMS Core backup/restore mechanics without exposing raw IndexedDB to modules.

- storage broker gains a Core-only administrative surface for canonical all-record snapshot validation and atomic full replacement;
- IndexedDB replacement clears and rewrites the PCMS record store inside one readwrite transaction;
- backup envelopes are bounded, deterministic, SHA-256 integrity protected, and exclude `core.recovery` plus `core.backups` so restore cannot overwrite its active recovery hold or recursively capture retention metadata;
- staged restore verifies integrity before mutation;
- restore enters durable `RECOVERY_HOLD` before quiescing active module runtimes or replacing state;
- active/DRAINING runtimes are drained/fenced through the accepted P011 runtime broker before replacement;
- restored ACTIVE/DRAINING generations are recovered/fenced after replacement;
- restored DISPATCHING RemoteOperations become UNCERTAIN/INTERRUPTED and are never blindly replayed;
- reconciliation cancels PREPARED/RETRYABLE work, reconciles UNCERTAIN work through ProviderGate, and releases the hold only when module generations, Persona bindings, provider capabilities, and unresolved RemoteOperations are all clear;
- UNKNOWN provider reconciliation remains held;
- retention planning deterministically keeps the newest bounded set of backups;
- secret values remain outside ordinary PCMS storage and therefore outside these snapshots; opaque SecretRefs may remain as ordinary references.

Implementation files:

- `extension/pcms/storage/indexeddb-backend.js`
- `extension/pcms/storage/storage-broker.js`
- `extension/pcms/recovery/errors.js`
- `extension/pcms/recovery/schema.js`
- `extension/pcms/recovery/retention.js`
- `extension/pcms/recovery/backup-restore.js`

Focused tests:

- `tests/pcms/p020/backup-restore.test.mjs`
- `tests/pcms/p020/retention.test.mjs`
- `tests/pcms/p020/storage-admin.test.mjs`
- `tests/pcms/p020/boundary.test.mjs`
- `tests/pcms/p020/harness.mjs`

## Acceptance mapping

### A020-01 — snapshot / backup / retention

Covers canonical full-state snapshotting, excluded recovery namespaces, SHA-256 integrity, tamper rejection, durable revision/timestamp preservation, storage-record validation, and deterministic bounded retention.

### A020-02 — staged restore

Covers integrity verification before mutation, RECOVERY_HOLD before runtime quiescing/replacement, accepted runtime lifecycle fencing, preservation of excluded recovery metadata, atomic storage replacement, and failure remaining held.

### A020-03 — RECOVERY_HOLD reconciliation

Covers restored DISPATCHING → UNCERTAIN recovery, cancellation of safe PREPARED/RETRYABLE operations instead of replay, ProviderGate reconciliation for UNCERTAIN operations, UNKNOWN remaining held, module-generation reconciliation, Persona-binding/provider-capability gates, and release only after zero unresolved RemoteOperations.

## Verification status

Focused exact-source execution and independent Actions evidence will be recorded after the committed test checkpoint is published.

The repository root `npm run verify` does not auto-discover `tests/pcms/p020/*.test.mjs`; root Actions are independent repository/claim/upstream/Firefox evidence rather than the focused P020 behavior run.

No P025/P026 LIVE evidence is claimed.
