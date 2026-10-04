# P005 — PCMS IndexedDB storage broker + migrations

Status: **CI_VERIFIED / implementation complete**

Implementation checkpoint: `41ee6a0891298a37ab37470f2ffefec140723bc3`.

## Scope

P005 implements the separately owned PCMS persistence substrate required by the accepted architecture. It does not alter PersonaMonkey persistence and does not expose raw IndexedDB to PCMS module consumers.

Implemented under `extension/pcms/storage/**`:

- a versioned PCMS database authority (`persona-monkey-pcms`, schema version 1);
- a contiguous synchronous migration table and fail-closed upgrade path;
- a single `records` object store with a namespace index;
- a privileged IndexedDB backend with stale-connection fencing;
- namespace-scoped broker handles;
- revision compare-and-swap writes/deletes;
- bounded data-only value validation.

No PersonaMonkey service object, raw `browser.*`, raw native-host RPC, Mullvad state, or PersonaMonkey storage is used by this implementation.

## A005-01 — DB/migration authority

`extension/pcms/storage/migrations.js` is the sole P005 schema authority.

- Schema upgrades execute in IndexedDB's `onupgradeneeded` transaction.
- Migrations are contiguous and synchronous.
- Unsupported/downgrade version transitions fail closed.
- A migration exception aborts the upgrade transaction and rejects database admission.
- Blocked upgrades reject rather than silently continuing on an obsolete connection.
- `versionchange` closes the privileged connection and fences it as stale.

Focused tests prove the v1 schema and injected migration rollback behavior.

## A005-02 — Namespaced storage/CAS

`createPcmsStorageBroker()` exposes namespace-bound handles rather than IndexedDB objects.

Each mutation is revision fenced:

- absent records have revision 0;
- a successful create advances to revision 1;
- each successful update advances exactly once;
- stale expected revisions reject with `PCMS_STORAGE_CAS_MISMATCH`;
- delete is revision fenced;
- namespace scans cannot return records from a different namespace.

The concrete IndexedDB adapter performs its read/check/write sequence inside one readwrite transaction. A deterministic transactional-IDB regression exercises create, read, stale-CAS rejection, delete, and version-change fencing through that production adapter.

Stored values are copied and constrained to bounded data-only structures. Accessors, cycles, functions/symbols, exotic prototypes, non-finite numbers, unsafe prototype keys, excessive depth, and excessive node count fail closed.

Static boundary tests confirm the P005 storage code does not use raw WebExtension APIs, native messaging, PersonaMonkey service/state objects, `cookieStoreId`, or Mullvad authority. The public broker source contains no raw `indexedDB` access.

## A005-03 — restart/failure behavior

The restart/failure regression closes a broker, reopens a new broker against the same durable backend state, and verifies the exact record/revision survives. It injects a write failure and proves the failed mutation does not advance the revision or replace the prior state; a subsequent restart still reads the pre-failure value.

## Focused verification

The execution environment could not clone GitHub because outbound name resolution is unavailable. The focused harness was therefore reconstructed from the branch contents and then checked against GitHub blob identities. The tested files match the exact branch blobs, including:

- `extension/pcms/storage/errors.js` — `90d540b843f6fa0434758928fb06e2491c4b75d8`;
- `extension/pcms/storage/migrations.js` — `8cf87143273b0198d70dd1685790eeffdc9a85d1`;
- `extension/pcms/storage/indexeddb-backend.js` — `d2153bb8080b0e86a1801dc6ebf889cb042f8f35`;
- `extension/pcms/storage/storage-broker.js` — `ae2cfb8397db9ce5254b3ff83ba6e36aa443c8f7`;
- `tests/pcms/p005-storage.test.mjs` — `963d6a21c9f4b82c58df8a9b13af64a77d6331a7`;
- `tests/pcms/p005-boundary.test.mjs` — `91aaa674d4905e0226d871e0a91f296ae4d0cdd3`.

Commands actually run against those byte-identical files:

```text
node --check extension/pcms/storage/*.js
node --test tests/pcms/p005-*.test.mjs
```

Result: **8 tests passed, 0 failed**.

The current root Actions workflows do not discover `tests/pcms/**`; P005 does not own `.github/**` or `package.json`, so it does not widen CI wiring outside its claim. The focused P005 suite above is therefore the direct U/I/C evidence.

## Independent CI at implementation checkpoint

Exact implementation checkpoint `41ee6a0891298a37ab37470f2ffefec140723bc3` passed:

- repository verification push run **37239616402** — success;
- pinned Firefox Developer Edition push run **37239616475** — success.

The Firefox workflow is a repository regression smoke on the exact pinned Developer Edition build. It is not represented as a focused IndexedDB browser test, and A005 requires U/I/C evidence rather than FDE evidence.

## Scope review

Compared with the durable P005 claim checkpoint `aa66f30469073dddf90ef413e4009ee6415ec54a`, the implementation checkpoint is 8 commits ahead, 0 behind, and changes exactly six files:

- four files under `extension/pcms/storage/**`;
- two files under `tests/pcms/**`.

All implementation paths are inside P005's claimed write paths. No successor phase is implemented by this branch.
