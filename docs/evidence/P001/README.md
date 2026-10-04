# P001 — Hosted CI + pinned Firefox Developer Edition harness

Status: **CI_VERIFIED on implementation checkpoint**

Implementation checkpoint: `f4a6c7e3b897d0fa869bbdec7742b61be5464af3`.

## A001-01 — exact Mozilla Developer Edition pin

The repository pins one immutable Linux x86_64 / en-US Firefox Developer Edition artifact:

- version: `153.0b10`;
- archive: `https://archive.mozilla.org/pub/devedition/releases/153.0b10/linux-x86_64/en-US/firefox-153.0b10.tar.xz`;
- SHA-256: `d38ddd87ce4f0e7ab7b7fce6ea6e74a7c9789005be8842a2967eb357d16685fa`;
- Mozilla checksum manifest: `https://archive.mozilla.org/pub/devedition/releases/153.0b10/SHA256SUMS`, entry `linux-x86_64/en-US/firefox-153.0b10.tar.xz`.

The pin validator rejects moving/non-Mozilla URLs and requires an exact SHA-256 before installation.

## A001-02 — isolated install/profile harness

`tools/firefox/install-pinned.mjs` downloads to a partial file, verifies SHA-256 before promoting/extracting it, verifies the extracted binary version, and exports the exact binary path.

`tools/firefox/smoke.mjs` creates a unique disposable profile with CI-safe preferences, launches only that explicit profile with `--no-remote`, and writes a machine-readable smoke report.

GitHub Actions run `37227774523`, job `111510886448`, passed all five harness contract tests and the exact pinned installation step on Ubuntu 24.04.

## A001-03 — hosted Firefox evidence

The same run `37227774523` executed the pinned binary:

- reported version: `Mozilla Firefox 153.0b10`;
- verified artifact SHA-256: `d38ddd87ce4f0e7ab7b7fce6ea6e74a7c9789005be8842a2967eb357d16685fa`;
- profile isolation: explicit disposable profile;
- headless smoke screenshot: `8169` bytes;
- smoke result: `passed: true`;
- uploaded artifact: `firefox-developer-edition-smoke`, artifact ID `11313300103`, digest `sha256:9552b8c165b1bd8abb79d44c72392fa2b42c91c4580a937d86a82b6c6ecebe63`.

Repository verification run `37227774512` also passed on the same implementation checkpoint.

The hosted runner logs a Firefox user-namespace sandbox diagnostic (`CanCreateUserNamespace() ... EPERM`); Firefox still launched successfully and produced the expected screenshot. This is recorded as runner-environment evidence rather than treated as a provider/live-browser acceptance result.

## Failed attempt retained

Firefox workflow run `37227715979` failed at workflow validation because `runner.temp` was initially referenced from job-level `env`. No acceptance evidence was taken from that run. Commit `f4a6c7e3b897d0fa869bbdec7742b61be5464af3` moved runner-dependent paths to step-level environments, after which both required workflows passed.

