// Background-only composition of the PCMS Core (ADR-002 §1). Extension pages never import this.
// Feature factories are injected (feature-factories.js in the packaged background).
import { createPersonaBroker } from "../core/persona-broker.js";
import { createPcmsLiveCore } from "../integration/live-core.js";
import { createPcmsLiveMutationIntegration } from "../integration/live-mutations.js";
import { createProviderHandoff } from "../integration/provider-handoff.js";
import { createHumanTaskService } from "../services/human-tasks.js";
import { createCoreServiceRegistry } from "../services/registry.js";
import { createTimerService } from "../services/timers.js";
import { createSingletonStateStore } from "../integration/adapters.js";
import {createDeployerRepositorySync,REPOSITORY_SYNC_SERVICE,REPOSITORY_SYNC_OWNER,REPOSITORY_SYNC_GENERATION}
  from "../../../pcms-modules/p015/repository-sync.js";
import { createAccountProviderGateResolver } from "../integration/adapters.js";
import { createPcmsBundledModuleLoader } from "../integration/bundled-modules.js";
import { PCMS_UI_PUBLISH_CAPABILITY, createPcmsUiContributionHost } from "../integration/ui-contributions.js";
import { createModuleCapabilityHandlers, createPerchanceModuleCapabilityHandlers } from "./modules/capabilities.js";
import { createBackgroundModuleRuntimeOptions } from "./modules/host.js";
import { createModuleScheduleStore } from "./modules/schedules.js";
import { createModuleSupervisor } from "./modules/supervisor.js";
import {
  PCMS_CONTINUITY_FIXTURE_GENERATION,
  PCMS_CONTINUITY_FIXTURE_OWNER,
  PCMS_CONTINUITY_FIXTURE_SERVICE,
  createPcmsContinuityFixture
} from "./alarms/continuity-fixture.js";

function unavailableMutation() {
  throw new Error("PCMS provider mutation is unavailable until P026 live mutation acceptance");
}

const unavailableProvisioning=Object.freeze({
  sessionGuard:Object.freeze({
    acquire:unavailableMutation,
    validate:unavailableMutation,
    release:unavailableMutation
  }),
  providerSession:Object.freeze({
    preflight:unavailableMutation
  })
});

const statisticsDefinitions=Object.freeze([Object.freeze({
  metricId:"attention_opened",
  label:"Attention opened",
  eventType:"human-task.opened",
  aggregation:"COUNT",
  valuePath:null,
  subjectKind:"human-task"
})]);

