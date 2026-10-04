# 01 — System Architecture

## Topology

```
PersonaMonkey-PCMS Firefox Developer Edition extension
|
+-- PersonaMonkey subsystem
|   +-- Personas / contextual identities
|   +-- personaUid continuity
|   +-- Mullvad routing + fail-closed guards
|   +-- userscripts
|   +-- workflows/jobs
|   +-- owned-tab execution / external automation
|   +-- control leases
|   +-- existing persistence / compatibility
|
+-- PCMS subsystem
    +-- Persona Broker
    +-- module registry / package store
    +-- sandbox runtime broker
    +-- separate PCMS IndexedDB
    +-- RemoteOps
    +-- ProviderGate
    +-- SecretRef adapter
    +-- HumanTask / Attention
    +-- timers/services
    +-- minimal Audit Journal
    +-- recovery / backup
    +-- PCMS UI shell
    +-- installable modules
```

## Boundary rule

PCMS consumes PersonaMonkey through a typed broker preserving Integration API v1 semantics even though both run in one extension.

PCMS modules never receive PersonaMonkey service objects directly.

## PCMS Core shared identities

- AccountId
- PersonaBinding(AccountId -> personaUid)
- ProviderTargetRef
- RemoteOperation
- SecretRef
- HumanTask
- ModuleInstance/runtime generation

Projects, Deployments, Explorer candidates, Refresher cohorts, Statistics definitions and Provisioning attempts are module-owned.

## Dynamic code

Module controller/UI code executes only in a declared Firefox sandbox page behind authenticated bounded RPC.

Provider/browser automation executes through PersonaMonkey external artifacts/execution. PCMS does not create a second `browser.userScripts` authority.

## Persistence

PersonaMonkey keeps its existing storage/compatibility. PCMS owns a separate IndexedDB to avoid coupling PCMS migrations to PersonaMonkey state schema.

Authoritative PCMS state transition and its audit append are transactionally atomic when both belong to PCMS storage.

The Audit Journal is append/read/projection infrastructure only. It is not an event-sourced domain store or workflow bus.

## Remote mutation

PCMS RemoteOps provides durable target-level operation identity/fencing across restarts/module updates.

PersonaMonkey control leases provide short browser-control exclusivity.

Both participate in mutating browser operations; neither substitutes for the other.

## Recovery

Restore activates PCMS in `RECOVERY_HOLD`. Module generations, unresolved RemoteOps, Persona bindings and provider capabilities reconcile before mutation is re-enabled. Missed timers are not replayed as an unbounded backlog.
