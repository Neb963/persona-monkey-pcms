import { DEPLOYER_ERROR_CODES, deployerError } from "./errors.js";
import {
  DEPLOYER_MAX_DEPLOYMENTS,
  DEPLOYER_PROVIDER_ID,
  DEPLOYER_SCHEMA_VERSION,
  DEPLOYER_TARGET_KIND,
  DEPLOYMENT_KIND,
  DEPLOYMENT_OPERATION_STATUS,
  emptyDeployerState,
  makeDeployerState,
  normalizeDeployerState,
  normalizeDeploymentCreateInput,
  normalizeDeploymentId,
  normalizeSourceHash,
  operationIdFor
} from "./schema.js";
import {
  PERCHANCE_GENERATOR_UPDATE_ACTION,
  PERCHANCE_PROVIDER_ID,
  generatorSourceFingerprint,
  sha256Hex
} from "../../extension/pcms/providers/perchance/contract.js";

const REMOTE_STATES = new Set(["PREPARED","DISPATCHING","UNCERTAIN","RETRYABLE","SUCCEEDED","FAILED","CANCELLED"]);
function fail(code, options = {}) { throw deployerError(code, options); }
function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype || proto===null;
}
function snapshotMethods(value, names, label, {allowExtra=false}={}) {
  if (!plain(value) || Object.getOwnPropertySymbols(value).length) throw new TypeError(label + " is invalid");
  const descriptors=Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor,"value")) throw new TypeError(label + " is invalid");
  }
  if (!allowExtra && Object.keys(descriptors).length !== names.length) throw new TypeError(label + " is invalid");
  if (!names.every((name)=>Object.hasOwn(descriptors,name) && typeof descriptors[name].value === "function")) throw new TypeError(label + " is invalid");
  return Object.freeze(Object.fromEntries(names.map((name)=>[name,descriptors[name].value])));
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT);
  return value;
}
function desiredRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT);
  return value;
}
function isoNow(clock) {
  let date; try { date=new Date(clock()); } catch { fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE); }
  if (Number.isNaN(date.getTime())) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  return date.toISOString();
}
function publicState(record) {
  if (record === null) return Object.freeze({revision:0,value:emptyDeployerState()});
  if (!plain(record) || Object.getOwnPropertySymbols(record).length) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const descriptors=Object.getOwnPropertyDescriptors(record);
  if (Object.keys(descriptors).length !== 2 || !Object.hasOwn(descriptors,"revision") || !Object.hasOwn(descriptors,"value")
      || !descriptors.revision.enumerable || !descriptors.value.enumerable || !Object.hasOwn(descriptors.revision,"value")
      || !Object.hasOwn(descriptors.value,"value") || !Number.isSafeInteger(descriptors.revision.value) || descriptors.revision.value < 1) {
    fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  }
  return Object.freeze({revision:descriptors.revision.value,value:normalizeDeployerState(descriptors.value.value)});
}
function normalizeAccountSnapshot(raw, expectedAccountId) {
  if (!plain(raw) || Object.getOwnPropertySymbols(raw).length) fail(DEPLOYER_ERROR_CODES.ACCOUNT_UNAVAILABLE);
  const descriptors=Object.getOwnPropertyDescriptors(raw);
  for (const descriptor of Object.values(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor,"value")) fail(DEPLOYER_ERROR_CODES.ACCOUNT_UNAVAILABLE);
  if (!Object.hasOwn(descriptors,"accountId") || !Object.hasOwn(descriptors,"providerId")
      || descriptors.accountId.value !== expectedAccountId || descriptors.providerId.value !== DEPLOYER_PROVIDER_ID) {
    fail(DEPLOYER_ERROR_CODES.ACCOUNT_UNAVAILABLE);
  }
  return Object.freeze({accountId:expectedAccountId,providerId:DEPLOYER_PROVIDER_ID});
}
function normalizeRemoteRow(raw, expectedOperationId) {
  if (raw === null) return null;
  if (!plain(raw) || Object.getOwnPropertySymbols(raw).length) fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
  const descriptors=Object.getOwnPropertyDescriptors(raw);
  for (const descriptor of Object.values(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor,"value")) fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
  if (!Object.hasOwn(descriptors,"value") || !plain(descriptors.value.value)) fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
  const valueDescriptors=Object.getOwnPropertyDescriptors(descriptors.value.value);
  for (const descriptor of Object.values(valueDescriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor,"value")) fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
  const operationId=valueDescriptors.operationId?.value; const state=valueDescriptors.state?.value;
  if (operationId !== expectedOperationId || !REMOTE_STATES.has(state)) fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
  return Object.freeze({state});
}
function replaceDeployment(state, deploymentId, replacement) {
  const index=state.value.deployments.findIndex((item)=>item.deploymentId===deploymentId);
  if(index<0) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
  const deployments=[...state.value.deployments]; deployments[index]=replacement; return makeDeployerState(deployments);
}
function project(deployment) {
  const status=deployment.operation.status; let syncState;
  if(status===DEPLOYMENT_OPERATION_STATUS.SUCCEEDED && deployment.observed.sourceHash===deployment.desired.sourceHash) syncState="IN_SYNC";
  else if(status===DEPLOYMENT_OPERATION_STATUS.ACTIVE) syncState="APPLYING";
  else if(status===DEPLOYMENT_OPERATION_STATUS.RECONCILE) syncState="UNCERTAIN";
  else if(status===DEPLOYMENT_OPERATION_STATUS.RETRYABLE) syncState="RETRYABLE";
  else if(status===DEPLOYMENT_OPERATION_STATUS.FAILED) syncState="FAILED";
  else if(status===DEPLOYMENT_OPERATION_STATUS.CANCELLED) syncState="CANCELLED";
  else syncState=deployment.observed.sourceHash===null ? "PENDING" : "OUT_OF_SYNC";
  return Object.freeze({
    deploymentId:deployment.deploymentId, accountId:deployment.accountId, generatorId:deployment.targetRef.id,
    desiredRevision:deployment.desired.revision, desiredSourceHash:deployment.desired.sourceHash,
    observedSourceHash:deployment.observed.sourceHash, operationId:deployment.operation.operationId,
    operationStatus:status, syncState,
    actions:Object.freeze({
      canDeploy:status===DEPLOYMENT_OPERATION_STATUS.PENDING || status===DEPLOYMENT_OPERATION_STATUS.RETRYABLE,
      canReconcile:status===DEPLOYMENT_OPERATION_STATUS.RECONCILE,
      canRetry:status===DEPLOYMENT_OPERATION_STATUS.FAILED || status===DEPLOYMENT_OPERATION_STATUS.CANCELLED,
      canUpdateDesired:![DEPLOYMENT_OPERATION_STATUS.ACTIVE,DEPLOYMENT_OPERATION_STATUS.RECONCILE,DEPLOYMENT_OPERATION_STATUS.RETRYABLE].includes(status)
    })
  });
}