export function createBackgroundPcmsCore({
  transport,
  featureFactories,
  clock=()=>new Date().toISOString(),
  storageBroker=null,
  auditJournal=null,
  moduleHost=null,
  bundledModules=null,
  importBundledModule=null
}={}) {
  const personaBroker=createPersonaBroker({transport});
  let handoff=null;
  // Capability set v1 handlers are bound before the services they front exist.
  let moduleDeps=null;
  let uiHost=null;
  const moduleRuntimeOptions=createBackgroundModuleRuntimeOptions({
    ...(moduleHost||{}),
    capabilities:{
      ...createModuleCapabilityHandlers({resolve:()=>moduleDeps}),
      ...createPerchanceModuleCapabilityHandlers({resolve:()=>moduleDeps}),
      // pcms.ui-contribution/v1: a runtime module publishes its UI for Core to cache (P033).
      [PCMS_UI_PUBLISH_CAPABILITY]:(args,context)=>{
        if(!uiHost) throw new Error("PCMS UI contribution host is unavailable");
        return uiHost.capabilities[PCMS_UI_PUBLISH_CAPABILITY](args,context);
      }
    }
  });
  const core=createPcmsLiveCore({
    personaBroker,
    featureFactories,
    provisioning:unavailableProvisioning,
    statisticsDefinitions,
    clock,
    storageBroker,
    auditJournal,
    moduleRuntimeOptions,
    liveMutationFactory:({storageBroker,auditJournal})=>{
      handoff=createProviderHandoff({
        storageBroker,
        humanTasks:createHumanTaskService({storageBroker,auditJournal,clock}),
        clock
      });
      return createPcmsLiveMutationIntegration({storageBroker,personaBroker,operator:handoff});
    }
  });

  const timerServices=createCoreServiceRegistry();
  timerServices.register(PCMS_CONTINUITY_FIXTURE_SERVICE,Object.freeze({
    async onTimer(){return Object.freeze({completed:true});}
  }),{ownerId:PCMS_CONTINUITY_FIXTURE_OWNER,generation:PCMS_CONTINUITY_FIXTURE_GENERATION});
  let timerAlarmRearm=null;
  let moduleSupervisor=null;
  const timers=createTimerService({
    storageBroker:core.storageBroker,
    auditJournal:core.auditJournal,
    serviceRegistry:timerServices,
    clock,
    onChanged:async(change)=>{
      if(moduleSupervisor){try{await moduleSupervisor.afterTimerChange(change);}catch{}}
      if(timerAlarmRearm)await timerAlarmRearm();
    }
  });
  const continuityFixture=createPcmsContinuityFixture({timers,clock});
  // P038: built-in scheduler owns only repository checks, not provider deployments.
  const repositorySync=core.repository?createDeployerRepositorySync({
    repository:core.repository,
    timers,
    stateStore:createSingletonStateStore({
      storageBroker:core.storageBroker,namespace:"module.deployer.repository.sync"
    }),
    clock
  }):null;
  if(repositorySync)timerServices.register(REPOSITORY_SYNC_SERVICE,Object.freeze({
    onTimer:event=>repositorySync.onTimer(event)
  }),{ownerId:REPOSITORY_SYNC_OWNER,generation:REPOSITORY_SYNC_GENERATION});

  // ADR-003 §2/§3/§5: runtime modules run live in this background Core.
  const moduleSchedules=createModuleScheduleStore({storageBroker:core.storageBroker});
  const providerGates=createAccountProviderGateResolver({
    accountsService:core.accounts,
    providerGate:core.providerGate,
    operationContext:core.liveMutations?.operationContext??null
  });
  moduleDeps=Object.freeze({
    storageBroker:core.storageBroker,
    auditJournal:core.auditJournal,
    humanTasks:core.humanTasks,
    recoveryHold:core.recoveryHold,
    accounts:core.accounts,
    deployer:core.deployer,
    timers,
    schedules:moduleSchedules,
    gateFor:(accountId)=>providerGates.get(accountId),
    clock
  });
  moduleSupervisor=createModuleSupervisor({
    moduleRegistry:core.moduleRegistry,
    moduleRuntime:core.moduleRuntime,
    moduleLifecycle:core.moduleLifecycle,
    timerServices,
    timers,
    humanTasks:core.humanTasks,
    auditJournal:core.auditJournal,
    storageBroker:core.storageBroker,
    schedules:moduleSchedules,
    clock
  });

  // P033: one contribution host merges built-in and runtime module UI for every dashboard.
  uiHost=createPcmsUiContributionHost({
    storageBroker:core.storageBroker,
    modules:moduleSupervisor.api,
    moduleRegistry:core.moduleRegistry,
    recoveryHold:core.recoveryHold,
    auditJournal:core.auditJournal,
    clock,
    // The shipped list by default; tests may pass another list and an import function.
    loadBundled:createPcmsBundledModuleLoader({
      core,
      ...(Array.isArray(bundledModules)?{entries:bundledModules}:{}),
      ...(typeof importBundledModule==="function"?{importModule:importBundledModule}:{})
    })
  });

  async function initialize(options){
    const recovery=await core.initialize(options);
    // Every admitted module's scheduler exists before the first due pass of this context.
    const schedulerModules=await moduleSupervisor.initialize();
    return Object.freeze({...recovery,schedulerModules});
  }

  async function declareTimerSchedules(input){
    const declared=await continuityFixture.declare(input);
    if(repositorySync)await repositorySync.declare();
    try{await moduleSupervisor.declare(input);}catch{}
    return declared;
  }

  // The answer is recorded durably first; reconciliation then reads it.
  async function answerHandoff(taskId,outcome) {
    const answered=await handoff.answer(taskId,outcome);
    let operation=await core.remoteOps.get(answered.operationId);
    if(operation?.value?.state==="UNCERTAIN") operation=await core.providerGate.reconcile(answered.operationId);
    return Object.freeze({...answered,operationState:operation?.value?.state??null});
  }

  return Object.freeze({
    ...core,
    initialize,
    personaBroker,
    timers,
    timerServices,
    repositorySync,
    modules:moduleSupervisor.api,
    moduleSupervisor,
    ui:uiHost.api,
    declareTimerSchedules,
    bindTimerAlarmRearm(handler){
      if(handler!==null&&typeof handler!=="function")throw new TypeError("PCMS timer alarm rearm hook is invalid");
      timerAlarmRearm=handler;
    },
    close(){
      timerAlarmRearm=null;
      try{moduleRuntimeOptions.dispose();}catch{}
      core.close();
    },
    providerHandoff:Object.freeze({
      describe:(taskId)=>handoff.describe(taskId),
      answer:answerHandoff
    })
  });
}
