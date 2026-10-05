import { createHumanTaskService } from "../services/human-tasks.js";
import { createPcmsUiProjectionService } from "../app/projections.js";
import {
  createAccountProviderGateResolver,
  createKeyedStateStore,
  createPersonaResolverFromBroker,
  createProvisioningRemoteControl,
  createRemoteOperationReader,
  createSingletonStateStore
} from "./adapters.js";
import { createExplorerDeployerBridge } from "./explorer-deployer.js";
import { createIntegrationRecoveryChecks } from "./recovery-checks.js";

export const PCMS_INTEGRATION_NAMESPACES=Object.freeze({
  accounts:"module.accounts",
  deployer:"module.deployer",
  explorer:"module.explorer",
  refresher:"module.refresher",
  provisioning:"module.provisioning"
});

const FACTORY_NAMES=Object.freeze(["accounts","deployer","explorer","refresher","statistics","provisioning"]);

function plain(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;
}

function normalizeFactories(value){
  if(!plain(value)||Object.getOwnPropertySymbols(value).length)throw new TypeError("PCMS feature factories are invalid");
  const d=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(d).length!==FACTORY_NAMES.length
      || !FACTORY_NAMES.every((name)=>Object.hasOwn(d,name)&&d[name].enumerable&&Object.hasOwn(d[name],"value")&&typeof d[name].value==="function")){
    throw new TypeError("PCMS feature factories are invalid");
  }
  return Object.freeze(Object.fromEntries(FACTORY_NAMES.map((name)=>[name,d[name].value])));
}

function requireMethods(value,names,label){
  if(!plain(value)||Object.getOwnPropertySymbols(value).length)throw new TypeError(label+" is invalid");
  const d=Object.getOwnPropertyDescriptors(value);
  if(!names.every((name)=>Object.hasOwn(d,name)&&d[name].enumerable&&Object.hasOwn(d[name],"value")&&typeof d[name].value==="function")){
    throw new TypeError(label+" is invalid");
  }
  return value;
}

export function createPcmsModuleIntegration({
  storageBroker,
  auditJournal,
  personaBroker,
  providerGate,
  remoteOps,
  featureFactories,
  provisioning,
  statisticsDefinitions=[],
  providerProbes=[],
  clock=()=>new Date().toISOString()
}={}) {
  if(!storageBroker||typeof storageBroker.namespace!=="function")throw new TypeError("PCMS integration requires storage");
  requireMethods(auditJournal,["read","transitionAndAppend"],"Audit Journal");
  requireMethods(personaBroker,["request"],"Persona Broker");
  requireMethods(providerGate,["mutate","reconcile"],"ProviderGate");
  requireMethods(remoteOps,["get"],"RemoteOps");
  const factories=normalizeFactories(featureFactories);
  if(typeof clock!=="function")throw new TypeError("PCMS integration clock is invalid");
  if(!plain(provisioning))throw new TypeError("Provisioning integration is invalid");
  requireMethods(provisioning.sessionGuard,["acquire","validate","release"],"Provisioning session guard");
  requireMethods(provisioning.providerSession,["preflight"],"Provisioning provider session");

  const personaResolver=createPersonaResolverFromBroker({broker:personaBroker});
  const humanTasks=createHumanTaskService({storageBroker,auditJournal,clock});

  const accounts=factories.accounts({
    stateStore:createSingletonStateStore({storageBroker,namespace:PCMS_INTEGRATION_NAMESPACES.accounts}),
    personaResolver,
    clock
  });
  const providerGateResolver=createAccountProviderGateResolver({accountsService:accounts,providerGate});
  const remoteOperationReader=createRemoteOperationReader({remoteOps});

  const deployer=factories.deployer({
    stateStore:createSingletonStateStore({storageBroker,namespace:PCMS_INTEGRATION_NAMESPACES.deployer}),
    accountsService:accounts,
    providerGateResolver,
    remoteOperationReader,
    clock
  });

  const explorer=factories.explorer({
    stateStore:createSingletonStateStore({storageBroker,namespace:PCMS_INTEGRATION_NAMESPACES.explorer}),
    accountsService:accounts,
    clock
  });

  const refresher=factories.refresher({
    stateStore:createSingletonStateStore({storageBroker,namespace:PCMS_INTEGRATION_NAMESPACES.refresher}),
    accountsService:accounts,
    providerGateResolver,
    remoteOperationReader,
    clock
  });

  const statistics=factories.statistics({
    journal:auditJournal,
    definitions:statisticsDefinitions
  });

  const provisioningRemoteControl=createProvisioningRemoteControl({providerGate,remoteOps});
  const accountProvisioning=factories.provisioning({
    attemptStore:createKeyedStateStore({
      storageBroker,
      namespace:PCMS_INTEGRATION_NAMESPACES.provisioning,
      keyPrefix:"attempt:"
    }),
    accounts,
    humanTasks,
    sessionGuard:provisioning.sessionGuard,
    providerSession:provisioning.providerSession,
    remoteControl:provisioningRemoteControl,
    clock
  });

  const uiProjection=createPcmsUiProjectionService({humanTasks,accounts});
  const explorerDeployer=createExplorerDeployerBridge({explorer,deployer});
  const recoveryChecks=createIntegrationRecoveryChecks({accounts,providerProbes});

  return Object.freeze({
    accounts,
    deployer,
    explorer,
    refresher,
    statistics,
    provisioning:accountProvisioning,
    humanTasks,
    uiProjection,
    explorerDeployer,
    recoveryChecks
  });
}
