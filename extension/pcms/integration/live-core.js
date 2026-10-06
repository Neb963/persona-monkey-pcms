import { createPcmsStorageBroker } from "../storage/storage-broker.js";
import { createPcmsAuditJournal } from "../audit/journal.js";
import { createRemoteOps } from "../remoteops/remote-ops.js";
import { createRecoveryHoldController } from "../remoteops/recovery-hold.js";
import { createProviderGate } from "../remoteops/provider-gate.js";
import { createModulePackageRegistry } from "../modules/registry.js";
import { createModuleRuntimeBroker } from "../runtime/module-runtime.js";
import { createPcmsModuleIntegration } from "./composition.js";

export async function recoverPcmsLiveStartup({remoteOps,recoveryHold,moduleRuntime}={}) {
  if(!remoteOps||typeof remoteOps.listUnresolved!=="function") throw new TypeError("Startup recovery requires RemoteOps");
  if(!recoveryHold||typeof recoveryHold.getStatus!=="function"||typeof recoveryHold.enterRecoveryHold!=="function") {
    throw new TypeError("Startup recovery requires recovery hold");
  }
  if(!moduleRuntime||typeof moduleRuntime.recoverAll!=="function") throw new TypeError("Startup recovery requires module runtime");

  const unresolvedBefore=await remoteOps.listUnresolved();
  const holdBefore=await recoveryHold.getStatus();
  let interruptedOperationIds=Object.freeze([]);

  if(holdBefore.value.state==="RECOVERY_HOLD"||unresolvedBefore.length>0) {
    const entered=await recoveryHold.enterRecoveryHold({
      reason:holdBefore.value.state==="RECOVERY_HOLD"
        ? (holdBefore.value.reason||"restart-recovery")
        : "restart-unresolved-remote-operations"
    });
    interruptedOperationIds=entered.recoveredOperationIds;
  }

  const recoveredModuleIds=await moduleRuntime.recoverAll();
  const holdAfter=await recoveryHold.getStatus();
  return Object.freeze({
    interruptedOperationIds,
    recoveredModuleIds,
    recoveryState:holdAfter.value.state
  });
}

export function createPcmsLiveCore({
  personaBroker,
  featureFactories,
  provisioning,
  statisticsDefinitions,
  providerProbes=[],
  liveMutationFactory=null,
  clock=()=>new Date().toISOString()
}={}) {
  if(!personaBroker||typeof personaBroker.request!=="function") throw new TypeError("PCMS live Core requires Persona Broker");
  if(!featureFactories||typeof featureFactories!=="object") throw new TypeError("PCMS live Core requires feature factories");
  if(!provisioning||typeof provisioning!=="object") throw new TypeError("PCMS live Core requires provisioning adapters");
  if(!Array.isArray(statisticsDefinitions)||statisticsDefinitions.length<1) throw new TypeError("PCMS live Core requires statistics definitions");
  if(!Array.isArray(providerProbes)) throw new TypeError("PCMS live Core provider probes are invalid");
  if(liveMutationFactory!==null&&typeof liveMutationFactory!=="function") throw new TypeError("PCMS live mutation factory is invalid");
  if(typeof clock!=="function") throw new TypeError("PCMS live Core clock is invalid");

  const storageBroker=createPcmsStorageBroker({clock});
  const auditJournal=createPcmsAuditJournal({clock});
  const remoteOps=createRemoteOps({storageBroker,clock});
  const recoveryHold=createRecoveryHoldController({storageBroker,remoteOps,clock});
  const liveMutations=liveMutationFactory
    ? liveMutationFactory({storageBroker,personaBroker,remoteOps,recoveryHold,clock})
    : null;
  const activeProviders=liveMutations?.providers||Object.freeze({});
  const activeProvisioning=liveMutations?.provisioning||provisioning;
  const activeProviderProbes=liveMutations?.providerProbes||providerProbes;
  const operationContext=liveMutations?.operationContext||null;
  const providerGate=createProviderGate({
    remoteOps,
    recoveryHold,
    providers:activeProviders
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
    provisioning:activeProvisioning,
    operationContext,
    statisticsDefinitions,
    providerProbes:activeProviderProbes,
    clock
  });

  async function initialize() {
    await storageBroker.open();
    await auditJournal.open();

    return recoverPcmsLiveStartup({remoteOps,recoveryHold,moduleRuntime});
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
    liveMutations,
    ...integration
  });
}
