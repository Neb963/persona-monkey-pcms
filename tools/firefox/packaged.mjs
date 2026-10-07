import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileText, loadBrowserPin, sha256File, writeJson } from './lib.mjs';
import { PackagedFirefox, waitFor } from './packaged-harness.mjs';

const PRODUCT = 'persona-route-manager@local';
const PROBE = 'pcms-platform-probe@tests';
const root = resolve(process.env.FIREFOX_PACKAGED_DIR || join(tmpdir(), 'pcms-firefox-packaged'));
const reportPath = resolve(process.env.FIREFOX_PACKAGED_REPORT || join(root, 'report.json'));
const pin = await loadBrowserPin();
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const xpi = resolve(`dist/persona-route-manager-v${manifest.version}.xpi`);
const report = { schemaVersion: 1, phase: 'P027', commitSha: process.env.GITHUB_SHA ||
  (await execFileText('git', ['rev-parse', 'HEAD'])).stdout.trim(),
  workflowRun: process.env.GITHUB_RUN_ID || null, version: pin.version,
  artifactSha256: pin.archive.sha256, productXpiSha256: await sha256File(xpi),
  sourceState: process.env.CI ? 'actions-checkout' : 'local-worktree',
  osContentSandboxDisabled: process.env.MOZ_DISABLE_CONTENT_SANDBOX === '1', checks: {}, platformFacts: {} };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let h, server;
