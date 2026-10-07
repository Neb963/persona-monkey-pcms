// T030.3 packaged proof (A030-01 FDE, A030-02 FDE/PKG/SEC, A030-03 FDE).
//
// The product XPI is installed once into the exact pinned Developer Edition. From a
// product extension page the harness reaches the real background page document
// (runtime.getBackgroundPage) and frames the shipped pcms/sandbox/controller.html in
// it, exactly as the P030 frame factory does. Controller source is generated here at
// run time with a random nonce, so it cannot be part of the XPI. The harness plays the
// P004 host side over a private MessagePort and grants no capability.
// Nothing is injected into the product XPI.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileText, loadBrowserPin, sha256File, writeJson } from '../../../tools/firefox/lib.mjs';
import { PackagedFirefox, waitFor } from '../../../tools/firefox/packaged-harness.mjs';
import { evaluateModuleRuntimeFloor, parseFirefoxMajor } from '../../../extension/pcms/runtime/browser-floor.js';

const PRODUCT = 'persona-route-manager@local';
const root = resolve(process.env.FIREFOX_PACKAGED_DIR || join(tmpdir(), 'pcms-firefox-p030'));
const reportPath = resolve(process.env.FIREFOX_P030_REPORT || join(root, 'p030-report.json'));
const pin = await loadBrowserPin();
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const xpi = resolve(`dist/persona-route-manager-v${manifest.version}.xpi`);
const report = { schemaVersion: 1, phase: 'P030', commitSha: process.env.GITHUB_SHA ||
  (await execFileText('git', ['rev-parse', 'HEAD'])).stdout.trim(),
  workflowRun: process.env.GITHUB_RUN_ID || null, version: pin.version,
  artifactSha256: pin.archive.sha256, productXpiSha256: await sha256File(xpi),
  osContentSandboxDisabled: process.env.MOZ_DISABLE_CONTENT_SANDBOX === '1', checks: {}, facts: {} };

