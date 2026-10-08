# P039: add capability-gated Perchance verification and drift handling

Confirmed deployments now establish a hash-only provider baseline when observation
is compatible. Repository checks enqueue bounded, oldest-first background reads
through PersonaMonkey execution artifacts, with durable spacing and recovery.
Changes on the provider pause the affected target; UNKNOWN listing stays neutral.
Generator details expose Verify, ephemeral Compare/download, and typed, fenced
Keep/Overwrite choices. Kept baselines retain their listing/thumbnail identity;
explicit resume and a new repository release prepare fresh operations atomically.
Challenges produce one durable HumanTask and stop automatic observation passes.

Production Perchance observation remains disabled pending final live compatibility
acceptance. Browser automation remains within the Persona Broker; no new browser
or userscript authority is introduced.

Validation: `npm run verify` passed; 29 P039 tests and 42 P028/P029 background/timer
regressions passed. The pinned Firefox 154.0b10 packaged loopback diagnostic passed
on a clean source checkpoint, including real execution reads, zero-tab alarm wake,
drift pause, spacing and challenge recovery. Local content sandbox was disabled
because the container cannot create its namespace; independent sandbox-enabled
Actions and merged-main verification remain required. Evidence maps A039-01/02/03
in `docs/evidence/P039/README.md`. Scope is P039 only.