async function page(code, args = []) {
  const result = await h.pageScript(`const done = arguments[arguments.length - 1];
    (async () => { const api = window.wrappedJSObject.browser; ${code} })()
      .then(value => done({ok:true,value:JSON.parse(JSON.stringify(value ?? null))}),
        error => done({ok:false,error:String(error)}));`, args, { async: true });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
const probe = (action) => page('return api.runtime.sendMessage({type:"p027",action:arguments[0]});', [action]);
async function dashboard() {
  const handle = await h.openPage(PRODUCT, 'pcms/app/index.html');
  await waitFor(() => h.pageScript('return document.getElementById("brokerLiveStatus")?.dataset.state === "connected"'), 'packaged PCMS connects');
  await waitFor(() => h.pageScript(`return ['Explorer','Deployer','Refresher','Statistics','Provisioning'].every(
    name => document.getElementById('module'+name+'Status')?.dataset.state === 'connected');`), 'all packaged feature modules connect');
  assert.equal(await h.pageScript(`return ['accountCreateForm','accountRebindForm','explorerLiveForm',
    'deployerLiveForm','refresherLiveForm','provisioningLiveForm','backupCreateForm','restoreApplyForm',
    'recoveryReleaseForm'].every(id => !!document.getElementById(id));`), true);
  return handle;
}
try {
  if (process.env.CI) assert.equal(report.osContentSandboxDisabled, false, 'CI acceptance must enable the OS content sandbox');
  await mkdir(root, { recursive: true });
  h = await PackagedFirefox.create({ root: join(root, 'profiles') });
  await h.start();
  report.platformFacts.defaultIdleTimeoutMs = await h.client.script(
    'return Services.prefs.getDefaultBranch("").getIntPref("extensions.background.idle.timeout", 30000);');
  assert.equal(report.platformFacts.defaultIdleTimeoutMs, 30000);
  assert.equal(await h.install(xpi), PRODUCT);
  let tab = await dashboard();
  const product = await h.extension(PRODUCT);
  assert.equal(product.manifestVersion, 3); assert.equal(product.persistent, false);
  await h.pageScript('document.getElementById("backupCreateForm").requestSubmit();');
  await waitFor(() => h.pageScript('return document.getElementById("backupPayload").value.length > 0;'), 'packaged IndexedDB backup');
  assert.equal(await h.pageScript('try { JSON.parse(document.getElementById("backupPayload").value); return true; } catch { return false; }'), true);
  report.checks.packagedIndexedDbBackup = true;
  await page('await api.storage.local.set({p027CiMarker:"installed-once"});');
  const second = await dashboard();
  await h.closePage(second); await h.closePage(tab);
  report.checks.packagedBaselineAndTwoTabs = true;
  await h.setIdleTimeout(500);
  await waitFor(async () => (await h.extension(PRODUCT)).state === 'stopped', 'product background idle unload');
  report.checks.productIdleUnloadWithZeroDashboards = true;
  await h.resetIdleTimeout();

  // Build a separate fixture XPI. Never inject fixtures or privileged hooks into the product XPI.
  const fixtureRoot = resolve('tests/pcms/p027/platform-fixture');
  const fixtureOut = join(await mkdtemp(join(root, 'fixture-')), 'platform.xpi');
  await execFileText('zip', ['-q', '-X', fixtureOut, 'manifest.json', 'background.js', 'page.html', 'sandbox.html', 'sandbox.js'], { cwd: fixtureRoot });
  assert.equal(await h.install(fixtureOut), PROBE);
  tab = await h.openPage(PROBE, 'page.html');
  const facts = await probe('facts');
  assert.equal(facts.window, 'object'); assert.equal(facts.document, 'object');
  report.platformFacts.moduleBackgroundHasDom = true;
  await probe('seed');
  await h.closePage(tab);
  const defaultIdleStarted = Date.now();
  await waitFor(async () => (await h.extension(PROBE)).state === 'stopped', 'default 30s idle unload', 70_000);
  report.platformFacts.defaultIdleUnloadElapsedMs = Date.now() - defaultIdleStarted;
  assert.ok(report.platformFacts.defaultIdleUnloadElapsedMs >= 25_000);
  tab = await h.openPage(PROBE, 'page.html');
  await probe('facts');
  await h.setIdleTimeout(500);
  await sleep(2000);
  report.platformFacts.backgroundStateWithOpenView = (await h.extension(PROBE)).state;
  // Record the build's behaviour; correctness never relies on open views or ports.
  await page('window.wrappedJSObject.p027Port = api.runtime.connect({name:"p027"});');
  await sleep(1500);
  report.platformFacts.backgroundStateWithOpenViewAndPort = (await h.extension(PROBE)).state;
  await h.closePage(tab);
  await waitFor(async () => (await h.extension(PROBE)).state === 'stopped', 'event-page idle unload');
  tab = await h.openPage(PROBE, 'page.html');
  const wake = await probe('facts');
  assert.notEqual(wake.bootId, facts.bootId);
  assert.equal(wake.session.p027Marker, 'survives-idle');
  report.platformFacts.storageSessionSurvivesIdleUnload = true;
  report.checks.idleUnloadAndSynchronousMessageWake = true;

  const timers = await probe('timers');
  assert.equal(timers.alarms.filter(alarm => alarm.name === 'p027.wake').length, 1);
  await h.closePage(tab);
  await waitFor(async () => (await h.extension(PROBE)).state === 'stopped', 'idle unload before DOM timer');
  await sleep(11000);
  tab = await h.openPage(PROBE, 'page.html');
  const afterTimers = await page('return api.storage.local.get(null);');
  assert.equal(afterTimers.domTimerFired, undefined);
  assert.equal(afterTimers.alarmEvents.length, 1);
  assert.equal(afterTimers.alarmEvents[0].name, 'p027.wake');
  assert.notEqual(afterTimers.alarmEvents[0].bootId, timers.bootId);
  report.platformFacts.domTimerLostOnUnload = true;
  report.platformFacts.namedAlarmReplacesAndWakes = true;

  await probe('portOnly');
  await h.closePage(tab);
  await sleep(2000);
  report.platformFacts.backgroundStateWithBackgroundSelfPortOnly = (await h.extension(PROBE)).state;
  tab = await h.openPage(PROBE, 'page.html');

  let networkRequests = 0;
  server = createServer((_req, res) => { networkRequests++; res.end('unexpected'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const networkUrl = `http://127.0.0.1:${server.address().port}/must-be-blocked`;
  const sandbox = await page(`return new Promise((resolve, reject) => {
    const w = window.wrappedJSObject;
    const frame = document.createElement('iframe');
    const timer = setTimeout(() => { cleanup(); reject(new Error('sandbox timeout')); }, 8000);
    function cleanup() { clearTimeout(timer); w.removeEventListener('message', onMessage); frame.remove(); }
    function onMessage(event) {
      if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.type !== 'p027.sandbox.result') return;
      const result = JSON.parse(JSON.stringify(event.data)); cleanup(); resolve(result);
    }
    w.addEventListener('message', onMessage);
    frame.addEventListener('load', () => frame.contentWindow.postMessage({type:'p027.sandbox',
      source:arguments[0],url:arguments[1]}, '*'), {once:true});
    frame.src = api.runtime.getURL('sandbox.html'); document.body.append(frame);
  });`, ['40 + 2', networkUrl]);
  assert.equal(sandbox.value, 42); assert.equal(sandbox.browserAbsent, true);
  assert.equal(sandbox.chromeAbsent, true); assert.equal(sandbox.networkBlocked, true);
  assert.equal(networkRequests, 0);
  report.platformFacts.manifestSandboxAndSandboxCsp = sandbox;
  await new Promise(resolve => server.close(resolve)); server = null;
  await h.closePage(tab);

  await h.restart();
  // Both extensions were persistently installed once; no Addon:Install after restart.
  assert.equal((await h.extension(PRODUCT)).id, PRODUCT);
  tab = await dashboard();
  assert.equal((await page('return api.storage.local.get("p027CiMarker");')).p027CiMarker, 'installed-once');
  await h.closePage(tab);
  tab = await h.openPage(PROBE, 'page.html');
  const restart = await probe('facts');
  assert.equal(restart.session.p027Marker, undefined);
  assert.equal((await page('return api.storage.local.get("p027Marker");')).p027Marker, 'survives-restart');
  assert.deepEqual(await page('return api.alarms.getAll();'), []);
  report.platformFacts.storageSessionClearedOnBrowserRestart = true;
  report.platformFacts.alarmsClearedOnBrowserRestart = true;
  report.checks.persistentInstallAndProfileRestart = true;
  report.esr153Decision = { minimumManifestVersion: manifest.browser_specific_settings.gecko.strict_min_version,
    runtimeModules: 'UNAVAILABLE below Firefox 154; preserve built-in functionality (ADR-003 default b)' };
  assert.equal(report.esr153Decision.minimumManifestVersion, '153.0');
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
