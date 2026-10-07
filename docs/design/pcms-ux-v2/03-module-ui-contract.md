# D. Module UI contribution contract (`pcms.ui-contribution/v1`)

## 1. Goal and non-goals

Goal: an ACTIVE module can appear in navigation, Overview, Search, Attention, Activity, and on Account and Generator
pages. Its actions can be invoked with consistent confirmation and feedback. None of this requires redesigning the
shell or editing unrelated Core files.

Non-goals:

- Generic form or layout engine. No JSON-schema-to-UI renderer.
- Sandboxed modules touching the privileged DOM.
- Core owning or interpreting module business rules (cohort policy, deployment state machine, provisioning steps).
- A workflow engine (see 05 §H).

## 2. Two kinds of module, one contract

| | Bundled module (today: Accounts, Deployer, Explorer, Refresher, Statistics, Provisioning) | Installed sandboxed module (future) |
|---|---|---|
| Code location | `pcms-modules/<id>/**`, shipped in the XPI | Immutable package in the registry (P008) |
| Runs in | PCMS Core host page (privileged, reviewed) | Firefox sandbox page, bounded RPC (P004/P011) |
| Provides contribution | `export function createUiContribution(api)` in `pcms-modules/<id>/ui.js` | `describeUi()` / `invokeUi()` controller methods over existing RPC |
| Custom page rendering | **Allowed**: `renderPage(container, api)` using Core UI primitives | **Not allowed**. Declarative list/detail only (§5) |
| Trust boundary | Same as the composition root (code review) | Authority envelope plus Core validation of every returned value |

Both kinds return the same descriptor shape, which Core validates with the same exact-keys/bounded style used
elsewhere in PCMS. Bundled modules get a richer *page*. Everything that shows up outside the module's own page
(nav, summary, facets, search, conditions, activity, actions) goes through the same narrow data path for both kinds.
This keeps the shell uniform and makes "a bundled module later becomes installable" a packaging change rather than
a UI rewrite.

## 3. What Core owns vs what a module owns

| Core owns | Module owns |
|---|---|
| Shell, sidebar, header, routing grammar, global banners | Its domain records, state machines, policies |
| Status tokens → visuals; text-only rendering | The *wording* and the *token choice* for its states |
| `EntityRef` kinds `account`, `generator`, `persona`, `module`, `module-object` and how they route | Which generators/accounts it knows about, and its facets' content |
| Generator index (rebuildable projection) and EntityPicker | Its module-object kinds and their resolution |
| Search box, ranking merge, result rendering | Its search matches (bounded) |
| Attention list merge, HumanTask service | Its condition rules; its HumanTask kinds and the action that settles each |
| ActionTracker, receipts, action tray, confirm dialogs by risk | Action semantics, impact summary text, preconditions |
| Activity feed rendering from the Audit Journal | Formatting of its own event types |
| Settings frame and persistence of module setting values (module namespace) | Setting definitions, validation, meaning |
| Module management page and lifecycle UX | Nothing (lifecycle is Core, P022) |
| Diagnostics page | Optional extra diagnostics rows (§4.9) |

## 4. Descriptor v1

All strings are bounded. All arrays are capped. Unknown keys are rejected. Text is rendered with `textContent` only.

```js
{
  contractVersion: 1,
  moduleId: "deployer",                 // must equal registry/bundled moduleId
  title: "Deployer",                    // ≤ 40 chars
  description: "Deploys generator releases from the repository to Perchance.", // ≤ 200
  icon: "upload",                       // from a fixed Core icon set (~24 names)

  nav: { label: "Deployer", order: 10, statusFrom: "summary" } | null,

  summary:      async (ctx) => Summary,                        // §4.2
  search:       async (ctx, query, limit) => SearchHit[],      // §4.3 (limit ≤ 20)
  facets: {                                                    // §4.4
    generator?: async (ctx, generatorRef) => Facet | null,
    account?:   async (ctx, accountId)    => Facet | null
  },
  listGenerators?: async (ctx, cursor) => GeneratorListingPage,// §4.5 feeds the Core index
  conditions:   async (ctx) => Condition[],                    // §4.6 (≤ 200)
  actions:      ActionSpec[],                                  // §4.7 (≤ 32)
  invoke:       async (ctx, actionId, target, input, options) => Receipt,
  settings:     SettingSpec[],                                 // §4.8 (≤ 20)
  formatActivity: (event) => ActivityLine | null,              // §4.9
  humanTaskActions: { [taskKind]: actionId },                  // binds HumanTask kinds to actions
  page?:        PageSpec                                       // §5 (declarative) — or bundled renderPage
}
```

