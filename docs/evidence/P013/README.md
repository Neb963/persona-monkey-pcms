# P013 — Perchance provider adapter + emulator

Phase state: **IN_PROGRESS**.

## Implemented scope

P013 implements only provider-boundary mechanics needed before provider-specific modules are introduced:

- strict PCMS-side Perchance driver contract `pcms.perchance.driver/v1`;
- compatibility probe validating provider ID, contract version, and the one established mutation `generator.update`;
- ProviderGate-compatible adapter descriptor for `providerId=perchance`;
- stable generator target identity plus SHA-256 source intent fingerprinting;
- transient source bytes are independently hashed before provider dispatch;
- the validated three-method driver surface is snapshotted at admission, while compatibility is re-probed before each dispatch and reconciliation;
- deterministic in-memory Perchance emulator with explicit pre-apply, post-apply, malformed-outcome, and receipt-loss faults;
- reconciliation returns only `APPLIED`, `NOT_APPLIED`, or `UNKNOWN`, preserving P010's fail-closed RemoteOperation rules.

The phase deliberately does **not** encode guessed Perchance DOM selectors, private endpoints, login mechanics, CAPTCHA handling, Accounts policy, Explorer policy, Refresher policy, or a second browser/userscript authority. A real driver must sit behind the PersonaMonkey execution boundary in later integration/live work.

Implementation files:

- `extension/pcms/providers/perchance/errors.js`
- `extension/pcms/providers/perchance/contract.js`
- `extension/pcms/providers/perchance/adapter.js`
- `extension/pcms/providers/perchance/emulator.js`

Focused tests:

- `tests/pcms/p013-provider.test.mjs`
- `tests/pcms/p013-boundary.test.mjs`

## Acceptance mapping

### A013-01 — compatibility probe

Covers exact contract/provider/operation compatibility, fail-closed incompatible versions, accessor/exotic-object rejection without invoking getters, and re-probing instead of assuming compatibility remains valid.

### A013-02 — deterministic emulator

Covers successful generator update, deterministic pre-apply and post-apply transport ambiguity, explicit operation receipts, retry only after proven `NOT_APPLIED`, and no replay after reconciled `APPLIED`.

### A013-03 — fail-closed adapter

Covers malformed provider outcomes, missing reconciliation evidence remaining `UNKNOWN`, transient source/hash mismatch rejection before driver mutation, strict RemoteOperation state expectations, and static boundary checks excluding raw browser/native/PersonaMonkey/DOM authority.

## Focused verification actually run

Node: **v22.16.0**

Commands:

```text
node --check extension/pcms/providers/perchance/errors.js
node --check extension/pcms/providers/perchance/contract.js
node --check extension/pcms/providers/perchance/adapter.js
node --check extension/pcms/providers/perchance/emulator.js
node --test tests/pcms/p013-provider.test.mjs tests/pcms/p013-boundary.test.mjs
```

Final result: **12 tests passed, 0 failed, exit 0**.

The locally executed P013 blobs were byte-checked against GitHub:

- `errors.js` — `12e92b09a7273533a50d87cebed352b2f2c4c8ee`
- `contract.js` — `2c92451c987a51f1b44edff3e4e24f5f936f6485`
- `adapter.js` — `7c3793619f7b2dc701c11099a57f2ff2ee26031d`
- `emulator.js` — `9334eed35fddc7e87c3177b1c7e7e6669d093ede`
- `p013-provider.test.mjs` — `2957b1e7cce2e5b8e6c88d62c7bcc811387cb6fa`
- `p013-boundary.test.mjs` — `2c8a9e573103944f1baa485943b039eb82c21203`

The integration harness used the accepted P010 RemoteOps, recovery-hold, ProviderGate and RemoteOperation schema logic with the accepted P010 in-memory storage seam. Only the P005 default storage backend import was replaced locally because the focused run injects storage explicitly; no storage behavior under test was mocked.

Implementation checkpoint before this evidence: `f40486831147805562466c693a9f88b1588ce95c`.

Independent GitHub Actions on the final reconciled PR head are still required before merge.
