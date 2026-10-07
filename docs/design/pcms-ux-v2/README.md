# PCMS UX v2 — product-refinement design package

Status: **PROPOSED — awaiting review.** Nothing in this directory is accepted authority. It does not
change `plan.json`, `policies.json`, ADRs, contracts or claims. Phase IDs below are tentative until the
plan authority allocates them.

Baseline inspected: `main` at `436f618` (P000–P026 ACCEPTED, no READY/CLAIMED phase).

## Contents

| File | Deliverable |
|---|---|
| [01-ux-audit.md](01-ux-audit.md) | A. Audit of the current P026 UI, with file references and a classification for each problem |
| [02-information-architecture.md](02-information-architecture.md) | B. Information architecture, C. Screen designs, §16 common states, §17 confirmations, §18 diagnostics, popup |
| [03-module-ui-contract.md](03-module-ui-contract.md) | D. Module UI contribution contract |
| [04-deployer-repository-sync.md](04-deployer-repository-sync.md) | E. Deployer ↔ generator repository specification, F. Perchance listing model |
| [05-migration-and-roadmap.md](05-migration-and-roadmap.md) | G. Migration path, H. Future workflow compatibility, I. Phased roadmap |

## Repository facts that shape the design

These come from the code, not from assumptions. Several of them limit what the UX can promise.

1. **PCMS Core runs only inside the PCMS tab.** `extension/pcms/app/app.js` boots
   `startPcmsLiveRuntime()`. The background script hosts only the PersonaMonkey control plane
   (`extension/background.js:1109`). If no PCMS tab is open, no PCMS timers fire, so "scan every 30 minutes" can
   only happen while a PCMS tab is open. This design states that limit openly and puts the move to
   background hosting into an explicit ADR (ADR-002, proposed in 05).
2. **Two PCMS tabs means two Cores on one IndexedDB.** Each tab runs `recoverPcmsLiveStartup()`
   (`extension/pcms/integration/live-core.js:10`). If a second tab opens while the first is dispatching, the second
   one moves the first tab's `DISPATCHING` operation to `UNCERTAIN` and enters `RECOVERY_HOLD`. This fails safe,
   but it confuses the operator. The fix is a single-host lock (phase U1).
3. **The six feature modules are bundled and wired statically.** `live-runtime.js` imports
   `pcms-modules/p014…p019` directly. `composition.js` hard-codes exactly six factory names (`FACTORY_NAMES`). The
   P008/P011/P022 registry, sandbox runtime and lifecycle are accepted. However, the production
   `extension/manifest.json` does not declare the sandbox page from
   `extension/pcms/sandbox/manifest-fragment.json`, so a runtime-installed module cannot run in the shipped
   product today. The module UI contract has to serve both cases: bundled modules (privileged and reviewed) and
   future sandboxed modules (declarative only, because the sandbox CSP is `style-src 'none'` and `img-src 'none'`).
4. **Applying to Perchance is operator-assisted today.** The live Perchance driver
   (`extension/pcms/integration/live-mutations.js`, `updateGenerator`) opens the bound Persona and shows the source.
   The operator saves in Perchance and chooses Applied or Not applied. Nothing reads Perchance back. As a result:
   - "Automatic deployment" cannot be unattended until an automated driver exists. That driver would be a
     PersonaMonkey execution artifact (`userscript.artifact.*` / `execution.*` broker commands), not a PCMS script
     authority.
   - Drift detection needs a new adapter capability that reads Perchance (`generator.observe`). Until that exists,
     PCMS must show "not verified" rather than claim "in sync".
   - The provider contract only has `generator.update`, which carries one `source` string. It has no listing, no
     thumbnail and no generator creation.
5. **The Deployer stores one target per generator and one desired hash.** The schema has
   `desired:{revision,sourceHash}` and `observed:{sourceHash,confirmedAt}`. Its `observed` field is really "last
   confirmed by our own successful operation", not an independent observation. The repository design keeps that
   model and adds the missing layers next to it instead of replacing it.