`ctx` is a Core-provided read-only context: `{ asOf, recovery: "NORMAL"|"RECOVERY_HOLD", generation, locale }`. A
module must not hold references across generations, because Core recreates the contribution after an update.

### 4.1 Status token

`OK | INFO | ACTIVE | WAITING_HUMAN | WARNING | ERROR | UNCERTAIN | HELD | UNAVAILABLE` (see 02 §3). A module
supplies `{ token, label }`. Core renders both. Core may *escalate* the display (for example, show `HELD` during
recovery hold) but never rewrites the label.

### 4.2 Summary

```js
{ status: {token, label}, headline: "9 updates ready",          // ≤ 80
  facts: [{label:"Last check", value:"12:04"}, …],              // ≤ 4
  href: "#/m/deployer" | "#/generators?f=status:update" }
```

Used by: the Overview module card and the sidebar status dot (`nav.statusFrom:"summary"` → the dot shows WARNING,
ERROR or UNCERTAIN only).

### 4.3 Search

```js
SearchHit = { entity: EntityRef, title, subtitle, status?: {token,label}, score: 0..100 }
```

Core merges hits from Accounts, the generator index and modules. It ranks by score and kind, and caps at 50. Modules
must not index secrets or HumanTask instructions; this is inherited from the P021 rules.

### 4.4 Facets (how modules appear on Account and Generator pages)

```js
Facet = {
  title: "Refresher",                           // section heading
  status?: {token,label},
  facts: [{label, value, href?}],               // ≤ 8
  columns?: { [columnId]: {label, value, token?} }, // ≤ 3; for the Generators table (§4.5)
  actions: [actionId…],                         // subset of declared actions applicable to this target
  history?: [{at, text, token?}]                // ≤ 10; module's recent events for this target
}
```

Core renders facets in nav order beneath the object header. If a facet call throws or times out (bounded at
1.5 s), Core shows a compact "Refresher information unavailable · Retry". The page never breaks because of one
facet.

### 4.5 Generator index participation

Generators are not owned by Core. Core keeps a **rebuildable index**: an in-memory projection that is cached
non-authoritatively and dropped on any schema mismatch. It is built from modules that implement `listGenerators`:

```js
GeneratorListingPage = { items: [{ ref:"perchance:tavern-names", accountId:"alice", title?:"Tavern Names",
                                   columns:{status:{…}, repo:{…}, perchance:{…}} }],
                         next: cursor|null }
```

- Union by `ref`. If two modules disagree on `accountId`, the row shows "Account mismatch" (`WARNING`) and a
  diagnostics entry. Core never picks a winner.
- **Columns** are a module-declared, bounded set (each module ≤ 3, typed text/status/time/count). Filter chips are
  derived from status tokens and labels.
- Each module also provides the generator *picker* source implicitly: every Core EntityPicker for generators
  searches this index. Refresher's "Add generator to cohort" no longer types IDs.

This is the "shared generator context" without a universal Generator aggregate. Modules keep their own records, and
Core only joins them for display.

### 4.6 Conditions (derived Attention)

```js
Condition = { key:"deployer:uncertain:fantasy-names", priority:"HIGH",
              status:{token:"UNCERTAIN", label:"Outcome unknown"},
              title:"Outcome unknown · fantasy-names (Alice)", subject: EntityRef,
              since: iso, actionId:"reconcile" }
```

Conditions are recomputed on refresh and never stored. Durable needs-a-human items stay HumanTasks (P012).

### 4.7 Actions

