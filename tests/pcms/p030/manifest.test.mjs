import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MODULE_RUNTIME_CONTROLLER_PAGE,
  MODULE_RUNTIME_UI_PAGE,
  assessSandboxCsp,
  assessSandboxManifest
} from "../../../extension/pcms/runtime/browser-floor.js";

function directives(csp) {
  const out = new Map();
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name) out.set(name, sources);
  }
  return out;
}

const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
const fragment = JSON.parse(await readFile("extension/pcms/sandbox/manifest-fragment.json", "utf8"));
const sandboxCsp = manifest.content_security_policy.sandbox;

test("A030-01 production manifest declares the controller and module-UI sandbox pages", async () => {
  assert.deepEqual(manifest.sandbox.pages, [MODULE_RUNTIME_CONTROLLER_PAGE, MODULE_RUNTIME_UI_PAGE]);
  for (const page of manifest.sandbox.pages) await readFile("extension/" + page, "utf8");
  // Only the sandbox policy is set: extension pages keep Firefox's MV3 default CSP.
  assert.deepEqual(Object.keys(manifest.content_security_policy), ["sandbox"]);
  assert.equal(assessSandboxManifest(manifest), null);
  // ADR-003 open decision default (b): ESR 153 stays installable; modules report UNAVAILABLE there.
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "153.0");
});

test("A030-01 SEC sandbox CSP grants no network, no same-origin and no nested browsing contexts", () => {
  const policy = directives(sandboxCsp);
  assert.deepEqual(policy.get("sandbox"), ["allow-scripts"]);
  assert.doesNotMatch(sandboxCsp, /allow-same-origin|allow-top-navigation|allow-popups|allow-forms|allow-modals/);
  assert.deepEqual(policy.get("default-src"), ["'none'"]);
  for (const name of ["connect-src", "frame-src", "child-src", "worker-src", "object-src", "media-src", "base-uri", "form-action", "manifest-src"]) {
    assert.deepEqual(policy.get(name), ["'none'"], name);
  }
  assert.deepEqual(policy.get("script-src"), ["'self'", "'unsafe-eval'"]);
  assert.doesNotMatch(sandboxCsp, /https?:|wss?:|blob:|\*/);
  assert.equal(assessSandboxCsp(sandboxCsp), true);
  for (const unsafe of [
    sandboxCsp.replace("sandbox allow-scripts", "sandbox allow-scripts allow-same-origin"),
    sandboxCsp.replace("connect-src 'none'", "connect-src https://example.invalid"),
    sandboxCsp.replace("default-src 'none'", "default-src *"),
    sandboxCsp.replace("frame-src 'none'", "frame-src 'self'"),
    sandboxCsp.replace("sandbox allow-scripts; ", "")
  ]) assert.equal(assessSandboxCsp(unsafe), false, unsafe);
});

test("A030-01 SEC controller page meta-CSP restores the accepted P004 controller policy", async () => {
  const html = await readFile("extension/pcms/sandbox/controller.html", "utf8");
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(meta, "controller.html carries a tightening meta CSP");
  assert.ok(html.indexOf(meta[0]) < html.indexOf("<script"), "meta CSP precedes every script");
  const tightened = directives(meta[1]);
  const p004 = directives(fragment.content_security_policy.sandbox);
  // Every P004 fetch directive is enforced at least as strictly by manifest ∩ meta.
  for (const [name, sources] of p004) {
    if (name === "sandbox") continue;
    assert.deepEqual(tightened.get(name), sources, name);
  }
  assert.deepEqual(fragment.sandbox.pages, [MODULE_RUNTIME_CONTROLLER_PAGE]);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /<(?:iframe|form|img|link)\b/i);
});

test("A030-01 SEC module-UI page is inert until P033 and has no external surface", async () => {
  const html = await readFile("extension/pcms/sandbox/module-ui.html", "utf8");
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /<(?:script|iframe|form|object|embed|link)\b/i);
});

test("A030-01 SEC sandbox pages and frame factory never touch extension APIs", async () => {
  const files = [
    "extension/pcms/sandbox/controller.html",
    "extension/pcms/sandbox/module-ui.html",
    "extension/pcms/background/sandbox/frame-factory.js",
    "extension/pcms/runtime/browser-floor.js"
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /\bbrowser\.|\bchrome\.|indexedDB|userScripts|runtime\.sendNativeMessage/, file);
  }
});
