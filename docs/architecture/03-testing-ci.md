# 03 — Testing and CI

## Evidence classes

- U — unit
- I — integration
- C — contract/schema
- E — provider emulator
- FDE — real exact-pinned Firefox Developer Edition
- PKG — packaged XPI/install/restart/update
- FAULT — deterministic fault injection
- SEC — security/redaction/static
- LIVE — operator-controlled real provider/routing acceptance

## Doctrine

P001–P024 close through deterministic repository/Actions evidence appropriate to the phase. P025–P026 are the only required real provider/routing phases.

Firefox Developer Edition in Actions is deterministic browser evidence, not LIVE provider evidence.

Never claim an inaccessible scenario passed.

When LIVE behavior disagrees with the emulator/fixture, encode the observation into deterministic regression evidence before continuing live debugging.

Required CI is independent of the implementation agent's local claims.
