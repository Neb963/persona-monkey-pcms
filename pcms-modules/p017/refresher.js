import { REFRESHER_ERROR_CODES } from "./errors.js";
import { REFRESHER_MAX_MEMBERS, REFRESHER_MODE, REFRESH_OPERATION_STATUS, REFRESH_UNRESOLVED_STATUSES, normalizeCohortId, normalizeGeneratorId, operationIdFor } from "./schema.js";
import { fail, revision, isoNow, replaceCohort, replaceMember, scheduleInfo, inDay, usedBudget, eligibleMember, sortEligible, project } from "./refresher-helpers.js";
import { createRefresherStore } from "./refresher-store.js";
import { createRefreshOperations } from "./refresher-operations.js";

export function createRefresherService(options={}){
  const ctx=createRefresherStore(options);
  const {read,commit,requireAccount,gateFor,remoteState,createCohort,getCohort,listCohorts,updatePolicy,setMemberSourceHash,clock}=ctx;
  async function planRefreshes(rawCohortId,{at=clock(),limit=256}={}){
    const cohortId=normalizeCohortId(rawCohortId);if(!Number.isSafeInteger(limit)||limit<1||limit>REFRESHER_MAX_MEMBERS)fail(REFRESHER_ERROR_CODES.INVALID_ARGUMENT);const current=await read();const cohort=current.value.cohorts.find(x=>x.cohortId===cohortId);if(!cohort)fail(REFRESHER_ERROR_CODES.NOT_FOUND);const info=scheduleInfo(cohort.policy,at);const used=usedBudget(cohort,info);const remaining=Math.max(0,cohort.policy.dailyBudget-used);
    let eligible=[];if(cohort.enabled&&cohort.policy.mode===REFRESHER_MODE.AUTO_RECENT&&info.active&&remaining>0)eligible=cohort.members.filter(m=>eligibleMember(m,info)).sort(sortEligible).slice(0,Math.min(limit,remaining));
    return Object.freeze({revision:current.revision,cohortId,mode:cohort.policy.mode,enabled:cohort.enabled,active:info.active,dayStart:info.dayStart,dayEnd:info.dayEnd,budget:Object.freeze({limit:cohort.policy.dailyBudget,used,remaining}),members:Object.freeze(eligible.map(m=>project(cohort,m,info)))});
  }
  async function listCohortViews({at=clock()}={}){const current=await read();const views=current.value.cohorts.map(cohort=>{const info=scheduleInfo(cohort.policy,at);const used=usedBudget(cohort,info);return Object.freeze({cohortId:cohort.cohortId,accountId:cohort.accountId,enabled:cohort.enabled,mode:cohort.policy.mode,active:info.active,dayStart:info.dayStart,budget:Object.freeze({limit:cohort.policy.dailyBudget,used,remaining:Math.max(0,cohort.policy.dailyBudget-used)}),members:Object.freeze(cohort.members.map(m=>project(cohort,m,info)))});});return Object.freeze({revision:current.revision,cohorts:Object.freeze(views)});}
  async function prepareRefresh(rawCohortId,rawGeneratorId,{expectedRevision,at=clock()}={}){
    const cohortId=normalizeCohortId(rawCohortId),generatorId=normalizeGeneratorId(rawGeneratorId),expected=revision(expectedRevision);const current=await read();if(current.revision!==expected)fail(REFRESHER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});const cohort=current.value.cohorts.find(x=>x.cohortId===cohortId);if(!cohort)fail(REFRESHER_ERROR_CODES.NOT_FOUND);const member=cohort.members.find(x=>x.generatorId===generatorId);if(!member)fail(REFRESHER_ERROR_CODES.NOT_FOUND);if(!cohort.enabled)fail(REFRESHER_ERROR_CODES.SCHEDULE_INACTIVE);if(REFRESH_UNRESOLVED_STATUSES.has(member.operation.status))fail(REFRESHER_ERROR_CODES.OPERATION_BUSY);
    const info=scheduleInfo(cohort.policy,at);if(cohort.policy.mode===REFRESHER_MODE.AUTO_RECENT&&!info.active)fail(REFRESHER_ERROR_CODES.SCHEDULE_INACTIVE);if(inDay(member.lastConfirmedAt,info))fail(REFRESHER_ERROR_CODES.INVALID_TRANSITION);if(usedBudget(cohort,info)>=cohort.policy.dailyBudget)fail(REFRESHER_ERROR_CODES.BUDGET_EXHAUSTED);await requireAccount(cohort.accountId);
    const sequence=member.operation.sequence+1;const now=isoNow(clock);const nextMember=Object.freeze({...member,operation:Object.freeze({sequence,operationId:operationIdFor(cohortId,member.ordinal,sequence),status:REFRESH_OPERATION_STATUS.PENDING,budgetDayStart:info.dayStart}),updatedAt:now});const nextCohort=Object.freeze({...replaceMember(cohort,generatorId,nextMember),updatedAt:now});const saved=await commit(current.revision,replaceCohort(current,cohortId,nextCohort));return Object.freeze({revision:saved.revision,member:saved.value.cohorts.find(x=>x.cohortId===cohortId).members.find(x=>x.generatorId===generatorId)});
  }
  const {dispatchRefresh,reconcileRefresh}=createRefreshOperations({read,commit,requireAccount,gateFor,remoteState,clock});
  return Object.freeze({createCohort,getCohort,listCohorts,updatePolicy,setMemberSourceHash,planRefreshes,listCohortViews,prepareRefresh,dispatchRefresh,reconcileRefresh});
}
export { REFRESHER_MODE, REFRESH_OPERATION_STATUS };