6. **Deployer, Explorer and Refresher each store all their records in a single CAS document** (cap 4096
   deployments). That is adequate for "hundreds to low thousands" of generators. Repository snapshots must not be
   added to that document.
7. **The P026 forms put domain orchestration in the UI.** `live-controls.js` decides when to call
   `setDesired`, `prepareRetry` or `reconcileDeployment` before `deploy`, and does the same for Refresher. Workflows
   would have to duplicate that logic. It belongs in module-owned commands.

## Decision summary

| # | Decision | Where |
|---|---|---|
| D1 | Full-tab app with a left sidebar. Primary items: Overview, Attention, Accounts, Generators. Module pages sit below them, then Activity and Settings. Global search lives in the header. | 02 |
| D2 | **Generator becomes a Core view, not an aggregate.** `GeneratorRef = perchance:<slug>`. Core keeps a rebuildable index fed by modules. Each module contributes its own *facet* to the generator page. | 02, 03 |
| D3 | A small **module UI contribution contract v1**: metadata, nav entry, summary, search, entity facets, conditions, named actions with a risk class, settings and activity formatting. Bundled modules may also render a custom page. Sandboxed modules are declarative only. | 03 |
| D4 | **Three state layers** for repository-managed generators: Repository desired, PCMS confirmed, Perchance observed. One pure function derives a single human status plus a "what happens next" sentence. | 04 |
| D5 | **Repository format v1 uses plain files, not zips.** A per-generator `generator.json` names the desired release explicitly. Release folders are immutable and enforced by recorded content hashes. Identity is the SHA-256 of a canonical deployable payload, not file names or versions. | 04 |
| D6 | `GeneratorListing = PUBLICLY_LISTED \| UNLISTED`, plus `UNKNOWN` for observations only. `isPrivate` exists only inside the Perchance adapter. Listing is part of deployment intent. | 04 |
| D7 | Drift is compared against the **last confirmed Perchance baseline**, not against the repository hash. Drift is never overwritten automatically. | 04 |
| D8 | Deployment modes: **Paused / Assisted (default) / Automatic**. Automatic stays unavailable until an automated driver and the Core-host ADR are accepted. | 04, 05 |
| D9 | Scans use the existing timer service through a small Core "timer pump" in the Core host. One pending scan timer at most. No backlog replay. | 04 |
| D10 | The popup stays 370 px wide. It shows one PCMS status line and "Open account in PCMS" for the active Persona. Data comes from a non-secret status summary that the Core host publishes. | 02 |
| D11 | Incremental migration. Rehost P026 views into the new shell first, replace typed-ID forms one slice at a time, and remove legacy forms only after their replacements pass tests. | 05 |

## Decisions that need you, or the future repository

These are left open on purpose. The design keeps each one behind a boundary so it does not block UI work.

| ID | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | Generator repository owner/name, visibility (public/private), default branch. *The repository does not exist; no URL is assumed.* | U7 live use only | Setting stays "Not configured" |
| Q2 | Do you accept **plain-file releases instead of zips** (D5)? | U7 | Plain files; zip support deferred |
| Q3 | How do Perchance account folders map to PCMS Accounts? Proposed: a Deployer-owned mapping picked in the UI, with no IDs in the repository. | U7 | Proposed mapping |
| Q4 | Which Perchance read path is safe to use for observation (public generator data vs. a PersonaMonkey execution artifact in the bound Persona)? This needs a live compatibility investigation. | U9 | Drift shows "Not verified" |
| Q5 | Should GitHub reads use Firefox's default network or a designated Persona route? | U7 | Default network, disclosed in Settings |
| Q6 | ADR-002: should PCMS Core move from the tab into the background event page, so unattended scans and deploys are possible? | U12 | Core stays in the tab, guarded by the U1 single-host lock |
| Q7 | Do new generators need **Perchance generator creation** (claiming a URL name), and is it automatable? | U7 (assisted), U12 (automatic) | Creation becomes an operator HumanTask |

## Adversarial review (performed before publishing)

