# P039 — Perchance observation, verification and drift

Claim `CLM-P039-001`, epoch 1, remains **ACTIVE**. Phase remains **IN_PROGRESS**.
Implementation is locally **COMMITTED**; independent CI, integration verification,
product PR, merge and acceptance remain pending.

Claim acquisition: [PR #65](https://github.com/Neb963/persona-monkey-pcms/pull/65),
merged as `6a9f9f43ddf6289ec1e902b4317b4f350911d72b`. P038 is accepted and there
is no conflicting active claim. Final source checkpoint:
`9996f36ad60f0ead25bc9026613a19e624573cf6`. Last published checkpoint:
`bc1dbc5514993407060f6629ae5e52ab051be707`.

## Implemented scope

- T039.1: capability-gated `generator.observe` through immutable PersonaMonkey
  execution artifacts, the Persona Broker, a short control lease, bounded result
  polling and acknowledgement. Exact target, capability, result and content
  validation fail closed. Production has no enabled Perchance read profile.
- T039.2: confirmed applies establish a hash-only provider baseline when reads
  are available. Unavailable reads stay explicitly unverified; a materially
  mismatched first read enters reconciliation. Repository scan cycles enqueue a
  durable, oldest-first verification sweep (default 20, configurable 1–100), with
  one read per timer occurrence and at least 10 seconds between reservations.
- T039.3: drift is compared against the confirmed provider baseline, including
  listing, thumbnail and missing-generator changes. `UNKNOWN` listing is never
  a mismatch. Drift pauses the affected target and blocks ordinary deployment.
  Compare and download are ephemeral; typed Keep and Overwrite commands are
  revision- and observation-fenced. Keep adopts the provider baseline and stays
  paused; explicit resume and a changed repository release prepare fresh work.
- Restart repairs an interrupted observation-to-domain transition without a
  provider mutation. Account rebinds and newer deployment identities fence late
  reads. Keep metadata is effective only after its exact domain CAS succeeds.
  Reads preserve the adopted listing/thumbnail baseline. Repository intent and
  release-triggered resume commit atomically, including identical-content releases;
  a fresh drift remains paused.
- A challenge produces one durable HumanTask, retains queued work and cancels
  automatic observation schedules until the task is resolved. Recovery hold
  likewise retains work without executing it.

## Acceptance mapping

| Gate | Deterministic coverage | Browser coverage |
| --- | --- | --- |
| A039-01 | Capability denial, no guessed live profile, immutable artifact, lease cleanup, malformed/foreign/omitted results, canonical content identity, unverified operator confirmation, static authority and content boundaries | Actual PersonaMonkey execution reads byte-exact fixture panels; production remains gated |
| A039-02 | Confirmed baseline, failed-baseline reconciliation, repository change versus drift, UNKNOWN listing, content/listing/thumbnail/missing drift, typed current choices, in-memory comparison, Keep/resume, atomic same-content release handling, account fencing and crash/CAS recovery | Changed loopback fixture pauses the target without overwrite |
| A039-03 | Oldest-first bounded sweep, durable spacing and timer continuation, recovery hold, single challenge episode and reconstruction | Alarm wakes a stopped event page with zero PCMS tabs; two spaced reads; challenge stops the sweep and survives another unload without duplicate work |

## Verification actually run

- `npm run verify`: PASS on `eedc258b1910cb329085ad9fbb49226c54594d61`,
  including upstream baseline, repository authority, generated views, claims and
  inherited phase suites. The upstream-integrity suite's optional packaged popup
  test (`A035-01/A035-03`) was skipped locally; it is not reported as passed.
  Subsequent source commits only change the P039 packaged test's network isolation.
- `npm run test:p039`: **29/29 PASS** on final source `9996f36`.
- P028/P029 background and timer regressions: **42/42 PASS** on `eedc258`.
- `node --check tests/pcms/p039/packaged.mjs` and `git diff --check`: PASS.
- `npm run firefox:packaged:p039`: **local diagnostic PASS** on clean source
  `9996f36`, exact pinned Firefox Developer Edition **154.0b10**. See
  `packaged-local-diagnostic.json`. The product XPI digest is
  `a9bf90b68126cfb0973eb38b301c94556ddd730ba6fb643264a8093996f356e3`.

The container cannot launch Firefox content processes with their normal namespace
sandbox (`uid_map: EPERM`). The successful local browser diagnostic used
`MOZ_DISABLE_CONTENT_SANDBOX=1`; its report marks this explicitly. It does **not**
establish independent sandbox-enabled FDE/PKG acceptance. The committed Actions
job rejects that override and must pass before CI verification or acceptance.

The packaged test uses a fresh disposable profile, a startup rejecting proxy and
a parent HTTP observer allowing only its exact loopback fixture origin. This
prevents Firefox startup services and PersonaMonkey catalog refreshes from making
external HTTP requests. Optional userscript permission is granted only to this
test profile; add-on disable/enable reinitializes the signal listener while keeping
the HTTP observer active. Product files are copied byte-for-byte from the built
XPI into the separate test add-on; reads use the real installed PersonaMonkey.

## Publication and remaining gates

Automatic approval review rejected both checkpoint push attempts as publication
to a public GitHub repository without recognized end-user authorization, including
the retry after checking the exact repository, account push permission, branch,
claim epoch and ownership of every changed path. No alternative upload or ref
update was used. New checkpoints are local and have not been published.

`local-verification.json` records the local evidence and pending states.
`pr-description.md` contains the prepared product PR description. After publishing
is authorized, re-fetch main and revalidate the active claim/epoch; publish a
non-skip-CI evidence head, open the product PR, verify required independent
repository and pinned Firefox jobs on the actual candidate, merge only when green,
then verify merged-main CI and record MERGED/ACCEPTED separately. Never mark an
unexecuted gate as PASS.

Real Perchance compatibility remains disabled until final live acceptance captures
and validates it. P042 and successor phases have not been started.
