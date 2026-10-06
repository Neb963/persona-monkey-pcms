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
