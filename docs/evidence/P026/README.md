# P026 — Live acceptance 2

Phase state: **LIVE ACCEPTANCE PENDING**.

Implementation checkpoint: `8606eca5d08d1441465ae8f879aa1b01e283af9a`.

This evidence record does not mark P026 or any A026 gate as PASS. The roadmap defines A026-01, A026-02, and A026-03 as LIVE acceptance gates; operator-environment evidence is still required.

## Implemented scope

P026 exposes representative live PCMS operations through the existing accepted module services:

- Accounts bind/rebind and Explorer discovery/reservation controls;
- Deployer and Refresher provider mutations;
- Account Provisioning progression with explicit HumanTask handling;
- backup/restore controls and RECOVERY_HOLD reconciliation/release.

Provider mutations remain behind ProviderGate and durable RemoteOperation identity. Live provider context durably binds the operation to the Account/Persona target. Ambiguous outcomes enter or remain UNCERTAIN and must reconcile before any retry; the UI does not blindly replay them.

Perchance provider effects are intentionally operator-assisted. PCMS opens the target through Persona Broker / Integration v1, displays the desired source/hash where applicable, and requires an explicit operator outcome. CAPTCHA and provider verification remain manual; no CAPTCHA bypass or second browser-automation authority is introduced.

Startup recovery enters durable RECOVERY_HOLD when unresolved RemoteOperations exist before module recovery. Interrupted DISPATCHING operations become UNCERTAIN; recovery may reconcile/cancel but never blindly redispatch them.

## Focused deterministic verification

The exact P026 production blobs and exact P026 test blobs were materialized from the implementation branch and verified against their Git blob identities before execution.

Command actually run with Node **v22.16.0**:

```text
node --test tests/pcms/p026/*.test.mjs
```

Result: **10 tests passed, 0 failed**.

Coverage includes:

- fresh Persona Broker boot/revision preconditions immediately before side effects;
- durable operation-context identity fencing;
- ambiguous generator update -> UNCERTAIN -> explicit reconciliation, with no replay;
- representative provisioning mutation through explicit operator confirmation;
- restart entering RECOVERY_HOLD before module recovery;
- recovery hold blocking new dispatch;
- reconciliation/cancellation without redispatch;
- clean restart remaining NORMAL;
- static authority-boundary checks prohibiting raw browser/native/provider authority;
- backup/restore/recovery controls.

## Independent branch CI

Exact implementation/test checkpoint `8606eca5d08d1441465ae8f879aa1b01e283af9a` passed:

- repository verification run **37500830402** — success;
- pinned Firefox Developer Edition run **37500830471** — success.

The root workflows are independent regression/FDE evidence. They do not substitute for P026 LIVE acceptance.

## P026 live candidate

The accepted P025 XPI `e316e2fd6d52f359d865b9c396a7af9e47d9ea99337fc9de7330e24bb2e469e8` was used as the frozen package baseline. Exactly the ten P026 production files changed by this branch were overlaid with byte-exact branch blobs; no other packaged file differs from the accepted P025 XPI tree.

Candidate identity:

- version: **1.2.0**;
- Gecko ID: **persona-route-manager@local**;
- candidate SHA-256: `76e05412af8157d8765cfb3e765a73ddb945a4697547a4961df05860e0eb95a5`.

Packaging checks actually run:

- two independent deterministic archive builds produced the same SHA-256;
- ZIP integrity passed;
- manifest version/Gecko ID passed;
- all packaged `pcms/**` and `pcms-modules/**` JavaScript import edges resolve;
- zero bare module specifiers were found in the packaged PCMS graph;
- packaged `pcms-modules/**` contains no stale `../../extension/pcms/` import;
- Node syntax checks passed for every changed P026 JavaScript file;
- archive-tree comparison against accepted P025 found exactly ten changed/added files, matching the P026 production diff.

This candidate has **not** yet been counted as LIVE evidence.

## Required LIVE acceptance

### A026-01 — representative mutations

Pending operator evidence in real Firefox Developer Edition + PersonaMonkey/PCMS + Perchance. Exercise representative PCMS paths including at least one real provider mutation in a disposable/safe target, verify the bound Persona/routing is used, and verify the saved provider outcome before choosing Applied.

Where practical, exercise an ambiguous/uncertain outcome and verify PCMS reconciles it rather than replaying the mutation.

### A026-02 — restore/update/recovery

Pending operator evidence. Create a PCMS backup, perform disposable state changes, apply restore, verify RECOVERY_HOLD blocks new mutations, reconcile outstanding state, and release the hold only after checks pass. A restart/recovery case should confirm unresolved mutation state is held and not blindly replayed.

### A026-03 — final human acceptance

Pending operator confirmation that the combined product is usable and acceptable in the real environment, including Persona/Mullvad routing continuity, Perchance compatibility, recovery behavior, and absence of plaintext-secret leakage in normal UI/evidence.

## Current disposition

P026 remains claimed/in progress. Deterministic implementation and candidate preparation are complete enough for operator LIVE testing, but **A026-01 / A026-02 / A026-03 remain pending** until real live evidence is supplied.
