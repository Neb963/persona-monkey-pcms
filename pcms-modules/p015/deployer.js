import { DEPLOYER_ERROR_CODES, deployerError } from "./errors.js";
import {
  DEPLOYER_MAX_DEPLOYMENTS,
  DEPLOYER_PROVIDER_ID,
  DEPLOYER_SCHEMA_VERSION,
  DEPLOYER_TARGET_KIND,
  DEPLOYMENT_KIND,
  DEPLOYMENT_OPERATION_STATUS,
  DEPLOYMENT_PAYLOAD_KINDS,
  EMPTY_CONFIRMED,
  confirmedMatchesDesired,
  emptyDeployerState,
  hasExactKeys,
  isConfirmed,
  makeDeployerState,
  normalizeDeploymentCreateInput,
  normalizeDeploymentId,
  normalizeDesiredIntent,
  normalizeSourceHash,
  operationIdFor,
  sameIntent
} from "./schema.js";
import { readDeployerState } from "./migration.js";
import {
  PERCHANCE_GENERATOR_UPDATE_ACTION,
  PERCHANCE_PROVIDER_ID,
  generatorPayloadHash,
  generatorReleaseFingerprint,
  generatorSourceFingerprint,
  sha256Hex,
  thumbnailHash
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
  // MIG-P036-deployer-state-v2 is applied on read; the next write persists v2.
  const read=readDeployerState(descriptors.value.value);
  return Object.freeze({revision:descriptors.revision.value,value:read.value,migrated:read.migrated});
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
const BUSY_STATUSES=[DEPLOYMENT_OPERATION_STATUS.ACTIVE,DEPLOYMENT_OPERATION_STATUS.RECONCILE,DEPLOYMENT_OPERATION_STATUS.RETRYABLE];
function isV1Source(deployment) { return deployment.desired.payloadKind===DEPLOYMENT_PAYLOAD_KINDS.V1_SOURCE; }
function confirmedIsV1(confirmed) { return isConfirmed(confirmed) && confirmed.listing===null && confirmed.thumbnailHash===null; }

// Read-only UI projection. The accepted v1 fields (syncState, actions, *SourceHash) are kept
// for the legacy forms and capability set v1 until P040 removes those consumers; status for
// the v2 UI comes from deriveGeneratorStatus (status.js) through the generator index.
function project(deployment) {
  const status=deployment.operation.status; let syncState;
  if(status===DEPLOYMENT_OPERATION_STATUS.SUCCEEDED && confirmedMatchesDesired(deployment.confirmed,deployment.desired)) syncState="IN_SYNC";
  else if(status===DEPLOYMENT_OPERATION_STATUS.ACTIVE) syncState="APPLYING";
  else if(status===DEPLOYMENT_OPERATION_STATUS.RECONCILE) syncState="UNCERTAIN";
  else if(status===DEPLOYMENT_OPERATION_STATUS.RETRYABLE) syncState="RETRYABLE";
  else if(status===DEPLOYMENT_OPERATION_STATUS.FAILED) syncState="FAILED";
  else if(status===DEPLOYMENT_OPERATION_STATUS.CANCELLED) syncState="CANCELLED";
  else syncState=isConfirmed(deployment.confirmed) ? "OUT_OF_SYNC" : "PENDING";
  return Object.freeze({
    deploymentId:deployment.deploymentId, accountId:deployment.accountId, generatorId:deployment.targetRef.id,
    desiredRevision:deployment.desired.revision,
    desiredSourceHash:isV1Source(deployment) ? deployment.desired.payloadHash : null,
    observedSourceHash:confirmedIsV1(deployment.confirmed) ? deployment.confirmed.payloadHash : null,
    operationId:deployment.operation.operationId,
    operationStatus:status, syncState,
    payloadKind:deployment.desired.payloadKind,
    desiredPayloadHash:deployment.desired.payloadHash,
    desiredThumbnailHash:deployment.desired.thumbnailHash,
    desiredListing:deployment.desired.listing,
    origin:deployment.desired.origin,
    confirmedPayloadHash:deployment.confirmed.payloadHash,
    confirmedListing:deployment.confirmed.listing,
    confirmedAt:deployment.confirmed.confirmedAt,
    paused:deployment.policy.paused,
    actions:Object.freeze({
      canDeploy:status===DEPLOYMENT_OPERATION_STATUS.PENDING || status===DEPLOYMENT_OPERATION_STATUS.RETRYABLE,
      canReconcile:status===DEPLOYMENT_OPERATION_STATUS.RECONCILE,
      canRetry:status===DEPLOYMENT_OPERATION_STATUS.FAILED || status===DEPLOYMENT_OPERATION_STATUS.CANCELLED,
      canUpdateDesired:!BUSY_STATUSES.includes(status)
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
  async function intentFingerprint(deployment) {
    if(isV1Source(deployment)) return generatorSourceFingerprint(deployment.desired.payloadHash);
    return generatorReleaseFingerprint(deployment.desired);
  }
  async function operationDraft(deployment) {
    return Object.freeze({
      operationId:deployment.operation.operationId,
      providerId:PERCHANCE_PROVIDER_ID,
      action:PERCHANCE_GENERATOR_UPDATE_ACTION,
      targetRef:Object.freeze({kind:DEPLOYER_TARGET_KIND,id:deployment.targetRef.id}),
      intentFingerprint:await intentFingerprint(deployment)
    });
  }
  async function settleOperation(deploymentId, operationId, remoteStatus, {fallbackStatus=null}={}) {
    for(let attempt=0;attempt<8;attempt+=1) {
      const current=await read();
      const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
      if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
      if(existing.operation.operationId!==operationId) return Object.freeze({revision:current.revision,deployment:existing});
      let status; let confirmed=existing.confirmed;
      if(remoteStatus===null) status=fallbackStatus || DEPLOYMENT_OPERATION_STATUS.RECONCILE;
      else if(remoteStatus==="PREPARED") status=DEPLOYMENT_OPERATION_STATUS.PENDING;
      else if(remoteStatus==="UNCERTAIN" || remoteStatus==="DISPATCHING") status=DEPLOYMENT_OPERATION_STATUS.RECONCILE;
      else if(remoteStatus==="RETRYABLE") status=DEPLOYMENT_OPERATION_STATUS.RETRYABLE;
      else if(remoteStatus==="FAILED") status=DEPLOYMENT_OPERATION_STATUS.FAILED;
      else if(remoteStatus==="CANCELLED") status=DEPLOYMENT_OPERATION_STATUS.CANCELLED;
      else if(remoteStatus==="SUCCEEDED") {
        status=DEPLOYMENT_OPERATION_STATUS.SUCCEEDED;
        confirmed=Object.freeze({payloadHash:existing.desired.payloadHash,thumbnailHash:existing.desired.thumbnailHash,
          listing:existing.desired.listing,confirmedAt:isoNow(clock),operationId:existing.operation.operationId,baselineHash:null});
      } else fail(DEPLOYER_ERROR_CODES.REMOTE_STATE);
      const updated=Object.freeze({...existing,confirmed,operation:Object.freeze({...existing.operation,status}),updatedAt:isoNow(clock)});
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
      desired:Object.freeze({revision:1,...draft.intent}),confirmed:EMPTY_CONFIRMED,
      operation:Object.freeze({sequence:1,operationId:operationIdFor(draft.deploymentId,1,1),status:DEPLOYMENT_OPERATION_STATUS.PENDING}),
      policy:Object.freeze({paused:false,pauseReason:null}),
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
  // Desired input: {sourceHash} (accepted v1, a manual single-source intent) or the v2 intent
  // {payloadHash, thumbnailHash, listing, origin}. An unchanged intent is idempotent.
  function desiredFromInput(input,existing) {
    if(hasExactKeys(input,["expectedRevision","expectedDesiredRevision","sourceHash"])) {
      return normalizeDesiredIntent({payloadKind:DEPLOYMENT_PAYLOAD_KINDS.V1_SOURCE,payloadHash:normalizeSourceHash(input.sourceHash),
        thumbnailHash:null,listing:null,origin:{kind:"MANUAL"}});
    }
    if(hasExactKeys(input,["expectedRevision","expectedDesiredRevision","payloadHash","thumbnailHash","listing","origin"])) {
      return normalizeDesiredIntent({payloadKind:DEPLOYMENT_PAYLOAD_KINDS.V2_RELEASE,payloadHash:input.payloadHash,
        thumbnailHash:input.thumbnailHash,listing:input.listing,origin:input.origin});
    }
    fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT);
  }
  async function setDesired(rawDeploymentId,input={}) {
    const deploymentId=normalizeDeploymentId(rawDeploymentId); const expected=revision(input?.expectedRevision);
    const expectedDesired=desiredRevision(input?.expectedDesiredRevision); const intent=desiredFromInput(input); const current=await read();
    if(current.revision!==expected) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
    if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
    if(existing.desired.revision!==expectedDesired) fail(DEPLOYER_ERROR_CODES.INVALID_TRANSITION);
    if(BUSY_STATUSES.includes(existing.operation.status)) fail(DEPLOYER_ERROR_CODES.OPERATION_BUSY);
    if(sameIntent(existing.desired,intent)) return Object.freeze({revision:current.revision,changed:false,deployment:existing});
    const nextDesiredRevision=existing.desired.revision+1;
    const next=Object.freeze({...existing,desired:Object.freeze({revision:nextDesiredRevision,...intent}),
      operation:Object.freeze({sequence:1,operationId:operationIdFor(existing.deploymentId,nextDesiredRevision,1),status:DEPLOYMENT_OPERATION_STATUS.PENDING}),
      updatedAt:isoNow(clock)});
    const saved=await commit(current.revision,replaceDeployment(current,deploymentId,next));
    return Object.freeze({revision:saved.revision,changed:true,deployment:saved.value.deployments.find((item)=>item.deploymentId===deploymentId)});
  }
  // LOCAL: operator pause/resume of one target (04 §E.8.3). Resume never clears a drift pause
  // while drift is current; that decision belongs to the drift actions (P039).
  async function setPaused(rawDeploymentId,{expectedRevision,paused}={}) {
    const deploymentId=normalizeDeploymentId(rawDeploymentId); const expected=revision(expectedRevision);
    if(typeof paused!=="boolean") fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT);
    const current=await read();
    if(current.revision!==expected) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
    if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
    if(existing.policy.paused===paused) return Object.freeze({revision:current.revision,changed:false,deployment:existing});
    const next=Object.freeze({...existing,policy:Object.freeze(paused?{paused:true,pauseReason:"OPERATOR"}:{paused:false,pauseReason:null}),updatedAt:isoNow(clock)});
    const saved=await commit(current.revision,replaceDeployment(current,deploymentId,next));
    return Object.freeze({revision:saved.revision,changed:true,deployment:saved.value.deployments.find((item)=>item.deploymentId===deploymentId)});
  }
  // Persists MIG-P036-deployer-state-v2 when the stored state is still v1. Idempotent.
  async function migrateState() {
    for(let attempt=0;attempt<4;attempt+=1) {
      const current=await read();
      if(!current.migrated) return Object.freeze({revision:current.revision,migrated:false});
      try {
        const saved=await commit(current.revision,current.value);
        return Object.freeze({revision:saved.revision,migrated:true});
      } catch(error) {
        if(error?.code!==DEPLOYER_ERROR_CODES.REVISION_CONFLICT) throw error;
      }
    }
    fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT);
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
  // v1-source: {source}. v2-release: {payload:{code, html, thumbnail}} (thumbnail base64 JPEG or
  // null). Content is hashed here and must equal the desired intent before anything durable.
  async function dispatchInputFor(deployment,input) {
    if(isV1Source(deployment)) {
      if(!hasExactKeys(input,["expectedRevision","source"])) fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT);
      let actualHash; try { actualHash=await sha256Hex(input.source); } catch { fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT); }
      if(actualHash!==deployment.desired.payloadHash) fail(DEPLOYER_ERROR_CODES.SOURCE_MISMATCH);
      return Object.freeze({sourceHash:deployment.desired.payloadHash,source:input.source});
    }
    if(!hasExactKeys(input,["expectedRevision","payload"]) || !hasExactKeys(input.payload,["code","html","thumbnail"])) fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT);
    const {code,html,thumbnail}=input.payload;
    let payloadHash; let thumb=null;
    try {
      payloadHash=await generatorPayloadHash(code,html);
      if(thumbnail!==null) thumb=await thumbnailHash(thumbnail);
    } catch { fail(DEPLOYER_ERROR_CODES.INVALID_ARGUMENT); }
    if(payloadHash!==deployment.desired.payloadHash || thumb!==deployment.desired.thumbnailHash) fail(DEPLOYER_ERROR_CODES.CONTENT_MISMATCH);
    return Object.freeze({payloadHash,thumbnailHash:thumb,listing:deployment.desired.listing,code,html,thumbnail});
  }
  async function deploy(rawDeploymentId,input={}) {
    const expectedRevision=input?.expectedRevision;
    const deploymentId=normalizeDeploymentId(rawDeploymentId); const expected=revision(expectedRevision); const current=await read();
    if(current.revision!==expected) fail(DEPLOYER_ERROR_CODES.REVISION_CONFLICT,{currentRevision:current.revision});
    const existing=current.value.deployments.find((item)=>item.deploymentId===deploymentId);
    if(!existing) fail(DEPLOYER_ERROR_CODES.NOT_FOUND);
    const previousStatus=existing.operation.status;
    if(![DEPLOYMENT_OPERATION_STATUS.PENDING,DEPLOYMENT_OPERATION_STATUS.RETRYABLE].includes(previousStatus)) fail(DEPLOYER_ERROR_CODES.INVALID_TRANSITION);
    await requireAccount(existing.accountId);
    const gate=await gateFor(existing.accountId);
    const dispatchInput=await dispatchInputFor(existing,input);
    const operation=await operationDraft(existing);
    const active=Object.freeze({...existing,operation:Object.freeze({...existing.operation,status:DEPLOYMENT_OPERATION_STATUS.ACTIVE}),updatedAt:isoNow(clock)});
    const activeState=await commit(current.revision,replaceDeployment(current,deploymentId,active));
    const activeDeployment=activeState.value.deployments.find((item)=>item.deploymentId===deploymentId);
    let result;
    try {
      result=await gate.mutate(Object.freeze({operation,dispatchInput}));
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
  return Object.freeze({createDeployment,getDeployment,listDeployments,listDeploymentViews,setDesired,setPaused,prepareRetry,deploy,reconcileDeployment,migrateState});
}
export { DEPLOYMENT_OPERATION_STATUS };
