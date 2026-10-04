# PersonaMonkey-PCMS

PersonaMonkey-PCMS is the public implementation repository for the next PCMS architecture: a PersonaMonkey-derived Firefox Developer Edition extension with a separately owned, capability-bounded PCMS subsystem.

## Current state

- **Bootstrap:** P000 in progress
- **PersonaMonkey import baseline:** `Neb963/persona-router@9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`
- **Product feature implementation:** not started

This repository intentionally starts with governance and architecture before importing or changing PersonaMonkey runtime code.

The target operating model is machine-readable phase/claim authority, parallel non-conflicting agents, independent GitHub Actions verification, and only the final two phases requiring real provider/routing acceptance.

Operator credentials, browser sessions, and Mullvad WireGuard material must not be committed to this public repository.