export function createDeployerService({stateStore,accountsService,providerGateResolver,remoteOperationReader,clock=()=>new Date().toISOString()}={}) {
  const store=snapshotMethods(stateStore,["read","compareAndSwap"],"Deployer state store");
  const accounts=snapshotMethods(accountsService,["getAccount"],"Deployer Accounts service",{allowExtra:true});
  const gates=snapshotMethods(providerGateResolver,["get"],"Deployer ProviderGate resolver",{allowExtra:true});
  const remote=snapshotMethods(remoteOperationReader,["get"],"Deployer RemoteOperation reader",{allowExtra:true});
  if(typeof clock!=="function") throw new TypeError("Deployer clock must be a function");
  if(DEPLOYER_PROVIDER_ID!==PERCHANCE_PROVIDER_ID) throw new TypeError("Deployer provider identity is incompatible");

  async function read() {
    let raw; try { raw=await store.read(); } catch { fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE); }
    return publicState(raw);
  }
  async function commit(expectedRevision, value) {
    let result; try { result=await store.compareAndSwap(Object.freeze({expectedRevision,value})); } catch { fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE); }
    if(!plain(result) || Object.getOwnPropertySymbols(result).length) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
    const descriptors=Object.getOwnPropertyDescriptors(result);
    for(const descriptor of Object.values(descriptors)) if(!descriptor.enumerable || !Object.hasOwn(descriptor,"value")) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
    if(descriptors.ok?.value===false) {
      if(Object.keys(descriptors).length!==2 || !Object.hasOwn(descriptors,"currentRevision")
          || !Number.isSafeInteger(descriptors.currentRevision.value) || descriptors.currentRevision.value<0) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
      fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:descriptors.currentRevision.value});
    }
    if(descriptors.ok?.value!==true || Object.keys(descriptors).length!==3 || !Object.hasOwn(descriptors,"revision") || !Object.hasOwn(descriptors,"value")) {
      fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
    }
    return publicState({revision:descriptors.revision.value,value:descriptors.value.value});
  }
  async function requireAccount(accountId) {
    let raw; try { raw=await accounts.getAccount(accountId); } catch { fail(DEPLOYER_ERROR_CODES.ACCOUNT_UNAVAILABLE); }
    if(raw===null) fail(DEPLOYER_ERROR_CODES.ACCOUNT_UNAVAILABLE);
    return normalizeAccountSnapshot(raw,accountId);
  }
  async function gateFor(accountId) {
    let raw; try { raw=await gates.get(accountId); } catch { fail(DEPLOYER_ERROR_CODES.PROVIDER_UNAVAILABLE); }
    if(raw===null) fail(DEPLOYER_ERROR_CODES.PROVIDER_UNAVAILABLE);
    try { return snapshotMethods(raw,["mutate","reconcile"],"Account ProviderGate",{allowExtra:true}); } catch { fail(DEPLOYER_ERROR_CODES.PROVIDER_UNAVAILABLE); }
  }
  async function remoteState(operationId) {
    let raw; try { raw=await remote.get(operationId); } catch { fail(DEPLOYER_ERROR_CODES.REMOTE_STATE); }
    return normalizeRemoteRow(raw,operationId);
  }
  function operationDraft(deployment) {
    return Object.freeze({
      operationId:deployment.operation.operationId,
      providerId:PERCHANCE_PROVIDER_ID,
      action:PERCHANCE_GENERATOR_UPDATE_ACTION,
      targetRef:Object.freeze({kind:DEPLOYER_TARGET_KIND,id:deployment.targetRef.id}),
      intentFingerprint:generatorSourceFingerprint(deployment.desired.sourceHash)
    });
  }
  async function settleOperation(deploymentId, operationId, remoteStatus, {fallbackStatus=null}={}) {
    for(let attempt=0;attempt<8;attempt+=1) {
      const current=await read();
      const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
      if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
      if(existing.operation.operationId!==operationId) return Object.freeze({revision:current.revision,deployment:existing});
      let status; let observed=existing.observed;
      if(remoteStatus===null) status=fallbackStatus || DEPLOYMENT_OPERATION_STATUS.RECONCILE;
      else if(remoteStatus==="PREPARED") status=DEPLOYMENT_OPERATION_STATUS.PENDING;
      else if(remoteStatus==="UNCERTAIN" || remoteStatus==="DISPATCHING") status=DEPLOYMENT_OPERATION_STATUS.RECONCILE;
      else if(remoteStatus==="RETRYABLE") status=DEPLOYMENT_OPERATION_STATUS.RETRYABLE;
      else if(remoteStatus==="FAILED") status=DEPLOYMENT_OPERATION_STATUS.FAILED;
      else if(remoteStatus==="CANCELLED") status=DEPLOYMENT_OPERATION_STATUS.CANCELLED;
      else if(remoteStatus==="SUCCEEDED") {
        status=DEPLOYMENT_OPERATION_STATUS.SUCCEEDED;
        observed=Object.freeze({sourceHash:existing.desired.sourceHash,confirmedAt:isoNow(clock)});
      } else fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
      const updated=Object.freeze({...existing,observed,operation:Object.freeze({...existing.operation,status}),updatedAt:isoNow(clock)});
      try {
        const saved=await commit(current.revision,replaceDeployment(current,deploymentId,updated));
        return Object.freeze({revision:saved.revision,deployment:saved.value.deployments.find((item)=>item.deploymentId===deploymentId)});
      } catch(error) {
        if(error?.code!==DEPLOYER_ERROR_CODES.REVISION_CONFLICT) throw error;
      }
    }
    fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT);
  }
  async function createDeployment(input,{expectedRevision}={}) {
    const draft=normalizeDeploymentCreateInput(input); const expected=revision(expectedRevision); const current=await read();
    if(current.revision!==expected) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    if(current.value.deployments.length>=DEPLOYER_MAX_DEPLOYMENTS) fail(DEPLOYER_ERROR_CODES.CAPACITY);
    if(current.value.deployments.some((item)=>item.deploymentId===draft.deploymentId)) fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT);
    if(current.value.deployments.some((item)=>item.targetRef.id===draft.generatorId)) fail(DEPLOYER_ERROR_CODES.TARGET_CONFLICT);
    await requireAccount(draft.accountId);
    const now=isoNow(clock);
    const deployment=Object.freeze({
      schemaVersion:DEPLOYER_SCHEMA_VERSION,kind:DEPLOYMENT_KIND,deploymentId:draft.deploymentId,providerId:DEPLOYER_PROVIDER_ID,
      accountId:draft.accountId,targetRef:Object.freeze({kind:DEPLOYER_TARGET_KIND,id:draft.generatorId}),
      desired:Object.freeze({revision:1,sourceHash:draft.sourceHash}),observed:Object.freeze({sourceHash:null,confirmedAt:null}),
      operation:Object.freeze({sequence:1,operationId:operationIdFor(draft.deploymentId,1,1),status:DEPLOYMENT_OPERATION_STATUS.PENDING}),
      createdAt:now,updatedAt:now
    });
    const saved=await commit(current.revision,makeDeployerState([...current.value.deployments,deployment]));
    return Object.freeze({revision:saved.revision,deployment:saved.value.deployments.find((item)=>item.deploymentId===draft.deploymentId)});
  }
  async function getDeployment(rawDeploymentId) {
    const deploymentId=normalizeDeploymentId(rawDeploymentId); const current=await read();
    return current.value.deployments.find((item)=>item.deploymentId===deploymentId) || null;
  }
  async function listDeployments() {
    const current=await read(); return Object.freeze({revision:current.revision,deployments:current.value.deployments});
  }
  async function listDeploymentViews() {
    const current=await read(); return Object.freeze({revision:current.revision,deployments:Object.freeze(current.value.deployments.map(project))});
  }
  async function setDesired(rawDeploymentId,{expectedRevision,expectedDesiredRevision,sourceHash}={}) {
    const deploymentId=normalizeDeploymentId(rawDeploymentId); const expected=revision(expectedRevision);
    const expectedDesired=desiredRevision(expectedDesiredRevision); const nextHash=normalizeSourceHash(sourceHash); const current=await read();
    if(current.revision!==expected) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
    if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
    if(existing.desired.revision!==expectedDesired) fail(DEPLOYER_ERROR_CODES.INVALID_TRANSITION);
    if([DEPLOYMENT_OPERATION_STATUS.ACTIVE,DEPLOYMENT_OPERATION_STATUS.RECONCILE,DEPLOYMENT_OPERATION_STATUS.RETRYABLE].includes(existing.operation.status)) {
      fail(DEPLOYER_ERROR_CODES.OPERATION_BUSY);
    }
    if(existing.desired.sourceHash===nextHash) return Object.freeze({revision:current.revision,changed:false,deployment:existing});
    const nextDesiredRevision=existing.desired.revision+1;
    const next=Object.freeze({...existing,desired:Object.freeze({revision:nextDesiredRevision,sourceHash:nextHash}),
      operation:Object.freeze({sequence:1,operationId:operationIdFor(existing.deploymentId,nextDesiredRevision,1),status:DEPLOYMENT_OPERATION_STATUS.PENDING}),
      updatedAt:isoNow(clock)});
    const saved=await commit(current.revision,replaceDeployment(current,deploymentId,next));
    return Object.freeze({revision:saved.revision,changed:true,deployment:saved.value.deployments.find((item)=>item.deploymentId===deploymentId)});
  }
  async function prepareRetry(rawDeploymentId,{expectedRevision}={}) {
    const deploymentId=normalizeDeploymentId(rawDeploymentId); const expected=revision(expectedRevision); const current=await read();
    if(current.revision!==expected) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
    if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
    if(![DEPLOYMENT_OPERATION_STATUS.FAILED,DEPLOYMENT_OPERATION_STATUS.CANCELLED].includes(existing.operation.status)) fail(DEPLOYER_ERROR_CODES.INVALID_TRANSITION);
    const sequence=existing.operation.sequence+1;
    const next=Object.freeze({...existing,operation:Object.freeze({sequence,operationId:operationIdFor(existing.deploymentId,existing.desired.revision,sequence),status:DEPLOYMENT_OPERATION_STATUS.PENDING}),updatedAt:isoNow(clock)});
    const saved=await commit(current.revision,replaceDeployment(current,deploymentId,next));
    return Object.freeze({revision:saved.revision,deployment:saved.value.deployments.find((item)=>item.deploymentId===deploymentId)});
  }
  async function deploy(rawDeploymentId,{expectedRevision,source}={}) {
    const deploymentId=normalizeDeploymentId(rawDeploymentId); const expected=revision(expectedRevision); const current=await read();
    if(current.revision!==expected) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
    if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
    const previousStatus=existing.operation.status;
    if(![DEPLOYMENT_OPERATION_STATUS.PENDING,DEPLOYMENT_OPERATION_STATUS.RETRYABLE].includes(previousStatus)) fail(DEPLOYER_ERROR_CODES.INVALID_TRANSITION);
    await requireAccount(existing.accountId);
    const gate=await gateFor(existing.accountId);
    let actualHash; try { actualHash=await sha256Hex(source); } catch { fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT); }
    if(actualHash!==existing.desired.sourceHash) fail(DEPLOYER_ERROR_CODES.SOURCE_MISMATCH);
    const active=Object.freeze({...existing,operation:Object.freeze({...existing.operation,status:DEPLOYMENT_OPERATION_STATUS.ACTIVE}),updatedAt:isoNow(clock)});
    const activeState=await commit(current.revision,replaceDeployment(current,deploymentId,active));
    const activeDeployment=activeState.value.deployments.find((item)=>item.deploymentId===deploymentId);
    let result;
    try {
      result=await gate.mutate(Object.freeze({operation:operationDraft(activeDeployment),
        dispatchInput:Object.freeze({sourceHash:activeDeployment.desired.sourceHash,source})}));
    } catch(error) {
      let remoteSnapshot;
      try { remoteSnapshot=await remoteState(activeDeployment.operation.operationId); }
      catch {
        try { await settleOperation(deploymentId,activeDeployment.operation.operationId,"UNCERTAIN"); } catch {}
        throw error;
      }
      try {
        await settleOperation(deploymentId,activeDeployment.operation.operationId,remoteSnapshot?.state || null,{fallbackStatus:previousStatus});
      } catch {}
      throw error;
    }
    if(!plain(result) || !["APPLIED","NOT_APPLIED","ALREADY_APPLIED"].includes(result.status)) fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
    const remoteStatus=result.status==="NOT_APPLIED" ? "FAILED" : "SUCCEEDED";
    const settled=await settleOperation(deploymentId,activeDeployment.operation.operationId,remoteStatus);
    return Object.freeze({revision:settled.revision,status:result.status,deployment:settled.deployment});
  }
  async function reconcileDeployment(rawDeploymentId,{expectedRevision}={}) {
    const deploymentId=normalizeDeploymentId(rawDeploymentId); const expected=revision(expectedRevision); const current=await read();
    if(current.revision!==expected) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
    if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
    if(![DEPLOYMENT_OPERATION_STATUS.RECONCILE,DEPLOYMENT_OPERATION_STATUS.ACTIVE].includes(existing.operation.status)) fail(DEPLOYER_ERROR_CODES.INVALID_TRANSITION);
    const snapshot=await remoteState(existing.operation.operationId);
    if(snapshot===null) return settleOperation(deploymentId,existing.operation.operationId,null,{fallbackStatus:DEPLOYMENT_OPERATION_STATUS.PENDING});
    if(snapshot.state==="DISPATCHING") fail(DEPLOYER_ERROR_CODES.OPERATION_BUSY);
    if(snapshot.state==="UNCERTAIN") {
      await requireAccount(existing.accountId); const gate=await gateFor(existing.accountId); let reconciled;
      try { reconciled=await gate.reconcile(existing.operation.operationId); }
      catch { return settleOperation(deploymentId,existing.operation.operationId,"UNCERTAIN"); }
      const state=reconciled?.value?.state;
      if(!REMOTE_STATES.has(state)) fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
      return settleOperation(deploymentId,existing.operation.operationId,state);
    }
    return settleOperation(deploymentId,existing.operation.operationId,snapshot.state);
  }
  return Object.freeze({createDeployment,getDeployment,listDeployments,listDeploymentViews,setDesired,prepareRetry,deploy,reconcileDeployment});
}
export { DEPLOYMENT_OPERATION_STATUS };