| Question | Answer | Residual risk |
|---|---|---|
| Is it simpler than the current UI? | Yes. P026 shows 7 typed-ID forms in one Modules page, plus diagnostics on Overview. v2 has 4 primary destinations, object pages with contextual actions, and pickers in place of every routine ID field. | The shell adds about a dozen small UI primitives. Each is plain JS/CSS with no framework. |
| Usable without knowing PCMS internals? | Normal views show names, statuses and next actions. IDs, hashes, operation states and generations appear only under "Technical details" and Settings → Diagnostics. | The Advanced reconcile flow still has to explain "unknown outcome". The wording is specified in 02 §5.3. |
| Works at 50+ accounts? | Accounts is a filterable, sortable table with status chips. Route and session columns load per visible page only. | Session health is "Unknown" until a probe exists. This is shown honestly. |
| Works at thousands of generators? | Paginated table (50 rows per page), status chips with counts, account and module filters, URL-persisted filters, bulk actions, bounded verification sweep. | Deployer's singleton document caps at 4096 targets (unchanged). Revisit if exceeded. |
| Can a future module integrate without editing five Core files? | A bundled module adds one entry to a bundled-module list and ships `ui.js` in its own folder. A sandboxed module only implements `describeUi`/`invoke` over the existing RPC. | Bundled composition still requires `composition.js` dependency wiring for cross-module services. That is intentional. |
| Did we create a generic plugin framework? | No. There are 8 contribution kinds, a fixed set of 9 status tokens, ≤ 8 typed list columns and ≤ 6 input field kinds. No arbitrary DOM for sandboxed modules, no layout engine, no JSON-schema form renderer. | Pressure to add field kinds. The rule is that a field kind is added only with a second real consumer. |
| A second scheduler, workflow or browser authority? | No. Scans use the accepted timer service. Applying goes through ProviderGate, RemoteOps and the Persona Broker. Automation, when it comes, is a PersonaMonkey execution artifact. | The timer pump is new Core code, but it only calls `timers.runDue()`. |
| Is repo → PCMS → Perchance deterministic? | Scans are pinned to a commit ID. Identity is a canonical payload SHA-256. Sync state is a pure function of (desired, confirmed, observation, operation, health, policy) with an ordered rule table. | Provider normalization could produce false drift. Mitigation: compare against the post-apply observed baseline. |
| Is drift obvious and safe? | Drift is a top-priority status with a three-column comparison and a diff. It never auto-overwrites. Automatic mode skips drifted targets. | Drift is undetectable until `generator.observe` exists. The UI says "Not verified since …". |
| Are UNCERTAIN and recovery still fail-closed? | Uncertain outranks every other status. Automatic deploy and retries skip uncertain targets. Recovery hold blocks all dispatch and is a global banner. | None new. Existing RemoteOps semantics are unchanged. |
| GitHub as desired source, not observed? | Yes. Repository data only feeds the *Desired* column. Only Perchance reads or operator confirmations feed *Observed*. A failed scan never turns into "deleted". | None. |
| Incremental from P026? | Each phase rehosts or replaces one area and keeps accepted services. Schema changes are limited to Deployer v2 (one allocated migration) and the provider contract v2. | P026 boundary tests assert specific DOM IDs. The phases that replace those forms must supersede those assertions explicitly. |

Contradictions found during review and resolved in the documents:

- *"Deploy automatically every 30 min"* conflicts with *"apply is operator-assisted, and Core lives in a tab"*.
  Resolution: Assisted mode is the default and is honest about it. Automatic mode is gated (D8, Q6).
- *"First deployment makes it publicly listed"* conflicts with *"listing has no provider operation"*. Resolution:
  provider contract v2 carries listing in the update intent. Until a live probe shows the adapter can set listing,
  the operator is asked to set it in the assisted dialog, and the outcome is recorded as observed.
- *"Generators first-class"* conflicts with *"module ownership"*. Resolution: Core keeps only a rebuildable index
  and the page frame. Every fact on the page comes from a module facet.
