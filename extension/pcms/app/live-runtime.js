import { createPersonaBroker } from "../core/persona-broker.js";
import { createFirefoxPersonaBrokerTransport } from "../platform/firefox-persona-broker-transport.js";
import { createPcmsLiveCore } from "../integration/live-core.js";
import { createPcmsLiveMutationIntegration } from "../integration/live-mutations.js";
import { createPcmsOperatorBridge } from "./operator-bridge.js";

import { createAccountsService } from "/pcms-modules/p014/accounts.js";
import { createDeployerService } from "/pcms-modules/p015/deployer.js";
import { createExplorerService } from "/pcms-modules/p016/explorer.js";
import { createRefresherService } from "/pcms-modules/p017/refresher.js";
import { createStatisticsService } from "/pcms-modules/p018/statistics.js";
import { createProvisioningService } from "/pcms-modules/p019/provisioning.js";

let requestSequence=0;
let personaDirectorySequence=0;
const PERSONA_UID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createLivePersonaDirectory(personaBroker) {
  return Object.freeze({
    async list() {
      const personas=[];
      const seen=new Set();
      let cursor=null;
      let pageCount=0;
      do {
        pageCount+=1;
        if(pageCount>64) throw new Error("Persona list pagination exceeded safety bound");
        const response=await personaBroker.request(Object.freeze({
          requestId:"pcms-live-personas-"+(++personaDirectorySequence),
          command:"persona.list",
          params:Object.freeze({
            page:Object.freeze({size:100,...(cursor?{cursor}:{})})
          })
        }));
        if(!response.ok) throw new Error(response.error?.message||"Persona list request failed");
        const result=response.result;
        if(!result||typeof result!=="object"||Array.isArray(result)||!Array.isArray(result.items)
            ||typeof result.hasMore!=="boolean") {
          throw new Error("Persona list response is invalid");
        }
        for(const raw of result.items) {
          const personaUid=typeof raw?.personaUid==="string"&&PERSONA_UID_PATTERN.test(raw.personaUid)
            ? raw.personaUid.toLowerCase()
            : null;
          const cookieStoreId=typeof raw?.cookieStoreId==="string"&&raw.cookieStoreId.length
            ? raw.cookieStoreId
            : null;
          if(!personaUid||!cookieStoreId||raw?.managed===false||raw?.archivedAt||seen.has(personaUid)) continue;
          seen.add(personaUid);
          personas.push(Object.freeze({
            personaUid,
            cookieStoreId,
            name:typeof raw?.name==="string"&&raw.name.trim()?raw.name.trim().slice(0,160):"Managed Persona"
          }));
        }
        if(result.hasMore) {
          if(typeof result.nextCursor!=="string"||!result.nextCursor) throw new Error("Persona list cursor is invalid");
          cursor=result.nextCursor;
        } else {
          cursor=null;
        }
      } while(cursor);
      personas.sort((a,b)=>a.name.localeCompare(b.name)||a.personaUid.localeCompare(b.personaUid));
      return Object.freeze(personas);
    }
  });
}


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
  const operator=createPcmsOperatorBridge();
  const personaDirectory=createLivePersonaDirectory(personaBroker);
  const core=createPcmsLiveCore({
    personaBroker,
    featureFactories,
    provisioning,
    statisticsDefinitions,
    liveMutationFactory:({storageBroker})=>createPcmsLiveMutationIntegration({
      storageBroker,
      personaBroker,
      operator
    })
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
      brokerRevision:response.revision,
      personaDirectory
    });
  } catch(error) {
    core.close();
    throw error;
  }
}
