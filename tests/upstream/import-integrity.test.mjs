import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const manifest = JSON.parse(await readFile("docs/upstream/import-manifest.json", "utf8"));

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

test("frozen PersonaMonkey provenance coordinates are immutable", () => {
  assert.equal(manifest.upstream.repository, "Neb963/persona-router");
  assert.equal(manifest.upstream.commitSha, "9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf");
  assert.equal(manifest.upstream.treeSha, "9d59d800c3a687b2e7360c64d9dd859d701d6ba5");
  assert.equal(manifest.upstream.version, "1.2.0");
  assert.equal(manifest.upstream.frozenCiRunId, 36412342425);
  assert.equal(manifest.upstream.frozenCiConclusion, "success");
  assert.equal(manifest.upstream.expectedXpiSha256, "928b94a871d70455e42c2a8269a7adec27c59b3c5937e7618f80da218fb126e1");
});

test("all 223 frozen upstream blobs remain byte-identical", async () => {
  assert.equal(manifest.entries.length, 223);
  const seen = new Set();
  for (const entry of manifest.entries) {
    assert.equal(seen.has(entry.sourcePath), false, `duplicate source path: ${entry.sourcePath}`);
    seen.add(entry.sourcePath);
    const bytes = await readFile(entry.destinationPath);
    assert.equal(bytes.length, entry.size, `size drift: ${entry.sourcePath}`);
    assert.equal(gitBlobSha(bytes), entry.sourceBlobSha, `blob drift: ${entry.sourcePath}`);
  }
});

test("root package composes PCMS verification without mutating upstream package bytes", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));
  const upstream = JSON.parse(await readFile("docs/upstream/source/package.json", "utf8"));
  assert.equal(root.name, "persona-monkey-pcms");
  assert.equal(root.version, upstream.version);
  assert.equal(root.version, "1.2.0");
  assert.equal(root.engines.node, upstream.engines.node);
  assert.equal(typeof root.scripts["verify:repo"], "string");
  assert.equal(typeof root.scripts["test:firefox"], "string");
  assert.equal(typeof root.scripts["verify:upstream"], "string");
});