```js
ActionSpec = {
  id: "deploy", label: "Deploy",
  appliesTo: "generator" | "account" | "module" | "module-object:<kind>",
  risk: "READ" | "LOCAL" | "EXTERNAL_MUTATION" | "BINDING" | "DESTRUCTIVE" | "RESOLUTION",
  bulk: false | { max: 50 },
  input: null | InputSpec,              // §4.7.1
  preview: true | false                 // if true Core calls invoke(..., {mode:"preview"}) first
}

invoke(ctx, actionId, target, input, { mode: "preview"|"execute", idempotencyKey, receiptId }) → Receipt
Receipt = {
  status: {token,label},                // ACTIVE / OK / ERROR / UNCERTAIN / WAITING_HUMAN
  subject: EntityRef, message,          // human
  impact?: { title, consequences:[…], confirmLabel, excluded:[{subject, reason}] },   // preview only
  followUp?: { href, label },
  operationRef?: { kind:"remote-operation", id }   // diagnostics only
}
```

Rules:

- `preview` must be side-effect-free. Core shows `impact` in the risk-appropriate dialog, then calls `execute` with
  the same `idempotencyKey`.
- `execute` returns as soon as the operation is durably recorded or done. Long-running provider steps continue and
  report through the receipt (polling `receipt(receiptId)` in v1; no event bus).
- Modules perform their own orchestration. For example, Deployer's `deploy` does reconcile-before-retry and
  setDesired/prepareRetry internally, which fixes audit #19.
- Core blocks `EXTERNAL_MUTATION`/`BINDING`/`DESTRUCTIVE` actions during `RECOVERY_HOLD` before calling the module.
  The module still enforces this itself through ProviderGate, so Core is only the first line.

#### 4.7.1 InputSpec

There are six field kinds. A new kind is added only when a second real consumer needs it.

| kind | Renders as | Value |
|---|---|---|
| `text` | `<input>` (bounded length, optional pattern) | string |
| `integer` | `<input type=number>` with min/max | number |
| `choice` | `<select>` / radio (≤ 12 options) | option id |
| `boolean` | checkbox | boolean |
| `entity` | Core EntityPicker filtered to `account` / `generator` / `persona` | EntityRef id |
| `file` | file picker (bounded bytes, accepted types), read by Core, passed as text | string |

No conditional fields, no nesting, no layouts. If an input needs more, a bundled module renders its own page form.
A sandboxed module splits the input into steps (separate actions).

### 4.8 Settings

```js
SettingSpec = { key:"scanIntervalMinutes", label:"Check repository every", kind:"integer", min:15, max:240,
                unit:"minutes", default:30, help:"Only while PCMS is open." }
```

The kinds are those of InputSpec except `file`, plus `duration` (rendered as integer + unit). Core persists values in
the module's own storage namespace (`module.<id>.settings`), audited. The module validates on read. The values are
exposed to the module through `ctx.settings`. Secrets are never settings. Settings that need credentials use a
`secretRef` field kind that opens Settings → Connections; only the SecretRef string is stored.

### 4.9 Activity formatting and diagnostics

```js
formatActivity(event) → { text:"Deployed fantasy-names 1.4.0 (Alice) — applied", subject: EntityRef,
                          token:"OK" } | null
diagnostics?: async (ctx) => [{label, value}]   // ≤ 30, shown only in Settings → Diagnostics
```

## 5. Module pages

- **Bundled:** `renderPage(container, api, route)`, where `api` exposes the Core UI primitives (`table`, `picker`,
  `statusPill`, `confirm`, `track(action)`, `link(entityRef)`) and the module's own service. The container is a
  `<section>` that the module owns. The module must not touch other DOM. A boundary test enforces this statically,
  as P021/P026 tests do today.
- **Sandboxed:** `page: { views: [ListView | DetailView] }`, rendered by Core.
  - `ListView = { id, title, columns ≤ 8 (text|status|time|count|entity), rowsFrom:"listRows", rowHref?, actions }`
    with `listRows(ctx, {cursor, filter})` returning bounded pages.
  - `DetailView = { id, title, sections: [{title, facts ≤ 12}], actions }` via `getDetail(ctx, id)`.

  This is deliberately as capable as a module card plus a table. Anything richer has to become a bundled module or
  wait for a proven need.

## 6. Lifecycle behaviour

Core computes a *presentation state* for every module from P022 lifecycle + P011 runtime + contract validation:

