import { createPcmsStorageBroker } from "../storage/storage-broker.js";
import { createPcmsAuditJournal } from "../audit/journal.js";
import { createHumanTaskService } from "../services/human-tasks.js";
import { createPcmsUiProjectionService } from "../app/projections.js";
import { createPersonaResolverFromBroker, createSingletonStateStore } from "./adapters.js";
import { createRemoteOps } from "../remoteops/remote-ops.js";
import { createRecoveryHoldController } from "../remoteops/recovery-hold.js";
import { createModulePackageRegistry } from "../modules/registry.js";
import { createModuleRuntimeBroker } from "../runtime/module-runtime.js";

export const PCMS_LIVE_ACCOUNTS_NAMESPACE="module.accounts";

export function createPcmsLiveCore({
  personaBroker,
  accountsFactory,
  clock=()=>new Date().toISOString()
}={}) {
  if(!personaBroker||typeof personaBroker.request!=="function") throw new TypeError("PCMS live Core requires Persona Broker");
  if(typeof accountsFactory!=="function") throw new TypeError("PCMS live Core requires Accounts factory");
  if(typeof clock!=="function") throw new TypeError("PCMS live Core clock is invalid");

  const storageBroker=createPcmsStorageBroker({clock});
  const auditJournal=createPcmsAuditJournal({clock});
  const remoteOps=createRemoteOps({storageBroker,clock});
  const recoveryHold=createRecoveryHoldController({storageBroker,remoteOps,clock});
  const moduleRegistry=createModulePackageRegistry({storageBroker,clock});
  const moduleRuntime=createModuleRuntimeBroker({storageBroker,moduleRegistry,recoveryHold});
  const personaResolver=createPersonaResolverFromBroker({broker:personaBroker});
  const humanTasks=createHumanTaskService({storageBroker,auditJournal,clock});
  const accounts=accountsFactory({
    stateStore:createSingletonStateStore({
      storageBroker,
      namespace:PCMS_LIVE_ACCOUNTS_NAMESPACE
    }),
    personaResolver,
    clock
  });
  if(!accounts||typeof accounts.listAccounts!=="function") throw new TypeError("PCMS Accounts factory returned an invalid service");
  const uiProjection=createPcmsUiProjectionService({humanTasks,accounts});

  async function initialize() {
    await storageBroker.open();
    await auditJournal.open();
    const interruptedOperationIds=await remoteOps.recoverInterruptedDispatches();
    const recoveredModuleIds=await moduleRuntime.recoverAll();
    return Object.freeze({
      interruptedOperationIds,
      recoveredModuleIds
    });
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
    moduleRegistry,
    moduleRuntime,
    humanTasks,
    accounts,
    uiProjection
  });
}
