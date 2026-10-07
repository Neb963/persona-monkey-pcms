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

Result: **11 tests passed, 0 failed**.

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
- Firefox ESR popup sizing regression: the toolbar popup body has a stable intrinsic width and no viewport-dependent `min()`/`100vw` sizing.

## Independent branch CI

Exact implementation/test checkpoint `8606eca5d08d1441465ae8f879aa1b01e283af9a` passed:

- repository verification run **37500830402** — success;
- pinned Firefox Developer Edition run **37500830471** — success.

The root workflows are independent regression/FDE evidence. They do not substitute for P026 LIVE acceptance.

A live Firefox ESR operator report then exposed a toolbar-popup sizing defect: the popup collapsed to a narrow vertical strip while Firefox Developer Edition rendered it normally. The corrective implementation checkpoint `645b872ce595c94a6f058639025994e288b13600` replaces the circular viewport-relative body sizing with a fixed 370px preferred body width while retaining the existing narrow-layout media rules. The frozen upstream popup CSS is preserved under `docs/upstream/source/`, and the derivative is explicitly recorded in the import manifest.

Corrective checkpoint CI:

- pinned Firefox Developer Edition run **37612345475** — success;
- repository verification run **37612345507** — success.

The operator still needs to retest the corrected candidate in Firefox ESR; the deterministic FDE run does not substitute for that live ESR observation.


A later live Firefox ESR operator pass exposed an Accounts binding usability defect. The original P026 controls rendered mutation feedback inside the Overview view, so an Accounts failure could appear as a dead button. The correction at branch checkpoint `a8eae5776214958c7dc630b93b3f654171f47667` keeps live-action feedback visible across routes and replaces manual account-binding `personaUid` entry with a bounded read-only `persona.list` selector showing the managed Persona name and current container projection. A first local test build also exposed a duplicate DOM id between Provisioning and Accounts; the published checkpoint regression requires the Accounts selector ids to be unique and keeps Provisioning's separate Persona UID field unchanged.

Corrective checkpoint CI:

- pinned Firefox Developer Edition run **37643918042** — success;
- repository verification run **37643918045** — success.

The account binding interaction still requires operator retest in the normal non-Marionette Firefox ESR session before it counts as LIVE acceptance.

## P026 live candidate

The accepted P025 XPI `e316e2fd6d52f359d865b9c396a7af9e47d9ea99337fc9de7330e24bb2e469e8` remains the frozen package baseline. The original P026 live candidate was superseded after the Firefox ESR popup defect was observed. The corrected candidate contains the ten prior P026 production changes plus byte-exact branch blob `extension/popup/popup.css` (`726ab9deb6a44ec186e6731cb4834605b52fc80b`); no other packaged file changed from the prior P026 candidate.

Candidate identity:

- version: **1.2.0**;
- Gecko ID: **persona-route-manager@local**;
- candidate SHA-256: `b282a94cba816fc91a8453af393c009c5c1b4f100b61e9300544ab5dfd98b64e`.

Packaging checks actually run:

- two independent deterministic archive builds produced the same SHA-256;
- ZIP integrity passed;
- manifest version/Gecko ID passed;
- all packaged `pcms/**` and `pcms-modules/**` JavaScript import edges resolve;
- zero bare module specifiers were found in the packaged PCMS graph;
- packaged `pcms-modules/**` contains no stale `../../extension/pcms/` import;
- Node syntax checks passed for every changed P026 JavaScript file;
- archive-tree comparison against the prior P026 candidate found exactly one changed packaged file (`popup/popup.css`); against accepted P025 the corrected candidate has the ten prior P026 production changes plus this popup CSS correction.

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
