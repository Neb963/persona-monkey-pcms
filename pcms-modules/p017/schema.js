import { REFRESHER_ERROR_CODES } from "./errors.js";
import {
  REFRESHER_SCHEMA_VERSION, REFRESHER_PROVIDER_ID, REFRESHER_STATE_KIND, REFRESHER_COHORT_KIND, REFRESHER_MEMBER_KIND,
  REFRESHER_MAX_COHORTS, REFRESHER_MAX_MEMBERS, REFRESH_OPERATION_STATUS, REFRESH_OPERATION_STATUS_SET, REFRESH_UNRESOLVED_STATUSES,
  fail, exact, denseArray, normalizeCohortId, normalizeAccountId, normalizeGeneratorId, normalizeSourceHash, normalizeTimestamp, normalizePolicy, operationIdFor
} from "./schema-input.js";
export * from "./schema-input.js";

function normalizeOperation(value,cohortId,ordinal,code){
  exact(value,["sequence","operationId","status","budgetDayStart"],code);
  if(!Number.isSafeInteger(value.sequence)||value.sequence<0||!REFRESH_OPERATION_STATUS_SET.has(value.status))fail(code);
  if(value.sequence===0){
    if(value.operationId!==null||value.status!==REFRESH_OPERATION_STATUS.IDLE||value.budgetDayStart!==null)fail(code);
    return Object.freeze({sequence:0,operationId:null,status:REFRESH_OPERATION_STATUS.IDLE,budgetDayStart:null});
  }
  const expected=operationIdFor(cohortId,ordinal,value.sequence);
  if(value.operationId!==expected)fail(code);
  const budgetDayStart=value.budgetDayStart===null?null:normalizeTimestamp(value.budgetDayStart,code);
  if(REFRESH_UNRESOLVED_STATUSES.has(value.status)&&budgetDayStart===null)fail(code);
  return Object.freeze({sequence:value.sequence,operationId:expected,status:value.status,budgetDayStart});
}
export function normalizeMemberRecord(value,cohortId){
  exact(value,["schemaVersion","kind","generatorId","sourceHash","ordinal","lastConfirmedAt","confirmedCount","operation","createdAt","updatedAt"],REFRESHER_ERROR_CODES.CORRUPT_STATE);
  if(value.schemaVersion!==REFRESHER_SCHEMA_VERSION||value.kind!==REFRESHER_MEMBER_KIND
      ||!Number.isSafeInteger(value.ordinal)||value.ordinal<1||value.ordinal>REFRESHER_MAX_MEMBERS
      ||!Number.isSafeInteger(value.confirmedCount)||value.confirmedCount<0)fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
  const lastConfirmedAt=value.lastConfirmedAt===null?null:normalizeTimestamp(value.lastConfirmedAt);
  if((value.confirmedCount===0)!==(lastConfirmedAt===null))fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
  return Object.freeze({
    schemaVersion:REFRESHER_SCHEMA_VERSION,kind:REFRESHER_MEMBER_KIND,
    generatorId:normalizeGeneratorId(value.generatorId,REFRESHER_ERROR_CODES.CORRUPT_STATE),
    sourceHash:normalizeSourceHash(value.sourceHash,REFRESHER_ERROR_CODES.CORRUPT_STATE),ordinal:value.ordinal,
    lastConfirmedAt,confirmedCount:value.confirmedCount,
    operation:normalizeOperation(value.operation,cohortId,value.ordinal,REFRESHER_ERROR_CODES.CORRUPT_STATE),
    createdAt:normalizeTimestamp(value.createdAt),updatedAt:normalizeTimestamp(value.updatedAt)
  });
}
export function normalizeCohortRecord(value){
  exact(value,["schemaVersion","kind","cohortId","providerId","accountId","enabled","policy","members","createdAt","updatedAt"],REFRESHER_ERROR_CODES.CORRUPT_STATE);
  if(value.schemaVersion!==REFRESHER_SCHEMA_VERSION||value.kind!==REFRESHER_COHORT_KIND||value.providerId!==REFRESHER_PROVIDER_ID||typeof value.enabled!=="boolean")fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
  const cohortId=normalizeCohortId(value.cohortId,REFRESHER_ERROR_CODES.CORRUPT_STATE);
  denseArray(value.members,REFRESHER_ERROR_CODES.CORRUPT_STATE);
  if(value.members.length<1||value.members.length>REFRESHER_MAX_MEMBERS)fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
  const members=[];const targets=new Set();
  for(let index=0;index<value.members.length;index+=1){
    const member=normalizeMemberRecord(value.members[index],cohortId);
    if(member.ordinal!==index+1||targets.has(member.generatorId))fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
    targets.add(member.generatorId);members.push(member);
  }
  return Object.freeze({
    schemaVersion:REFRESHER_SCHEMA_VERSION,kind:REFRESHER_COHORT_KIND,cohortId,providerId:REFRESHER_PROVIDER_ID,
    accountId:normalizeAccountId(value.accountId,REFRESHER_ERROR_CODES.CORRUPT_STATE),enabled:value.enabled,
    policy:normalizePolicy(value.policy,REFRESHER_ERROR_CODES.CORRUPT_STATE),members:Object.freeze(members),
    createdAt:normalizeTimestamp(value.createdAt),updatedAt:normalizeTimestamp(value.updatedAt)
  });
}
export function emptyRefresherState(){return Object.freeze({schemaVersion:REFRESHER_SCHEMA_VERSION,kind:REFRESHER_STATE_KIND,cohorts:Object.freeze([])});}
export function normalizeRefresherState(value){
  exact(value,["schemaVersion","kind","cohorts"],REFRESHER_ERROR_CODES.CORRUPT_STATE);
  if(value.schemaVersion!==REFRESHER_SCHEMA_VERSION||value.kind!==REFRESHER_STATE_KIND)fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
  denseArray(value.cohorts,REFRESHER_ERROR_CODES.CORRUPT_STATE);if(value.cohorts.length>REFRESHER_MAX_COHORTS)fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
  const cohorts=[];const cohortIds=new Set();const targets=new Set();let previous=null;
  for(const raw of value.cohorts){
    const cohort=normalizeCohortRecord(raw);
    if(cohortIds.has(cohort.cohortId)||(previous!==null&&previous.localeCompare(cohort.cohortId)>=0))fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);
    for(const member of cohort.members){if(targets.has(member.generatorId))fail(REFRESHER_ERROR_CODES.CORRUPT_STATE);targets.add(member.generatorId);}
    cohortIds.add(cohort.cohortId);cohorts.push(cohort);previous=cohort.cohortId;
  }
  return Object.freeze({schemaVersion:REFRESHER_SCHEMA_VERSION,kind:REFRESHER_STATE_KIND,cohorts:Object.freeze(cohorts)});
}
export function makeRefresherState(cohorts){
  if(!Array.isArray(cohorts))fail();const normalized=cohorts.map(normalizeCohortRecord).sort((a,b)=>a.cohortId.localeCompare(b.cohortId));
  return normalizeRefresherState({schemaVersion:REFRESHER_SCHEMA_VERSION,kind:REFRESHER_STATE_KIND,cohorts:normalized});
}
