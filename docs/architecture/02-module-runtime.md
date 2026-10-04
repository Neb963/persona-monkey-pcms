# 02 — Module Runtime

A PCMS module is an immutable, hashed package admitted without rebuilding the extension.

Controller/UI JavaScript executes only in a declared Firefox sandbox page. The privileged parent exposes bounded typed RPC capabilities; it never passes raw WebExtension APIs.

Browser/page automation is delegated to PersonaMonkey external automation using exact artifact hashes, expected Persona identity and control-lease semantics.

Core owns runtime generation. Update/disable advances the generation before replacement admission; stale runtimes cannot write, call services or dispatch remote mutations.

Authority expansion on update requires explicit approval. The old active package remains last-known-good until the candidate is admitted.

Core supplies only shared correctness mechanisms. Feature queues, cohorts, schedules and domain policy remain module-owned.
