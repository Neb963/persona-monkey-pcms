# G. Migration path · H. Future workflow compatibility · I. Implementation roadmap

## G. Migration path from the P026 UI

A full rewrite is **not** warranted. The accepted services, Core composition, deep-link validation, text-only
rendering and startup retry are sound. The problems sit in the presentation layer and in a few places where the
presentation layer took over orchestration (audit #19, #20, #28). Migration therefore runs in this order:
**rehost → replace → remove**.

1. **Rehost (U1).** Build the new shell and move the existing views into it unchanged:
   - P026 forms move to *Settings → Diagnostics → Operator tools (legacy)* with their DOM IDs preserved, so the
     accepted P026 boundary tests still pass;
   - Overview loses its diagnostics fields, which move to Diagnostics;
   - old routes `#/modules`, `#/accounts/<id>`, `#/attention/<id>` and `#/search` keep working. `#/modules`
     redirects to `#/settings/diagnostics/legacy`.
2. **Replace, one area per phase (U2–U10).** Each phase adds the new screen *and* the module-owned command it needs.
   For example, `deployer.deploy` absorbs the orchestration currently in `live-controls.js`. The legacy form for
   that area stays reachable until its replacement passes CI.
3. **Remove (U10).** The legacy operator tools are deleted together with tests that supersede the P026 DOM
   assertions with equivalent assertions on the new components. Examples: Persona selector uniqueness, and no
   `personaUid` text field in Accounts flows. Accepted evidence documents remain unchanged. Test assertions are
   superseded and never simply deleted.

Data and contract migrations (each needs an allocated slot; none is invented here):

| Migration | Phase | Notes |
|---|---|---|
| Deployer state v1 → v2 | U6 | Mechanical (04 §E.7.1). `operationId` derivation is unchanged, so existing RemoteOperations stay linked. |
| Perchance driver contract v1 → v2 (adds v2 update, observe, capabilities) | U6 (update/listing), U9 (observe) | v1 is kept for legacy deployments and Refresher until U10 |
| Refresher member `sourceHash` → payload reference to Deployer confirmed release | U10 | Refresher keeps its own records. It reads content through a read-only Deployer query. |
| Module settings namespaces (`module.<id>.settings`) | U3 | New namespaces only |
| Deployer repository snapshot / ledger / observation namespaces | U7, U9 | New namespaces only |

Behaviour that is explicitly preserved:

- RemoteOps, ProviderGate and recovery-hold semantics.
- Operator-assisted apply as the default driver.
- No replay of uncertain operations.
- Persona Broker as the only route to PersonaMonkey.
- SecretRef-only credentials.

## H. Future workflow compatibility

The workflow engine is not designed here. These interfaces should stay stable now so that a later **Workflows
module** can compose existing operations without any shell rewrite:

| Interface | Stability promise | Why workflows need it |
|---|---|---|
| `EntityRef` (`account`, `generator`, `persona`, `module-object`) | Additive only | Step inputs and outputs reference objects, not internal IDs |
| Module **actions** `{id, appliesTo, risk, input, preview/execute, idempotencyKey}` | Versioned with the contract | A workflow step = invoke an action. Risk drives approval gates. |
| `preview` is side-effect-free; `execute` is idempotent per `idempotencyKey` | Normative | Workflows can be resumed after a restart without duplicate mutations |
| Durable truth = module state, not receipts | Normative | After a restart a workflow re-derives step status from the subject's derived status (for example `deriveGeneratorStatus`), never from in-memory receipts |
| HumanTask with `subjectRef` + `humanTaskActions` | Stable | The standard wait point ("HumanTask if required") |
| Conditions with `UNCERTAIN` token | Stable | A workflow must stop at uncertain steps and surface reconciliation |
| Recovery hold blocks `EXTERNAL_MUTATION` actions | Normative | Workflows inherit fail-closed behaviour |

The example chain from the brief maps directly onto actions that this roadmap creates:

```
explorer.reserve(candidate)                     → reservation (module-object)
deployer.prepareFromReservation(reservation)    → generator deployment (wraps accepted explorer-deployer bridge)
[HumanTask: deployer.create-generator]          → if generator must be created on Perchance
deployer.deploy(generator)                      → RemoteOperation; receipt; status ACTIVE/WAITING_HUMAN
deployer.verify(generator)                      → observation; status OK / UNCERTAIN / drift
statistics                                      → records from the Audit Journal automatically (no action)
```

A later Workflows module needs one new Core capability: `actions.invoke` for modules, gated by authority approval.
It also needs its own page. Neither requires the shell or other modules to change.

## I. Implementation roadmap

Phase IDs are **tentative** (U1…U13 → proposed P027…P039). Each phase is sized for one session, is a vertical slice
where possible, and follows the existing claim, write-path and evidence model. Paths `docs/evidence/<P>/**` and
`tests/pcms/<p>/**` are implied for every phase.

### Dependency graph

```
U1 Shell ──┬── U2 Accounts ───────────────────────────────┐
           ├── U3 Module contract + Attention v2 ──┬── U4 Activity + Diagnostics
           │                                      ├── U5 Popup status block
           │                                      └── U6 Deployer v2 + Generators ── U7 Repository scan (manual, Assisted)
           │                                                                      ├── U8 Scheduled checks
           │                                                                      └── U9 Observation & drift [LIVE probe]
           │                                       U10 Refresher/Explorer/Provisioning + legacy removal (needs U3, U6)
           └── U11 Backup/restore + Modules management (needs U3)
U12 Automatic deployment (needs U8, U9, ADR-002 decision, unattended driver) [LIVE]
U13 Milestone live acceptance (needs U2–U11; U12 optional) [LIVE]
```

Parallel waves, with claim conflicts checked by the claim validator:

- **Wave A:** U1.
- **Wave B:** U2 ∥ U3. Both write `extension/pcms/app/**`, so they must split sub-paths (`app/views/accounts/**`
  vs `app/contrib/**`) or serialize.
- **Wave C:** U4 ∥ U5 ∥ U6.
- **Wave D:** U7 → U8 ∥ U9. U10 ∥ U11.

---

### U1 — PCMS shell foundation and single Core host (P027)

- **Scope:**
  - Sidebar/header shell.
  - `ui/tokens.css` with light and dark via `light-dark()` and system colours.
  - UI primitives: `dom.js` (text-only element builder), `status.js`, `table.js` (sort, page, select), `dialog.js`
    (confirm by risk), `tray.js` (ActionTracker + receipts).
  - Router v2 with backward-compatible legacy routes.
  - Connection pill with startup states and a Retry button.
  - Global banners (recovery hold, disconnected).
  - **Single Core host lock** via `navigator.locks` (exclusive, named `pcms-core-host`). A second tab shows "PCMS is
    open in another tab — Switch to it" and never runs `recoverPcmsLiveStartup`.
  - Rehost existing views; move diagnostics fields to `#/settings/diagnostics`.
  - The operator dialog becomes a queue.
- **Non-scope:** module contract, new domain commands, popup, Accounts redesign.
- **Write paths:** `extension/pcms/app/**`.
- **Acceptance:**
  - A027-01 routes are canonical and fail closed; legacy links resolve.
  - A027-02 exactly one Core host per profile; a second tab cannot alter RemoteOps or recovery state.
  - A027-03 receipts name their subject; failures persist until dismissed or superseded; no global "Working…".
  - A027-04 startup with Integration unavailable shows reconnecting state and recovers without reload.
- **Tests:**
  - Node: router table tests; lock behaviour with a fake `locks` (holder, waiter, release on unload); ActionTracker
    state machine; operator queue.
  - FDE (`scripts/test-pcms-browser.mjs` extended): shell boots; second tab shows "already open"; light and dark
    render without contrast regressions (computed-style check).
  - Existing P021/P026 tests still pass unchanged.
- **Compatibility:** no storage changes. P026 DOM IDs are preserved under the legacy panel.

### U2 — Accounts UX (P028)

- **Scope:**
  - Accounts table: paging 50, filters in URL, sort.
  - Account detail page.
  - Add-account dialog with generated Account ID (slug + collision suffix, shown under Advanced).
  - Shared **EntityPicker** (Persona source = `persona.list`; bound Personas shown disabled with their account).
  - Rebind dialog with an impact summary. Blocked while unresolved RemoteOperations exist for that account, found
    via the operation context.
  - "Open in Persona" (`persona.open` with an operation ID).
  - Route column via `route.get` for visible rows only (cached, with `asOf`).
  - Session column showing last known state or "Unknown".
- **Non-scope:** account rename (needs an Accounts module command; listed for U10 if wanted); Provisioning flow.
- **Write paths:** `extension/pcms/app/views/accounts/**`, `extension/pcms/app/ui/picker*.js`.
- **Acceptance:**
  - A028-01 no Accounts flow requires typing an Account ID or `personaUid`.
  - A028-02 rebind is refused with a visible reason while unresolved operations exist.
  - A028-03 52-account fixture is navigable: paging, filters, sort, deep link to a row.
- **Tests:**
  - Node: ID generation and collision; picker filtering; rebind guard.
  - FDE: fixture runtime with 52 accounts (a test-only harness page under `tests/` loaded by the FDE script, not
    shipped).
- **Compatibility:** Accounts module API unchanged.

### U3 — Module UI contribution contract v1 and Attention v2 (P029)

- **Scope:**
  - Descriptor validator (03 §4).
  - `extension/pcms/integration/bundled-modules.js` replaces the hard-coded `FACTORY_NAMES` UI usage.
  - Nav, Overview cards, search merge, conditions merge, settings frame (`module.<id>.settings`).
  - Lifecycle presentation states (03 §6). Bundled modules are "Active · built-in". The sandboxed path is
    validator-only with tests.
  - Attention v2: HumanTasks + conditions + Core conditions; generic Resolve removed in favour of
    `humanTaskActions`.
  - **Pilot module:** Statistics `ui.js` (summary, facet, export). Accounts contributes conditions and actions.
- **Non-scope:** Deployer, Refresher, Explorer and Provisioning UIs; Activity.
- **Write paths:** `extension/pcms/app/**` (contrib, attention), `extension/pcms/integration/bundled-modules.js`,
  `extension/pcms/integration/composition.js` (only to consume the list), `pcms-modules/p018/ui.js`.
- **Acceptance:**
  - A029-01 a fixture module added to the bundled list appears in nav, Overview, search and facets with no other
    Core edits.
  - A029-02 an invalid or incompatible descriptor degrades to "incompatible" without breaking the shell.
  - A029-03 HumanTasks resolve only through module-declared actions.
- **Tests:**
  - Node: contract validation (exact keys, bounds, tokens); disabled, incompatible and throwing facets; attention
    merge ordering.
  - Static boundary test: contributions never receive raw services or DOM outside their container.
- **Compatibility:** HumanTask records are unchanged.

### U4 — Activity feed and Diagnostics page (P030)

- **Scope:**
  - Activity view from the Audit Journal and RemoteOps, with `formatActivity` contributions, URL filters, paging and
    subject links.
  - Unacknowledged failures as Core conditions.
  - Settings → Diagnostics (Core, RemoteOperations, modules, provider, error codes, copy buttons).
- **Non-scope:** new audit event types beyond formatting (gaps are listed in evidence for owning phases).
- **Write paths:** `extension/pcms/app/views/activity/**`, `extension/pcms/app/views/settings/diagnostics/**`.
- **Acceptance:**
  - A030-01 every Audit event renders as either module-formatted or the generic line.
  - A030-02 Diagnostics shows every ID and hash that normal views hide.
- **Tests:** Node fixtures of a journal with mixed event types; redaction test (no SecretRef value, no HumanTask
  instructions).

### U5 — Toolbar popup PCMS block (P031)

- **Scope:**
  - The Core host publishes a non-secret status summary to `browser.storage.session` (`pcms.status.v1`).
  - The popup reads it and shows: PCMS line, account for active Persona, "Open account in PCMS" (deep link, focus
    existing tab).
  - States for host not running and recovery hold.
- **Non-scope:** any popup admin features; route controls are unchanged.
- **Write paths:** `extension/pcms/app/status-summary.js`, `extension/popup/popup.{html,css,js}`,
  `docs/upstream/import-manifest.json`, `tests/upstream/import-integrity.test.mjs` (frozen derivative bookkeeping
  as in P026).
- **Acceptance:**
  - A031-01 popup body width stays at a fixed 370 px; the ESR regression test is extended to the new block.
  - A031-02 the summary contains no secret, `cookieStoreId` or HumanTask instructions.
  - A031-03 with no Core host the popup says checks are paused.
- **Tests:** Node schema test of the summary; existing popup ESR test; FDE popup render with a fixture summary
  (`scripts/test-popup-browser.mjs`).
- **Live:** ESR visual check folded into U13.

### U6 — Deployer v2 domain and Generators (P032)

- **Scope:**
  - Deployer schema v2 + migration (allocated slot).
  - `deriveGeneratorStatus` (04 §E.11).
  - Module-owned commands `deploy` (absorbs `live-controls.js` orchestration: reconcile-first, setDesired,
    prepareRetry), `deployFromFile`, `pause`/`resume`.
  - Perchance contract v2 `generator.update` with code/HTML/listing/thumbnail.
  - `GeneratorListing` adapter mapping + emulator update.
  - Assisted driver dialog v2 (separate panels, copy buttons, human-checkable reconcile evidence).
  - Core generator index + Generators list/detail.
  - Deployer `ui.js` (facet, columns, conditions, actions).
- **Non-scope:** repository, scheduling, observation/drift detection (status rules 4–5 dormant), Refresher migration.
- **Write paths:** `pcms-modules/p015/**`, `extension/pcms/providers/perchance/**`,
  `extension/pcms/integration/live-mutations.js`, `extension/pcms/app/views/generators/**`,
  `extension/pcms/app/operator-bridge.js`.
- **Acceptance:**
  - A032-01 v1 records migrate losslessly and existing RemoteOperations stay linked.
  - A032-02 status derivation table passes exhaustively.
  - A032-03 a manual deploy from a file requires no typed IDs and never replays UNCERTAIN.
  - A032-04 `isPrivate` appears only inside the Perchance adapter (static test).
- **Tests:**
  - Node: migration round-trip fixtures; derivation table; adapter mapping incl. UNKNOWN; emulator v2;
    orchestration tests ported from P026 live-mutations.
  - FDE: generators list with a 1,000-row fixture (paging, filters).
- **Compatibility:** Refresher continues on v1 update until U10.

### U7 — Repository provider and manual scan, Assisted deployments (P033)

- **Scope:**
  - `extension/pcms/providers/repository/` contract + GitHub implementation + fixture provider.
  - Validator and payload hashing (04 §E.3–E.4).
  - Release ledger.
  - Snapshot persistence.
  - Snapshot → Deployer application (04 §E.7.2).
  - Account-folder linking; Adopt manual.
  - Deployer page Repository / Ready / History / Settings tabs.
  - "Check now"; "Deploy" and "Deploy all ready" through the assisted queue.
  - Repository token via Connections (SecretRef).
- **Non-scope:** timers, Automatic mode, observation.
- **Write paths:** `extension/pcms/providers/repository/**`, `pcms-modules/p015/**`,
  `extension/pcms/integration/composition.js` (inject provider), `extension/pcms/app/views/settings/connections/**`.
- **Acceptance:**
  - A033-01 the same commit yields identical snapshots and hashes across runs and time zones.
  - A033-02 changed releases become "Update ready"; unchanged ones are untouched; a modified published release is
    blocked.
  - A033-03 scan failures keep the previous snapshot and never mark generators removed.
  - A033-04 no GitHub response object crosses the provider boundary (static and contract test).
- **Tests:** Node with the fixture provider covering: ref movement, truncation, rate limit, auth failure, duplicate
  slug, unlinked folder, oversize, invalid UTF-8, thumbnail magic, release mutation, account move, manual adoption.
  The real GitHub API is **not** called in CI.
- **Repository dependency:** none. Works with fixtures. Live use waits for Q1.

### U8 — Scheduled repository checks (P034)

- **Scope:**
  - Core timer pump (60 s, `online`, `visibilitychange`).
  - Deployer `deployer.repository-sync` service.
  - One pending timer; cadence, backoff and rate-limit rules; offline skip.
  - Startup "one catch-up scan".
  - `INTERRUPTED` scan records.
  - Paused / Assisted mode switch (Automatic shown with unmet gates).
- **Non-scope:** Automatic dispatch.
- **Write paths:** `extension/pcms/app/timer-pump.js`, `pcms-modules/p015/**`.
- **Acceptance:**
  - A034-01 after a simulated 9-hour sleep exactly one scan runs.
  - A034-02 at most one scheduled scan timer exists at any time.
  - A034-03 failures back off and honour reset times.
- **Tests:** Node with a fake clock and fake timers covering restart mid-scan, overdue > 24 h, offline/online,
  repeated identical commits (no audit noise).

### U9 — Perchance observation, verification and drift (P035) [LIVE investigation slice]

- **Scope:**
  1. **Live investigation (operator, normal Firefox, no Marionette):** determine a safe read path for generator
     content and listing, normalisation behaviour after save, and the challenge signature. Encode every observation
     as a deterministic fixture (AGENTS §10) *before* implementing.
  2. `generator.observe` adapter + emulator.
  3. Post-apply verification baseline.
  4. Bounded verification sweep.
  5. Drift detection, Compare (diff view), Overwrite, Keep Perchance version, challenge HumanTask.
- **Non-scope:** automatic overwrite (none exists by design).
- **Write paths:** `extension/pcms/providers/perchance/**`, `extension/pcms/integration/live-mutations.js` (or a new
  `live-observe.js`), `pcms-modules/p015/**`, `extension/pcms/app/views/generators/**`.
- **Acceptance:**
  - A035-01 drift against the baseline is detected and never auto-overwritten.
  - A035-02 provider normalisation does not produce false drift (fixtures from the live investigation).
  - A035-03 an observe failure or challenge yields "not verified", not "in sync".
- **Tests:** Node fixtures from the investigation; diff renderer is text-only.
- **Fallback:** if no safe read path exists, ship the operator-confirmed observation flow only and keep the "not
  verified" labels.

### U10 — Refresher, Explorer and Provisioning migration; legacy form removal (P036)

- **Scope:**
  - `ui.js` for Refresher (cohort pages, explicit "New cohort", member picker from the generator index, content
    taken from the Deployer confirmed release, Refresher v2 payload reference).
  - `ui.js` for Explorer (reserve picks account; IDs generated; `prepareFromReservation` action).
  - `ui.js` for Provisioning (stepper, Persona picker, Add credential → SecretRef).
  - Remove legacy operator tools; supersede P026 DOM assertions.
- **Write paths:** `pcms-modules/p016/**`, `pcms-modules/p017/**`, `pcms-modules/p019/**`,
  `extension/pcms/integration/**`, `extension/pcms/app/**` (legacy removal only).
- **Acceptance:**
  - A036-01 no primary flow requires typing durable IDs, hashes or SecretRef strings.
  - A036-02 a cohort is never created implicitly.
  - A036-03 Refresher never asks for pasted source.
- **Tests:** Node per module; boundary test that no `<input name="accountId">` or `name="personaUid"` text field
  remains in primary views.

### U11 — Backup/restore and Modules management UX (P037)

- **Scope:**
  - File-based backup download (auto-named).
  - Restore from file with preview and diff summary, typed confirmation, recovery checklist with per-item Check.
  - Modules page (built-ins, installed, states, review-update dialog with plain-language capabilities, remove, purge
    with typed confirmation).
  - **Decision record** on wiring the sandbox page into the production manifest. "Install from file" stays hidden
    until that is done; wiring itself is a separate claimable task, because it edits frozen derivative paths.
- **Write paths:** `extension/pcms/app/views/settings/**`.
- **Acceptance:**
  - A037-01 a restore cannot start without a preview and typed confirmation.
  - A037-02 hold release is impossible while checks fail, and each failing check links to its subject.
  - A037-03 a disabled, removed, purged or incompatible module degrades navigation gracefully (fixtures).
- **Tests:** Node + FDE harness with fixture backups and modules.

### U12 — Automatic deployment (P038) [gated, LIVE]

- **Preconditions:**
  - ADR-002 decided (below).
  - Unattended Perchance driver designed as a PersonaMonkey execution artifact (`userscript.artifact.install`,
    `execution.start`, control lease), with its own compatibility probe.
  - U9 observation available.
- **Scope:** Automatic mode gates, eligibility, bounded serial pass with spacing, repeated-failure pause,
  `generator.create` if supported.
- **Acceptance:**
  - A038-01 automatic mode refuses to enable while any gate is unmet, and lists the gate.
  - A038-02 drifted, uncertain, paused and failed targets are never dispatched automatically.
  - A038-03 live: one repository change deploys, verifies and records without operator action.
- **Tests:** Node eligibility matrix; emulator end-to-end; LIVE slice.

### U13 — Milestone live acceptance (P039) [LIVE]

The operator runs this in normal Firefox ESR and Developer Edition, without Marionette:

- popup sizing on both builds;
- PCMS opened during browser startup;
- second tab;
- account add and rebind via pickers;
- a repository fixture branch in the *real* generator repository once it exists (Q1), with Assisted deploy and
  verify;
- induced drift on one generator, compared and resolved;
- induced uncertain outcome, reconciled;
- backup, restore, hold, release.

## ADR-002 (proposed, not accepted) — Where does PCMS Core run?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. Tab host + lock** (recommended now) | Core stays in the PCMS tab; U1 adds a single-host lock; checks run while PCMS is open | No change to frozen background/manifest paths; assisted dialogs need a tab anyway; matches accepted P025/P026 runtime | No checks while PCMS is closed; popup shows "paused" |
| B. Background event-page host | Core moves into the background; tab becomes a client over messaging; `alarms` wake scans | Unattended checks/deploys | Large change: Core ↔ UI messaging layer; Firefox MV3 event pages unload when idle, so long assisted steps can't live there; edits frozen derivative paths; new restart semantics |
| C. Hybrid scan-only background | Background wakes, reads GitHub, writes snapshot; Core stays in tab | Snapshot freshness | Two writers on PCMS storage. Recreates the two-Core hazard (audit #1) unless strictly limited. Not recommended. |

Recommendation: **adopt A in U1**. Reconsider B only together with U12, once unattended Perchance automation exists.
Before that, background hosting would only gain fresher "update available" badges.

## Risks and how the plan contains them

| Risk | Containment |
|---|---|
| Shell rework breaks accepted P021/P026 tests | U1 rehosts with DOM IDs preserved; removal only in U10 with superseding assertions |
| Contract creep into a plugin framework | Hard caps in 03 §4; new field kinds only with a second consumer; sandboxed modules declarative only |
| False drift from Perchance normalisation | Baseline-after-apply comparison; U9 investigation fixtures before code |
| GitHub rate limits at scale | Unchanged-commit short-circuit; blob cache by blob ID; token option; reset-time backoff |
| Cloudflare challenges from probes | Bounded sweep with spacing; challenge → single HumanTask; live tests without Marionette |
| Deployer singleton document growth | Snapshots, ledger and observations live in separate keyed namespaces; 4096-target cap unchanged and monitored in Diagnostics |
