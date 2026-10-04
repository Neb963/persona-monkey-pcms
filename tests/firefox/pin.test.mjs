import assert from "node:assert/strict";
import { test } from "node:test";
import { loadBrowserPin, validateBrowserPin } from "../../tools/firefox/lib.mjs";

test("P001 pins one exact Mozilla Developer Edition build", async () => {
  const pin = await loadBrowserPin();
  assert.equal(pin.product, "firefox-developer-edition");
  assert.equal(pin.channel, "developer");
  assert.equal(pin.version, "153.0b10");
  assert.equal(pin.platform, "linux-x86_64");
  assert.equal(pin.locale, "en-US");
  assert.equal(
    pin.archive.sha256,
    "d38ddd87ce4f0e7ab7b7fce6ea6e74a7c9789005be8842a2967eb357d16685fa",
  );
  assert.equal(
    pin.checksumManifest.entry,
    "linux-x86_64/en-US/firefox-153.0b10.tar.xz",
  );
});

test("pin validation rejects a moving or non-Mozilla artifact", () => {
  assert.throws(
    () => validateBrowserPin({
      schemaVersion: 1,
      product: "firefox-developer-edition",
      channel: "developer",
      version: "153.0b10",
      platform: "linux-x86_64",
      locale: "en-US",
      archive: {
        fileName: "firefox-153.0b10.tar.xz",
        url: "https://example.com/latest/firefox.tar.xz",
        sha256: "a".repeat(64),
      },
      checksumManifest: {
        url: "https://archive.mozilla.org/pub/devedition/releases/153.0b10/SHA256SUMS",
        entry: "linux-x86_64/en-US/firefox-153.0b10.tar.xz",
      },
    }),
    /Mozilla archive/,
  );
});
