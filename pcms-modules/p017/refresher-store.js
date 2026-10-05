import { PERCHANCE_PROVIDER_ID } from "../../extension/pcms/providers/perchance/contract.js";
import { REFRESHER_ERROR_CODES } from "./errors.js";
import {
  REFRESHER_COHORT_KIND, REFRESHER_MAX_COHORTS, REFRESHER_MEMBER_KIND, REFRESHER_PROVIDER_ID, REFRESHER_SCHEMA_VERSION,
  REFRESH_OPERATION_STATUS, REFRESH_UNRESOLVED_STATUSES, makeRefresherState, normalizeCohortCreateInput, normalizeCohortId, normalizeGeneratorId, normalizePolicy, normalizeSourceHash, operationIdFor
} from "./schema.js";
import { fail, plain, snapshotMethods, revision, isoNow, publicState, normalizeAccountSnapshot, normalizeRemoteRow, replaceCohort, replaceMember } from "./refresher-helpers.js";

export function createRefresherStore({stateStore,accountsService,providerGateResolver,remoteOperationReader,clock=()=>new Date().toISOString()}={}){
  const store=snapshotMethods(stateStore,["read","compareAndSwap"],"Refresher state store");
  const accounts=snapshotMethods(accountsService,["getAccount"],"Refresher Accounts service",{allowExtra:true});
  const gates=snapshotMethods(providerGateResolver,["get"],"Refresher ProviderGate resolver",{allowExtra:true});
  const remote=snapshotMethods(remoteOperationReader,["get"],"Refresher RemoteOperation reader",{allowExtra:true});
  if(typeof clock!=="function")throw new TypeError("Refresher clock must be a function");if(REFRESHER_PROVIDER_ID!==PERCHANCE_PROVIDER_ID)throw new TypeError("Refresher provider identity is incompatible");
  async function read(){let raw;try{raw=await store.read();}catch{fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);}return publicState(raw);}
  async function commit(expectedRevision,value){
    let result;try{result=await store.compareAndSwap(Object.freeze({expectedRevision,value}));}catch{fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);}
    if(!plain(result)||Object.getOwnPropertySymbols(result).length)fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);const d=Object.getOwnPropertyDescriptors(result);for(const x of Object.values(d))if(!x.enumerable||!Object.hasOwn(x,"value"))fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
    if(d.ok?.value===false){if(Object.keys(d).length!==2||!Object.hasOwn(d,"currentRevision")||!Number.isSafeInteger(d.currentRevision.value)||d.currentRevision.value<0)fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);fail(REFRESHER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:d.currentRevision.value});}
    if(d.ok?.value!==true||Object.keys(d).length!==3||!Object.hasOwn(d,"revision")||!Object.hasOwn(d,"value"))fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
    return publicState({revision:d.revision.value,value:d.value.value});
  }
  async function requireAccount(accountId){let raw;try{raw=await accounts.getAccount(accountId);}catch{fail(REFRESHER_ERROR_CODES.ACCOUNT_UNAVAILABLE);}if(raw===null)fail(REFRESHER_ERROR_CODES.ACCOUNT_UNAVAILABLE);return normalizeAccountSnapshot(raw,accountId);}
  async function gateFor(accountId){let raw;try{raw=await gates.get(accountId);}catch{fail(REFRESHER_ERROR_CODES.PROVIDER_UNAVAILABLE);}if(raw===null)fail(REFRESHER_ERROR_CODES.PROVIDER_UNAVAILABLE);try{return snapshotMethods(raw,["mutate","reconcile"],"Account ProviderGate",{allowExtra:true});}catch{fail(REFRESHER_ERROR_CODES.PROVIDER_UNAVAILABLE);}}
  async function remoteState(operationId){let raw;try{raw=await remote.get(operationId);}catch{fail(REFRESHER_ERROR_CODES.REMOTE_STATE);}return normalizeRemoteRow(raw,operationId);}
  async function createCohort(input,{expectedRevision}={}){
    const draft=normalizeCohortCreateInput(input);const expected=revision(expectedRevision);const current=await read();if(current.revision!==expected)fail(REFRESHER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    if(current.value.cohorts.length>=REFRESHER_MAX_COHORTS)fail(REFRESHER_ERROR_CODES.CAPACITY);if(current.value.cohorts.some(x=>x.cohortId===draft.cohortId))fail(REFRESHER_ERROR_CODES.INVALID_ARGUMENT);
    const targets=new Set(current.value.cohorts.flatMap(x=>x.members.map(m=>m.generatorId)));for(const member of draft.members)if(targets.has(member.generatorId))fail(REFRESHER_ERROR_CODES.TARGET_CONFLICT);
    await requireAccount(draft.accountId);const now=isoNow(clock);
    const cohort=Object.freeze({schemaVersion:REFRESHER_SCHEMA_VERSION,kind:REFRESHER_COHORT_KIND,cohortId:draft.cohortId,providerId:REFRESHER_PROVIDER_ID,accountId:draft.accountId,enabled:draft.enabled,policy:draft.policy,
      members:Object.freeze(draft.members.map((m,i)=>Object.freeze({schemaVersion:REFRESHER_SCHEMA_VERSION,kind:REFRESHER_MEMBER_KIND,generatorId:m.generatorId,sourceHash:m.sourceHash,ordinal:i+1,lastConfirmedAt:null,confirmedCount:0,operation:Object.freeze({sequence:0,operationId:null,status:REFRESH_OPERATION_STATUS.IDLE,budgetDayStart:null}),createdAt:now,updatedAt:now}))),createdAt:now,updatedAt:now});
    const saved=await commit(current.revision,makeRefresherState([...current.value.cohorts,cohort]));return Object.freeze({revision:saved.revision,cohort:saved.value.cohorts.find(x=>x.cohortId===draft.cohortId)});
  }
  async function getCohort(rawCohortId){const cohortId=normalizeCohortId(rawCohortId);const current=await read();return current.value.cohorts.find(x=>x.cohortId===cohortId)||null;}
  async function listCohorts(){const current=await read();return Object.freeze({revision:current.revision,cohorts:current.value.cohorts});}
  async function updatePolicy(rawCohortId,{expectedRevision,enabled,policy}={}){
    const cohortId=normalizeCohortId(rawCohortId);const expected=revision(expectedRevision);if(typeof enabled!=="boolean")fail(REFRESHER_ERROR_CODES.INVALID_ARGUMENT);const normalizedPolicy=normalizePolicy(policy);const current=await read();if(current.revision!==expected)fail(REFRESHER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const cohort=current.value.cohorts.find(x=>x.cohortId===cohortId);if(!cohort)fail(REFRESHER_ERROR_CODES.NOT_FOUND);if(cohort.members.some(m=>REFRESH_UNRESOLVED_STATUSES.has(m.operation.status)))fail(REFRESHER_ERROR_CODES.OPERATION_BUSY);
    const next=Object.freeze({...cohort,enabled,policy:normalizedPolicy,updatedAt:isoNow(clock)});const saved=await commit(current.revision,replaceCohort(current,cohortId,next));return Object.freeze({revision:saved.revision,cohort:saved.value.cohorts.find(x=>x.cohortId===cohortId)});
  }
  async function setMemberSourceHash(rawCohortId,rawGeneratorId,{expectedRevision,sourceHash}={}){
    const cohortId=normalizeCohortId(rawCohortId),generatorId=normalizeGeneratorId(rawGeneratorId),hash=normalizeSourceHash(sourceHash),expected=revision(expectedRevision);const current=await read();if(current.revision!==expected)fail(REFRESHER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const cohort=current.value.cohorts.find(x=>x.cohortId===cohortId);if(!cohort)fail(REFRESHER_ERROR_CODES.NOT_FOUND);const member=cohort.members.find(x=>x.generatorId===generatorId);if(!member)fail(REFRESHER_ERROR_CODES.NOT_FOUND);if(REFRESH_UNRESOLVED_STATUSES.has(member.operation.status))fail(REFRESHER_ERROR_CODES.OPERATION_BUSY);if(member.sourceHash===hash)return Object.freeze({revision:current.revision,changed:false,member});
    const nextMember=Object.freeze({...member,sourceHash:hash,updatedAt:isoNow(clock)});const nextCohort=Object.freeze({...replaceMember(cohort,generatorId,nextMember),updatedAt:nextMember.updatedAt});const saved=await commit(current.revision,replaceCohort(current,cohortId,nextCohort));return Object.freeze({revision:saved.revision,changed:true,member:saved.value.cohorts.find(x=>x.cohortId===cohortId).members.find(x=>x.generatorId===generatorId)});
  }
  return Object.freeze({read,commit,requireAccount,gateFor,remoteState,createCohort,getCohort,listCohorts,updatePolicy,setMemberSourceHash,clock});
}
