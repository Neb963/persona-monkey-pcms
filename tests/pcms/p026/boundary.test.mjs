import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const LIVE_MUTATIONS="extension/pcms/integration/live-mutations.js";
const LIVE_CONTROLS="extension/pcms/app/live-controls.js";

test("A026-01 live provider effects stay behind Persona Broker and explicit operator confirmation",async()=>{
  const source=await readFile(LIVE_MUTATIONS,"utf8");
  assert.match(source,/createPerchanceProviderAdapter/);
  assert.match(source,/client\.request\("persona\.open"/);
  assert.match(source,/operator\.choose/);
  assert.match(source,/allowDirect:true/);
  assert.doesNotMatch(source,/\bbrowser\s*\./);
  assert.doesNotMatch(source,/\bchrome\s*\./);
  assert.doesNotMatch(source,/nativeMessaging|sendNativeMessage|XMLHttpRequest|querySelector\s*\(|fetch\s*\(/);
});

test("A026-01 production controls exercise accepted PCMS modules instead of raw provider authority",async()=>{
  const source=await readFile(LIVE_CONTROLS,"utf8");
  for(const expected of [
    "runtime.accounts.createAccount",
    "runtime.accounts.rebindPersona",
    "runtime.explorer.recordDiscovery",
    "runtime.explorer.claimCandidate",
    "runtime.deployer.deploy",
    "runtime.deployer.reconcileDeployment",
    "runtime.refresher.dispatchRefresh",
    "runtime.refresher.reconcileRefresh",
    "runtime.provisioning.createAttempt",
    "runtime.provisioning.advance",
    "runtime.backupRestore.applyStagedRestore",
    "runtime.backupRestore.reconcileAndRelease"
  ]) assert.match(source,new RegExp(expected.replaceAll(".","\\.")));
  assert.doesNotMatch(source,/\bbrowser\s*\.|sendNativeMessage|XMLHttpRequest|fetch\s*\(/);
});

test("A026-02 recovery controls expose backup, restore hold, and explicit release",async()=>{
  const html=await readFile("extension/pcms/app/index.html","utf8");
  const controls=await readFile(LIVE_CONTROLS,"utf8");
  assert.match(html,/id="backupCreateForm"/);
  assert.match(html,/id="restoreApplyForm"/);
  assert.match(html,/id="recoveryReleaseForm"/);
  assert.match(controls,/createBackup/);
  assert.match(controls,/stageRestore/);
  assert.match(controls,/applyStagedRestore/);
  assert.match(controls,/reconcileAndRelease/);
});


test("A026-01 account binding UI exposes live Personas and visible action feedback",async()=>{
  const [html,css,controls,runtime]=await Promise.all([
    readFile("extension/pcms/app/index.html","utf8"),
    readFile("extension/pcms/app/app.css","utf8"),
    readFile(LIVE_CONTROLS,"utf8"),
    readFile("extension/pcms/app/live-runtime.js","utf8")
  ]);
  const statusIndex=html.indexOf('id="liveActionStatus"');
  const mainIndex=html.indexOf('<main class="content">');
  assert.ok(statusIndex>0&&statusIndex<mainIndex,"live action feedback must stay visible outside route-specific views");
  assert.equal((html.match(/id="accountCreatePersonaUid"/g)||[]).length,1);
  assert.equal((html.match(/id="accountRebindPersonaUid"/g)||[]).length,1);
  const provisioning=html.slice(html.indexOf('id="provisioningLiveForm"'),html.indexOf("</form>",html.indexOf('id="provisioningLiveForm"')));
  assert.doesNotMatch(provisioning,/id="accountCreatePersonaUid"/);
  assert.match(html,/id="accountCreatePersonaUid" name="personaUid" required/);
  assert.match(html,/id="accountRebindPersonaUid" name="personaUid" required/);
  assert.match(runtime,/command:"persona\.list"/);
  assert.match(runtime,/page:Object\.freeze\(\{size:100/);
  assert.match(controls,/runtime\.personaDirectory\.list\(\)/);
  assert.match(controls,/persona\.name\+" · "\+persona\.cookieStoreId/);
  assert.match(css,/\.live-form input, \.live-form textarea, \.live-form select/);
});


test("A026-03 PCMS app uses bounded startup retry instead of a one-shot live connection",async()=>{
  const app=await readFile("extension/pcms/app/app.js","utf8");
  const retry=await readFile("extension/pcms/app/startup-retry.js","utf8");
  assert.match(app,/startPcmsRuntimeWithRetry\(\{startRuntime:startPcmsLiveRuntime\}\)/);
  assert.match(retry,/PCMS_STARTUP_RETRY_DELAYS_MS/);
  assert.match(retry,/delays\.length>16/);
  assert.match(retry,/throw lastError/);
});
