# P019 — Account Provisioning module evidence

Phase state: **IN_PROGRESS**.

## Implemented scope

P019 introduces a module-owned, finite Account Provisioning state machine. It deliberately does not introduce a generic workflow engine, browser automation authority, login endpoint assumptions, or CAPTCHA solver.

- provisioning attempts are bounded durable module state and reference credentials only through opaque P006 `SecretRef` values;
- guarded provider-session identity is fenced by module-visible session key/generation while the transient session handle is never persisted;
- P012 HumanTask is the only CAPTCHA/operator-intervention path; CAPTCHA is never solved or bypassed automatically;
- remote account creation uses a stable `account.provision` operation identity and a RemoteControl boundary that requires durable RemoteOperation state before external dispatch;
- ambiguous outcomes transition to `UNCERTAIN` and cannot be replayed until reconciliation proves `NOT_APPLIED` or `APPLIED`;
- proven pre-dispatch/no-apply retries reuse the same operation identity where possible, while a terminal proven `NOT_APPLIED` retry receives a new operation epoch;
- successful remote provisioning enters idempotent local finalization into the accepted P014 Accounts service; recovery can finish local state without redispatching a successful remote mutation;
- stale guarded sessions invalidate HumanTask progress for mutation purposes and require a fresh guarded session/preflight before provisioning continues;
- module code has no raw `browser.*`, native RPC, IndexedDB, direct network/DOM authority, secret resolution, or CAPTCHA-bypass path.

Implementation files:

- `pcms-modules/p019/errors.js`
- `pcms-modules/p019/schema.js`
- `pcms-modules/p019/provisioning.js`
- `pcms-modules/p019/provider.js`

Focused tests:

- `tests/pcms/p019/schema.test.mjs`
- `tests/pcms/p019/provisioning.test.mjs`
- `tests/pcms/p019/provider.test.mjs`
- `tests/pcms/p019/boundary.test.mjs`
- `tests/pcms/p019/harness.mjs`

## Acceptance mapping

### A019-01 — provisioning state machine

Covers bounded attempt schema, Account/Persona reservation checks, guarded session acquisition, provider preflight, durable remote mutation identity, successful account finalization, retry identity fencing, Core-compatible derived ID bounds, opaque SecretRef-only durable credentials, and compatibility with the broader accepted Accounts service surface.

### A019-02 — HumanTask / session guard

Covers explicit CAPTCHA/operator HumanTask creation, no provider mutation while human action is pending, task cancellation on attempt cancellation, guarded-session release, stale-session invalidation after a resolved HumanTask, mandatory reacquisition/preflight, and compatibility with the broader accepted HumanTask/provider service surfaces.

### A019-03 — uncertain / CAPTCHA-safe behavior

Covers ambiguous dispatch entering `UNCERTAIN`, blocked replay, `UNKNOWN` reconciliation remaining uncertain, proven `APPLIED` reconciliation finalizing exactly once, proven `NOT_APPLIED` allowing a new operation epoch, pre-dispatch ambiguity reusing stable operation identity, interrupted finalization without redispatch, fail-closed provider protocol validation, and static checks excluding CAPTCHA solver/bypass and privileged browser/native/storage/network authority.

## Focused verification actually run

Node: **v22.16.0**.

Commands:

```text
node --check pcms-modules/p019/errors.js
node --check pcms-modules/p019/schema.js
node --check pcms-modules/p019/provisioning.js
node --check pcms-modules/p019/provider.js
node --test tests/pcms/p019/*.test.mjs
```

Result: **18 tests passed, 0 failed, exit 0**.

The local focused tree uses exact accepted dependency files for the portions imported by P019. Their local Git blob hashes match the claim-base repository at `67626b6d6f32259fd0ae89091d04f9db7a059503`:

- P006 `extension/pcms/secrets/errors.js` — `be2584b5447ddc59bb04ebb1d488549bfb65bebb`;
- P006 `extension/pcms/secrets/secret-ref.js` — `f5c3009d1745d23c047285fbacaa4aacb942a2c5`;
- P014 `pcms-modules/p014/errors.js` — `fb40b889f578ccfd61c7c4846424cae2780985dd`;
- P014 `pcms-modules/p014/schema.js` — `d3be9b6425a5679494d8a18c6949762234badc18`.

The P019 test harness emulates the accepted behavioral surfaces for Accounts, HumanTask, guarded provider sessions, and RemoteControl/RemoteOperation state so deterministic ambiguity/recovery scenarios can be injected without live provider/browser access. No P025/P026 LIVE evidence is claimed here.

GitHub Actions / PR / merged evidence will be appended after the exact committed P019 checkpoint is published and independently verified.
