# ROADMAP

> Generated from docs/implementation/v1/plan.json. Do not hand-edit.

## P000 — Repository bootstrap / architecture freeze
Status: **ACCEPTED**  
Depends on: none  
Merge wave: 0

- [x] T000.1 — T000.1 Bootstrap authority and provenance
- [x] T000.2 — T000.2 Establish claim/CI governance
- [x] T000.3 — T000.3 Verify generated views

## P001 — Hosted CI + pinned Firefox Developer Edition harness
Status: **ACCEPTED**  
Depends on: P000  
Merge wave: 1

- [x] T001.1 — T001.1 Pin exact Mozilla FDE artifact
- [x] T001.2 — T001.2 Build isolated profile/install harness
- [x] T001.3 — T001.3 Prove browser CI evidence

## P002 — Import and preserve PersonaMonkey baseline
Status: **ACCEPTED**  
Depends on: P001  
Merge wave: 1

- [x] T002.1 — T002.1 Import exact upstream tree
- [x] T002.2 — T002.2 Reconcile public-repo provenance
- [x] T002.3 — T002.3 Prove inherited release baseline

## P003 — PCMS namespace/UI entry + internal Persona Broker contract
Status: **READY**  
Depends on: P002  
Merge wave: 2

- [ ] T003.1 — T003.1 Define broker contract
- [ ] T003.2 — T003.2 Add PCMS namespace/bootstrap
- [ ] T003.3 — T003.3 Contract parity tests

## P004 — Firefox sandbox dynamic-controller capability spike
Status: **READY**  
Depends on: P002  
Merge wave: 2

- [ ] T004.1 — T004.1 Sandbox runtime probe
- [ ] T004.2 — T004.2 Authenticated bounded RPC
- [ ] T004.3 — T004.3 Lifecycle/isolation acceptance

## P005 — PCMS IndexedDB storage broker + migrations
Status: **READY**  
Depends on: P002  
Merge wave: 2

- [ ] T005.1 — T005.1 DB/migration authority
- [ ] T005.2 — T005.2 Namespaced storage/CAS
- [ ] T005.3 — T005.3 restart/failure tests

## P006 — PCMS SecretStore host + SecretRef abstraction
Status: **READY**  
Depends on: P002  
Merge wave: 2

- [ ] T006.1 — T006.1 SecretRef contract
- [ ] T006.2 — T006.2 narrow native host/backend
- [ ] T006.3 — T006.3 redaction/failure tests

## P007 — Minimal Audit Journal
Status: **BLOCKED**  
Depends on: P005  
Merge wave: 3

- [ ] T007.1 — T007.1 Event schema/atomic append
- [ ] T007.2 — T007.2 read/projection API
- [ ] T007.3 — T007.3 replay tests

## P008 — Module archive/package/authority model
Status: **BLOCKED**  
Depends on: P004, P005  
Merge wave: 3

- [ ] T008.1 — T008.1 bounded parser/hash identity
- [ ] T008.2 — T008.2 authority envelope/delta
- [ ] T008.3 — T008.3 immutable candidate lifecycle

## P009 — Persona Broker implementation
Status: **BLOCKED**  
Depends on: P003  
Merge wave: 3

- [ ] T009.1 — T009.1 Integration-semantic facade
- [ ] T009.2 — T009.2 capability/lease/execution mapping
- [ ] T009.3 — T009.3 parity/failure tests

## P010 — RemoteOps + ProviderGate + recovery hold
Status: **BLOCKED**  
Depends on: P005, P009  
Merge wave: 4

- [ ] T010.1 — T010.1 durable RemoteOps
- [ ] T010.2 — T010.2 ProviderGate
- [ ] T010.3 — T010.3 uncertain/recovery tests

## P011 — Module runtime / capability RPC / generation fencing
Status: **BLOCKED**  
Depends on: P008, P010  
Merge wave: 4

- [ ] T011.1 — T011.1 runtime broker/mailboxes
- [ ] T011.2 — T011.2 capability RPC
- [ ] T011.3 — T011.3 draining/update/recovery

## P012 — HumanTask/Attention + timers/services
Status: **BLOCKED**  
Depends on: P007, P011  
Merge wave: 4

- [ ] T012.1 — T012.1 HumanTask/Attention
- [ ] T012.2 — T012.2 timers
- [ ] T012.3 — T012.3 service registry/restart tests

