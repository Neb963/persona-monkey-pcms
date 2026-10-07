// Background-only composition of the PCMS Core (ADR-002 §1). Extension pages never import this.
// Feature factories are injected (feature-factories.js in the packaged background).
import { createPersonaBroker } from "../core/persona-broker.js";
import { createPcmsLiveCore } from "../integration/live-core.js";
import { createPcmsLiveMutationIntegration } from "../integration/live-mutations.js";
import { createProviderHandoff } from "../integration/provider-handoff.js";
import { createHumanTaskService } from "../services/human-tasks.js";

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
  auditJournal=null
}={}) {
  const personaBroker=createPersonaBroker({transport});
  let handoff=null;
  const core=createPcmsLiveCore({
    personaBroker,
    featureFactories,
    provisioning:unavailableProvisioning,
    statisticsDefinitions,
    clock,
    storageBroker,
    auditJournal,
    liveMutationFactory:({storageBroker,auditJournal})=>{
      handoff=createProviderHandoff({
        storageBroker,
        humanTasks:createHumanTaskService({storageBroker,auditJournal,clock}),
        clock
      });
      return createPcmsLiveMutationIntegration({storageBroker,personaBroker,operator:handoff});
    }
  });

  // The answer is recorded durably first; reconciliation then reads it.
  async function answerHandoff(taskId,outcome) {
    const answered=await handoff.answer(taskId,outcome);
    let operation=await core.remoteOps.get(answered.operationId);
    if(operation?.value?.state==="UNCERTAIN") operation=await core.providerGate.reconcile(answered.operationId);
    return Object.freeze({...answered,operationState:operation?.value?.state??null});
  }

  return Object.freeze({
    ...core,
    personaBroker,
    providerHandoff:Object.freeze({
      describe:(taskId)=>handoff.describe(taskId),
      answer:answerHandoff
    })
  });
}
