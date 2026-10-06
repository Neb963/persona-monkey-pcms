import { createPcmsStorageBroker } from "../storage/storage-broker.js";
import { createPcmsAuditJournal } from "../audit/journal.js";
import { createRemoteOps } from "../remoteops/remote-ops.js";
import { createRecoveryHoldController } from "../remoteops/recovery-hold.js";
import { createProviderGate } from "../remoteops/provider-gate.js";
import { createModulePackageRegistry } from "../modules/registry.js";
import { createModuleRuntimeBroker } from "../runtime/module-runtime.js";
import { createPcmsModuleIntegration } from "./composition.js";

export function createPcmsLiveCore({
  personaBroker,
  featureFactories,
  provisioning,
  statisticsDefinitions,
  providerProbes=[],
  clock=()=>new Date().toISOString()
}={}) {
  if(!personaBroker||typeof personaBroker.request!=="function") throw new TypeError("PCMS live Core requires Persona Broker");
  if(!featureFactories||typeof featureFactories!=="object") throw new TypeError("PCMS live Core requires feature factories");
  if(!provisioning||typeof provisioning!=="object") throw new TypeError("PCMS live Core requires provisioning adapters");
  if(!Array.isArray(statisticsDefinitions)||statisticsDefinitions.length<1) throw new TypeError("PCMS live Core requires statistics definitions");
  if(!Array.isArray(providerProbes)) throw new TypeError("PCMS live Core provider probes are invalid");
  if(typeof clock!=="function") throw new TypeError("PCMS live Core clock is invalid");

  const storageBroker=createPcmsStorageBroker({clock});
  const auditJournal=createPcmsAuditJournal({clock});
  const remoteOps=createRemoteOps({storageBroker,clock});
  const recoveryHold=createRecoveryHoldController({storageBroker,remoteOps,clock});
  // P025 exposes module state and read-only compatibility only. Provider mutation
  // drivers remain unavailable until P026 representative-mutation acceptance.
  const providerGate=createProviderGate({
    remoteOps,
    recoveryHold,
    providers:Object.freeze({})
  });
  const moduleRegistry=createModulePackageRegistry({storageBroker,clock});
  const moduleRuntime=createModuleRuntimeBroker({storageBroker,moduleRegistry,recoveryHold});

  const integration=createPcmsModuleIntegration({
    storageBroker,
    auditJournal,
    personaBroker,
    providerGate,
    remoteOps,
    recoveryHold,
    moduleRegistry,
    moduleRuntime,
    featureFactories,
    provisioning,
    statisticsDefinitions,
    providerProbes,
    clock
  });

  async function initialize() {
    await storageBroker.open();
    await auditJournal.open();
    const interruptedOperationIds=await remoteOps.recoverInterruptedDispatches();
    const recoveredModuleIds=await moduleRuntime.recoverAll();
    return Object.freeze({interruptedOperationIds,recoveredModuleIds});
  }

  function close() {
    try{personaBroker.close?.();}catch{}
    try{auditJournal.close();}catch{}
    try{storageBroker.close();}catch{}
  }

  return Object.freeze({
    initialize,
    close,
    storageBroker,
    auditJournal,
    remoteOps,
    recoveryHold,
    providerGate,
    moduleRegistry,
    moduleRuntime,
    ...integration
  });
}
