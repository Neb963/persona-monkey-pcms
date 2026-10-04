# 00 — Principles and Scope

## Product goal

Build the quickest maintainable PCMS by reusing PersonaMonkey's proven Firefox/Persona/routing/browser-execution substrate while keeping PCMS product policy modular and replaceable.

## Invariants

1. PersonaMonkey remains authority for Persona/browser/routing behavior.
2. PCMS modules cannot reach raw privileged browser or PersonaMonkey internals.
3. External mutations have durable identity before dispatch and reconcile after ambiguity.
4. Unknown provider behavior fails closed.
5. Durable Account-to-Persona binding uses `personaUid`, never `cookieStoreId`.
6. Module updates cannot allow stale runtimes to keep writing.
7. Secret values are references outside ordinary domain/event/log payloads.
8. UI/search/statistics are projections, not operational authority.
9. Restore enters recovery hold before mutation resumes.
10. Runtime-installable modules do not require rebuilding the whole extension.

## Deliberate non-goals for V1

- no global workflow language;
- no universal scheduler/queue framework;
- no generic resource-lock manager;
- no second PCMS userscript/browser-execution runtime;
- no Chromium product target;
- no Firefox DevTools MCP dependency;
- no CAPTCHA bypass/automatic solving.

Shared abstractions are introduced only when multiple concrete consumers demonstrate the same correctness requirement.