## P013 — Perchance provider adapter + emulator
Status: **BLOCKED**  
Depends on: P009, P010  
Merge wave: 4

- [ ] T013.1 — T013.1 compatibility probe
- [ ] T013.2 — T013.2 deterministic emulator
- [ ] T013.3 — T013.3 fail-closed adapter tests

## P014 — Accounts module + Account↔personaUid binding
Status: **BLOCKED**  
Depends on: P011, P013  
Merge wave: 5

- [ ] T014.1 — T014.1 account model
- [ ] T014.2 — T014.2 Persona binding/rebind
- [ ] T014.3 — T014.3 rotation continuity

## P015 — Deployer module
Status: **BLOCKED**  
Depends on: P014, P013  
Merge wave: 5

- [ ] T015.1 — T015.1 desired/observed model
- [ ] T015.2 — T015.2 stable target mutation
- [ ] T015.3 — T015.3 reconciliation/UI

## P016 — Explorer module
Status: **BLOCKED**  
Depends on: P014, P013  
Merge wave: 5

- [ ] T016.1 — T016.1 discovery/candidates
- [ ] T016.2 — T016.2 durable claim/reconciliation
- [ ] T016.3 — T016.3 module UI/integration

## P017 — Refresher module
Status: **BLOCKED**  
Depends on: P014, P013  
Merge wave: 5

- [ ] T017.1 — T017.1 cohort/eligibility
- [ ] T017.2 — T017.2 schedules/budgets
- [ ] T017.3 — T017.3 isolation/confirmed-effect tests

## P018 — Statistics module
Status: **BLOCKED**  
Depends on: P007, P011  
Merge wave: 5

- [ ] T018.1 — T018.1 metric projection model
- [ ] T018.2 — T018.2 replay/late-event handling
- [ ] T018.3 — T018.3 UI/export

## P019 — Account Provisioning module
Status: **BLOCKED**  
Depends on: P006, P012, P014, P013  
Merge wave: 5

- [ ] T019.1 — T019.1 provisioning state machine
- [ ] T019.2 — T019.2 HumanTask/session guard
- [ ] T019.3 — T019.3 uncertain/CAPTCHA-safe tests

## P020 — Backup/restore + retention
Status: **BLOCKED**  
Depends on: P007, P010, P011  
Merge wave: 6

- [ ] T020.1 — T020.1 snapshot/backup
- [ ] T020.2 — T020.2 staged restore
- [ ] T020.3 — T020.3 RECOVERY_HOLD reconciliation

## P021 — PCMS UI shell / notifications / search
Status: **BLOCKED**  
Depends on: P012, P014  
Merge wave: 6

- [ ] T021.1 — T021.1 navigation/attention shell
- [ ] T021.2 — T021.2 search/projections
- [ ] T021.3 — T021.3 deep-link safety

## P022 — Module lifecycle end-to-end
Status: **BLOCKED**  
Depends on: P011, P020  
Merge wave: 6

- [ ] T022.1 — T022.1 install/update
- [ ] T022.2 — T022.2 disable/remove/purge
- [ ] T022.3 — T022.3 rollback/retention acceptance

## P023 — Full module integration wave
Status: **BLOCKED**  
Depends on: P015, P016, P017, P018, P019, P020, P021, P022  
Merge wave: 7

- [ ] T023.1 — T023.1 cross-module contracts
- [ ] T023.2 — T023.2 integration-wave CI
- [ ] T023.3 — T023.3 combined recovery acceptance

## P024 — Adversarial/security/fault/release-candidate hardening
Status: **BLOCKED**  
Depends on: P023  
Merge wave: 8

- [ ] T024.1 — T024.1 fault/security matrix
- [ ] T024.2 — T024.2 reproducible package
- [ ] T024.3 — T024.3 clean install/update/restart

## P025 — Live acceptance 1 — installed FDE + PersonaMonkey/Mullvad/Perchance
Status: **BLOCKED**  
Depends on: P024  
Merge wave: 9

- [ ] T025.1 — T025.1 clean live install
- [ ] T025.2 — T025.2 protected routing/Persona continuity
- [ ] T025.3 — T025.3 provider/session compatibility

## P026 — Live acceptance 2 — representative mutations + recovery + final acceptance
Status: **BLOCKED**  
Depends on: P025  
Merge wave: 10

- [ ] T026.1 — T026.1 representative feature mutations
- [ ] T026.2 — T026.2 restore/update/recovery
- [ ] T026.3 — T026.3 final human acceptance

