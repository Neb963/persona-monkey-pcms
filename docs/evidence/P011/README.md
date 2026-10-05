# P011 — Module runtime / capability RPC / generation fencing

Phase state: **PR_OPEN**. This document records implementation and verification evidence only; it does **not** claim P011 is ACCEPTED.

## Implemented scope

- durable per-module runtime state in the PCMS storage broker under `core.module-runtime`;
- admitted immutable package/controller activation through the accepted P004 sandbox host;
- bounded FIFO runtime mailbox;
- exact P008 authority-derived capability exposure;
- durable generation/package fencing before and after privileged capability work;
- graceful DRAINING semantics: already-started privileged work may finish, already-accepted mailbox work drains, and new mailbox/capability calls are denied;
- update/disable generation advancement before subsequent replacement activation;
- restart recovery that advances persisted ACTIVE/DRAINING generations and fences stale runtimes;
- RECOVERY_HOLD activation gating;
- no raw WebExtension, native, PersonaMonkey-internal, IndexedDB, migration, scheduler, or second automation authority.

Implementation files:

- `extension/pcms/runtime/errors.js`
- `extension/pcms/runtime/module-runtime.js`

Focused regression files:

- `tests/pcms/p011-harness.mjs`
- `tests/pcms/p011-runtime.test.mjs`
- `tests/pcms/p011-boundary.test.mjs`

## Acceptance mapping

### A011-01 — runtime broker / mailbox

The focused suite covers admitted controller activation, durable runtime state, bounded FIFO invocation and serialization.

### A011-02 — capability RPC

The focused suite covers exact manifest-authority capability exposure, denied ungranted capabilities, generation-fenced privileged context, and architecture-boundary checks.

### A011-03 — generation fencing / drain / recovery

The focused suite covers graceful drain, rejection of new work during drain, generation advancement, stale-context rejection, replacement activation, restart recovery, and RECOVERY_HOLD activation blocking.

## Independent CI actually completed

Code/reconciled head `f90d0d10dd15e9a38d802254aa1666bfd26fbfa5`:

- GitHub Actions `verify`, run **292** / run id **37254589796** — **success**;
- GitHub Actions `firefox-developer-edition`, run **287** / run id **37254589817** — **success**.

These are the repository's existing standard workflows. The Firefox workflow installed the exact pinned Firefox Developer Edition and completed its deterministic disposable-profile smoke.

## Focused verification limitation

The repository's standard workflows do not discover or execute `tests/pcms/**`. The available execution container was also unable to clone the GitHub branch because DNS/network access to `github.com` was unavailable. Therefore:

- the P011 focused Node suite is **present but not executed** in this session;
- no A011 acceptance gate is recorded as PASS on the basis of unexecuted tests;
- the PR remains draft and P011 remains **PR_OPEN**, not MERGED or ACCEPTED.

A later continuation must execute the focused P011 suite (or add an authorized repository-owned CI path in an appropriate phase/claim), then update evidence/state only if that execution passes.