let h, server;
async function page(code, args = []) {
  const result = await h.pageScript(`const done = arguments[arguments.length - 1];
    (async () => { const api = window.wrappedJSObject.browser; const w = window.wrappedJSObject; ${code} })()
      .then(value => done({ok:true,value:JSON.parse(JSON.stringify(value ?? null))}),
        error => done({ok:false,error:String(error && error.stack || error)}));`, args, { async: true });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

// Runs in a product extension page. arguments[0] = page path, arguments[1] = controller
// source, arguments[2] = network URL that must stay unreachable.
const FRAME_IN_BACKGROUND = `
  const [pagePath, source, networkUrl] = [arguments[0], arguments[1], arguments[2]];
  const bg = await api.runtime.getBackgroundPage();
  const doc = bg.document;
  const out = { backgroundUrl: String(bg.location.href), framesBefore: doc.querySelectorAll('iframe').length };
  const frame = doc.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('hidden', '');
  frame.setAttribute('data-pcms-module', 'p030.packaged-proof');
  frame.setAttribute('data-pcms-generation', '1');
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sandbox frame load timeout')), 8000);
    frame.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
    frame.setAttribute('src', api.runtime.getURL(pagePath));
    (doc.body || doc.documentElement).appendChild(frame);
  });
  out.frameInBackgroundDocument = frame.ownerDocument === doc && doc.querySelectorAll('iframe').length === out.framesBefore + 1;
  out.contentDocumentNull = frame.contentDocument === null;
  try { void frame.contentWindow.document.title; out.contentWindowDocumentThrows = false; }
  catch { out.contentWindowDocumentThrows = true; }
  if (!source) { frame.remove(); out.framesAfterRemove = doc.querySelectorAll('iframe').length; return out; }

  const sessionId = 'p030-' + Math.random().toString(16).slice(2);
  const channel = new bg.MessageChannel();
  const port = channel.port1;
  const pending = new Map();
  const capabilityCalls = [];
  let readyResolve; const ready = new Promise(resolve => { readyResolve = resolve; });
  const send = (message) => port.postMessage(bg.JSON.parse(JSON.stringify(message)));
  port.addEventListener('message', (event) => {
    const message = JSON.parse(JSON.stringify(event.data));
    if (message.sessionId !== sessionId) return;
    if (message.type === 'ready') { readyResolve(); return; }
    if (message.type === 'response') { pending.get(message.requestId)?.(message); pending.delete(message.requestId); return; }
    if (message.type === 'capability.call') {
      // No capability is granted to this controller: every call is denied.
      capabilityCalls.push(message.capability);
      send({ version: 1, sessionId, type: 'capability.result', callId: message.callId, ok: false,
        error: { code: 'PCMS_SANDBOX_CAPABILITY_DENIED', message: 'Capability is not granted' } });
    }
  });
  port.start();
  let sequence = 0;
  const request = (method, params) => new Promise((resolve, reject) => {
    const requestId = 'req-' + (++sequence);
    const timer = setTimeout(() => reject(new Error('controller request timeout: ' + method)), 8000);
    pending.set(requestId, (message) => { clearTimeout(timer); resolve(message); });
    send({ version: 1, sessionId, type: 'request', requestId, method, params });
  });
  frame.contentWindow.postMessage(bg.JSON.parse(JSON.stringify({ type: 'pcms.sandbox.bootstrap', version: 1, sessionId })),
    '*', bg.Array.of(channel.port2));
  await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('controller bootstrap timeout')), 8000))]);
  out.bootstrapped = true;
  out.load = await request('controller.load', { source, initial: { networkUrl } });
  out.denied = await request('controller.invoke', { method: 'callUngranted', args: null });
  out.capabilityCalls = capabilityCalls.slice();
  out.dispose = await request('controller.dispose', {});
  port.close();
  frame.remove();
  out.framesAfterRemove = doc.querySelectorAll('iframe').length;
  return out;
`;

function controllerSource(nonce) {
  // Supplied at run time; never written into the extension tree.
  return `(api) => ({
    async start(initial) {
      const facts = { nonce: ${JSON.stringify(nonce)}, computed: 40 + 2, protocolVersion: api.version,
        browserAbsent: typeof browser === 'undefined', chromeAbsent: typeof chrome === 'undefined',
        selfOrigin: String(self.origin) };
      try { void parent.document.title; facts.parentDocumentBlocked = false; } catch { facts.parentDocumentBlocked = true; }
      try { await fetch(initial.networkUrl); facts.networkBlocked = false; } catch { facts.networkBlocked = true; }
      try { indexedDB.open('p030'); facts.indexedDbBlocked = false; } catch { facts.indexedDbBlocked = true; }
      try { void localStorage.length; facts.localStorageBlocked = false; } catch { facts.localStorageBlocked = true; }
      facts.imageBlocked = await new Promise((resolve) => {
        const image = new Image();
        const timer = setTimeout(() => resolve(true), 3000);
        image.onload = () => { clearTimeout(timer); resolve(false); };
        image.onerror = () => { clearTimeout(timer); resolve(true); };
        image.src = new URL('../../icons/icon48.png', location.href).href;
      });
      return facts;
    },
    async callUngranted() {
      try { await api.call('module.storage.write', { key: 'k', value: 'v' }); return { denied: false }; }
      catch (error) { return { denied: true, code: error.code }; }
    },
    dispose() { return { disposed: true }; }
  })`;
}

try {
  if (process.env.CI) assert.equal(report.osContentSandboxDisabled, false, 'CI acceptance must enable the OS content sandbox');
  await mkdir(root, { recursive: true });
  h = await PackagedFirefox.create({ root: join(root, 'profiles-p030') });
  await h.start();
  assert.equal(await h.install(xpi), PRODUCT);
  let tab = await h.openPage(PRODUCT, 'popup/popup.html');

  const platform = await page(`return { info: await api.runtime.getBrowserInfo(), manifest: api.runtime.getManifest() };`);
  report.facts.browser = { name: platform.info.name, version: platform.info.version };
  // The pinned 154.0b10 build reports runtime.getBrowserInfo().version as "154.0" (CI observation):
  // the floor compares the major version only.
  assert.equal(platform.info.name, 'Firefox');
  assert.equal(parseFirefoxMajor(platform.info.version), parseFirefoxMajor(pin.version));
  assert.equal(evaluateModuleRuntimeFloor({ browserInfo: platform.info, manifest: platform.manifest }).state, 'AVAILABLE');
  report.checks.floorAvailableInPinnedBuild = true;
  assert.deepEqual(platform.manifest.sandbox?.pages, manifest.sandbox.pages, 'pinned build accepts the manifest sandbox key');
  report.checks.pinnedBuildAcceptsSandboxManifest = true;

  // A030-01 FDE: both declared pages load as opaque-origin frames of the background document.
  for (const pagePath of manifest.sandbox.pages) {
    const isolated = await page(FRAME_IN_BACKGROUND, [pagePath, null, null]);
    assert.equal(isolated.frameInBackgroundDocument, true, pagePath);
    assert.equal(isolated.contentDocumentNull, true, pagePath);
    assert.equal(isolated.contentWindowDocumentThrows, true, pagePath);
    assert.equal(isolated.framesAfterRemove, isolated.framesBefore, pagePath);
    report.facts[pagePath] = isolated;
  }
  report.checks.declaredSandboxPagesAreIsolatedBackgroundFrames = true;

  // A030-02: runtime-supplied controller source executes in a background-hosted sandbox frame.
  let networkRequests = 0;
  server = createServer((_req, res) => { networkRequests++; res.end('unexpected'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const networkUrl = `http://127.0.0.1:${server.address().port}/must-be-blocked`;
  const nonce = randomBytes(16).toString('hex');
  const run = await page(FRAME_IN_BACKGROUND, ['pcms/sandbox/controller.html', controllerSource(nonce), networkUrl]);
  report.facts.controllerRun = run;
  assert.ok(run.backgroundUrl.startsWith('moz-extension://'));
  assert.equal(run.frameInBackgroundDocument, true);
  assert.equal(run.contentDocumentNull, true);
  assert.equal(run.bootstrapped, true);
  assert.equal(run.load.ok, true, JSON.stringify(run.load));
  const facts = run.load.result;
  assert.equal(facts.nonce, nonce, 'the executed controller is the one supplied at run time');
  assert.equal(facts.computed, 42);
  assert.equal(facts.protocolVersion, 1);
  assert.equal(facts.browserAbsent, true);
  assert.equal(facts.chromeAbsent, true);
  assert.equal(facts.selfOrigin, 'null');
  assert.equal(facts.parentDocumentBlocked, true);
  assert.equal(facts.networkBlocked, true);
  assert.equal(networkRequests, 0);
  assert.equal(facts.indexedDbBlocked, true);
  assert.equal(facts.localStorageBlocked, true);
  assert.equal(facts.imageBlocked, true, 'controller meta-CSP blocks images');
  assert.deepEqual(run.denied.result, { denied: true, code: 'PCMS_SANDBOX_CAPABILITY_DENIED' });
  assert.deepEqual(run.capabilityCalls, ['module.storage.write']);
  assert.deepEqual(run.dispose.result, { disposed: true });
  assert.equal(run.framesAfterRemove, run.framesBefore);
  report.checks.runtimeControllerExecutesInBackgroundSandboxFrame = true;
  report.checks.ungrantedCapabilityDeniedAndNoAmbientAuthority = true;
  await new Promise(resolve => server.close(resolve)); server = null;

  // A030-03: frames are ephemeral. An event-page unload discards the background
  // document; the next wake starts with no controller frame.
  const leftBehind = await page(`const bg = await api.runtime.getBackgroundPage();
    const frame = bg.document.createElement('iframe'); frame.setAttribute('sandbox','allow-scripts');
    frame.setAttribute('data-pcms-generation','7'); frame.setAttribute('src', api.runtime.getURL('pcms/sandbox/controller.html'));
    bg.document.body.appendChild(frame); return bg.document.querySelectorAll('iframe').length;`);
  assert.equal(leftBehind, 1, 'a controller frame is attached before the unload');
  await h.closePage(tab);
  await h.setIdleTimeout(500);
  report.unload = await h.forceIdleUnload(PRODUCT);
  await h.resetIdleTimeout();
  tab = await h.openPage(PRODUCT, 'popup/popup.html');
  const afterWake = await waitFor(() => page(`const bg = await api.runtime.getBackgroundPage();
    return { frames: bg.document.querySelectorAll('iframe').length };`).catch(() => null), 'background wakes after unload');
  assert.equal(afterWake.frames, 0, 'no controller frame survives an event-page unload');
  report.checks.framesDisposedOnUnload = true;
  await h.closePage(tab);
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = String(error.stack || error); throw error;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await h?.stop();
  await writeJson(reportPath, report);
  if (h) await rm(h.profilePath, { recursive: true, force: true });
}
console.log(JSON.stringify(report));
