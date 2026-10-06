import { createPersonaBroker } from "../core/persona-broker.js";
import { createFirefoxPersonaBrokerTransport } from "../platform/firefox-persona-broker-transport.js";
import { createPcmsLiveCore } from "../integration/live-core.js";

import { createAccountsService } from "/pcms-modules/p014/accounts.js";
import { createDeployerService } from "/pcms-modules/p015/deployer.js";
import { createExplorerService } from "/pcms-modules/p016/explorer.js";
import { createRefresherService } from "/pcms-modules/p017/refresher.js";
import { createStatisticsService } from "/pcms-modules/p018/statistics.js";
import { createProvisioningService } from "/pcms-modules/p019/provisioning.js";

let requestSequence=0;

const featureFactories=Object.freeze({
  accounts:createAccountsService,
  deployer:createDeployerService,
  explorer:createExplorerService,
  refresher:createRefresherService,
  statistics:createStatisticsService,
  provisioning:createProvisioningService
});

function unavailableMutation() {
  throw new Error("PCMS provider mutation is unavailable until P026 live mutation acceptance");
}

const provisioning=Object.freeze({
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

export async function startPcmsLiveRuntime() {
  const transport=createFirefoxPersonaBrokerTransport();
  const personaBroker=createPersonaBroker({transport});
  const core=createPcmsLiveCore({
    personaBroker,
    featureFactories,
    provisioning,
    statisticsDefinitions
  });
  try {
    const recovery=await core.initialize();
    const response=await personaBroker.request(Object.freeze({
      requestId:"pcms-live-status-"+(++requestSequence),
      command:"system.status",
      params:Object.freeze({})
    }));
    if(!response.ok) throw new Error("Persona Broker status request failed");
    return Object.freeze({
      ...core,
      recovery,
      brokerStatus:response.result,
      brokerBootId:response.bootId,
      brokerRevision:response.revision
    });
  } catch(error) {
    core.close();
    throw error;
  }
}