| Underlying state | Nav | Facets / search / conditions / columns | Module page | Settings → Modules |
|---|---|---|---|---|
| Active, contract valid | shown | included | normal | "Active" |
| Installing / update awaiting approval | unchanged (old version) | from active generation | normal + banner "Update 0.4.0 awaits approval" | "Review update" |
| Update activating (draining) | shown | omitted for ≤ a few seconds; facets show "Updating…" | banner | "Updating…" |
| Failed activation → rolled back | shown | from last-known-good | banner "Update failed; running 0.9.2" | error detail |
| Disabled | **hidden** | omitted, and dependent generator columns and filters removed | `#/m/<id>` shows "Module disabled · Enable in Settings" | "Enable" |
| Removed (retained for restore) | hidden | omitted | "Module removed" | "Reinstall / Purge" |
| Purged / never installed | hidden | omitted | "This module isn't installed" (deep link stays safe) | absent |
| Incompatible (`contractVersion` unsupported, or descriptor fails validation) | shown greyed | omitted | "Needs a newer PCMS (contract v2)" or "Module UI is invalid" + Diagnostics | "Incompatible" |
| Runtime error (summary/facet throws) | shown with ERROR dot | that call shows "unavailable"; others continue | error card + Retry | "Errors (3) · Details" |
| Recovery hold | shown | shown; mutating actions rendered `HELD` | banner | unchanged |

Other cases:

- **Generation change** (update, disable, enable): Core discards cached contributions and pending previews. A receipt
  whose module generation is no longer current shows "Module was updated — check the result" and links to the
  subject. Durable state is the module's, so nothing is lost.
- **Authority change on update:** handled by P008/P022 approval. The contract adds only human descriptions of
  capabilities, a Core-owned table that maps capability names to plain-language text.
- **HumanTasks of a disabled module** remain in Attention (they are Core records). They are shown with "Deployer is
  disabled — enable it to act", and their action buttons are disabled.

## 7. Adding a module: the edit list

**Bundled module:**

1. `pcms-modules/<id>/**`: service, plus `ui.js` exporting `createUiContribution`.
2. `extension/pcms/integration/bundled-modules.js` (new in U3): one entry `{ moduleId, factory, uiContribution,
   dependsOn }`. This replaces the hard-coded `FACTORY_NAMES` and static imports for UI purposes. Service wiring for
   modules that need other modules' services remains explicit in `composition.js`. That explicitness is intentional
   because cross-module dependencies are reviewed.
3. Tests in `tests/pcms/<phase>/`.

No changes are needed in `app.js`, `index.html`, `deep-links.js`, the Overview, Attention, Search or Activity views.

**Sandboxed module:** an archive with a controller that implements `describeUi`, plus whatever `listRows`,
`getDetail`, `invokeUi`, `summary`, `facet`, `conditions` and `search` methods its descriptor declares. There are no
Core edits.

## 8. Initial contribution plan for existing modules

| Module | nav | summary | listGenerators | facets | conditions | actions (examples) | humanTaskActions |
|---|---|---|---|---|---|---|---|
| Accounts | (primary, Core page) | — | — | account header data | Persona missing, binding mismatch | `rebind` (BINDING), `openPersona` (READ), `rename` (LOCAL) | — |
| Deployer | ✓ | ✓ | ✓ (status, repo, perchance) | generator, account | uncertain, drift, blocked, unmapped folder, failed | `deploy`, `deployFromFile`, `verify`, `compare`, `overwriteDrift`, `acceptPerchance`, `reconcile`, `scanNow`, `pauseTarget`, `setListing` | `deployer.create-generator` → `markCreated` |
| Refresher | ✓ | ✓ | ✓ (cohort) | generator, account | uncertain refresh, budget exhausted | `addToCohort` (bulk), `refreshNow`, `reconcile` | — |
| Explorer | ✓ | ✓ | ✓ (candidate) | generator | stale reservation | `reserve`, `release` | — |
| Statistics | ✓ | ✓ | — | generator, account | — | `export` (READ) | — |
| Provisioning | ✓ | ✓ | — | account | waiting for human, uncertain | `start`, `continue`, `cancel`, `reconcile` | `provisioning.captcha` → `continue` |

Accounts uses Core-owned pages because Account is a Core shared identity (`01-system-architecture.md`). It still
contributes conditions and actions through the same contract, which keeps its actions available to future workflows.
