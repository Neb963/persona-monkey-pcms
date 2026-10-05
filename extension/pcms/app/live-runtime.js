import { createPersonaBroker } from "../core/persona-broker.js";
import { createFirefoxPersonaBrokerTransport } from "../platform/firefox-persona-broker-transport.js";
import { createPcmsLiveCore } from "../integration/live-core.js";
import { createAccountsService } from "/pcms-modules/p014/accounts.js";

let requestSequence=0;

export async function startPcmsLiveRuntime() {
  const transport=createFirefoxPersonaBrokerTransport();
  const personaBroker=createPersonaBroker({transport});
  const core=createPcmsLiveCore({personaBroker,accountsFactory:createAccountsService});
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
