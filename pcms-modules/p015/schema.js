import { DEPLOYER_ERROR_CODES, deployerError } from "./errors.js";

export const DEPLOYER_SCHEMA_VERSION = 1;
export const DEPLOYER_PROVIDER_ID = "perchance";
export const DEPLOYER_TARGET_KIND = "generator";
export const DEPLOYER_STATE_KIND = "deployer-state";
export const DEPLOYMENT_KIND = "deployment";
export const DEPLOYER_MAX_DEPLOYMENTS = 4096;

export const DEPLOYMENT_OPERATION_STATUS = Object.freeze({
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  RECONCILE: "RECONCILE",
  RETRYABLE: "RETRYABLE",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  SUCCEEDED: "SUCCEEDED"
});

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const DEPLOYMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STATUS_SET = new Set(Object.values(DEPLOYMENT_OPERATION_STATUS));

function fail(code = DEPLOYER_ERROR_CODES.INVALID_ARGUMENT) { throw deployerError(code); }
function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function exact(value, names, code) {
  if (!plain(value) || Object.getOwnPropertySymbols(value).length) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== names.length || !names.every((name) => Object.hasOwn(descriptors, name))) fail(code);
  for (const descriptor of Object.values(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail(code);
  }
}
function denseArray(value, code) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail(code);
  }
  const allowed = new Set(["length", ...Array.from({ length:value.length }, (_, index) => String(index))]);
  if (Object.keys(descriptors).some((key) => !allowed.has(key))) fail(code);
}
function boundedId(value, pattern = ID_PATTERN, code = DEPLOYER_ERROR_CODES.INVALID_ARGUMENT) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}
export function normalizeDeploymentId(value, code = DEPLOYER_ERROR_CODES.INVALID_ARGUMENT) {
  return boundedId(value, DEPLOYMENT_ID_PATTERN, code);
}
export function normalizeAccountId(value, code = DEPLOYER_ERROR_CODES.INVALID_ARGUMENT) {
  return boundedId(value, ID_PATTERN, code);
}
export function normalizeGeneratorId(value, code = DEPLOYER_ERROR_CODES.INVALID_ARGUMENT) {
  return boundedId(value, ID_PATTERN, code);
}
export function normalizeSourceHash(value, code = DEPLOYER_ERROR_CODES.INVALID_ARGUMENT) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) fail(code);
  return value;
}
export function normalizeTimestamp(value, code = DEPLOYER_ERROR_CODES.CORRUPT_STATE) {
  if (typeof value !== "string" || value.length < 1 || value.length > 64 || Number.isNaN(Date.parse(value))) fail(code);
  return value;
}
export function operationIdFor(deploymentId, desiredRevision, sequence) {
  const id = normalizeDeploymentId(deploymentId);
  if (!Number.isSafeInteger(desiredRevision) || desiredRevision < 1 || !Number.isSafeInteger(sequence) || sequence < 1) fail();
  const operationId = "deploy:" + id + ":" + desiredRevision + ":" + sequence;
  if (!ID_PATTERN.test(operationId)) fail();
  return operationId;
}
export function normalizeDeploymentCreateInput(value) {
  exact(value, ["deploymentId","accountId","generatorId","sourceHash"], DEPLOYER_ERROR_CODES.INVALID_ARGUMENT);
  return Object.freeze({
    deploymentId:normalizeDeploymentId(value.deploymentId),
    accountId:normalizeAccountId(value.accountId),
    generatorId:normalizeGeneratorId(value.generatorId),
    sourceHash:normalizeSourceHash(value.sourceHash)
  });
}
export function normalizeDeploymentRecord(value) {
  exact(value, ["schemaVersion","kind","deploymentId","providerId","accountId","targetRef","desired","observed","operation","createdAt","updatedAt"], DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  if (value.schemaVersion !== DEPLOYER_SCHEMA_VERSION || value.kind !== DEPLOYMENT_KIND || value.providerId !== DEPLOYER_PROVIDER_ID) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const deploymentId = normalizeDeploymentId(value.deploymentId, DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const accountId = normalizeAccountId(value.accountId, DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  exact(value.targetRef, ["kind","id"], DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  if (value.targetRef.kind !== DEPLOYER_TARGET_KIND) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const generatorId = normalizeGeneratorId(value.targetRef.id, DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  exact(value.desired, ["revision","sourceHash"], DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  if (!Number.isSafeInteger(value.desired.revision) || value.desired.revision < 1) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const desiredHash = normalizeSourceHash(value.desired.sourceHash, DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  exact(value.observed, ["sourceHash","confirmedAt"], DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const observedNull = value.observed.sourceHash === null && value.observed.confirmedAt === null;
  const observedSet = value.observed.sourceHash !== null && value.observed.confirmedAt !== null;
  if (!observedNull && !observedSet) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const observedHash = observedNull ? null : normalizeSourceHash(value.observed.sourceHash, DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const confirmedAt = observedNull ? null : normalizeTimestamp(value.observed.confirmedAt);
  exact(value.operation, ["sequence","operationId","status"], DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  if (!Number.isSafeInteger(value.operation.sequence) || value.operation.sequence < 1 || !STATUS_SET.has(value.operation.status)) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const expectedOperationId = operationIdFor(deploymentId, value.desired.revision, value.operation.sequence);
  if (value.operation.operationId !== expectedOperationId) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  if (value.operation.status === DEPLOYMENT_OPERATION_STATUS.SUCCEEDED && (observedHash !== desiredHash || confirmedAt === null)) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  return Object.freeze({
    schemaVersion:DEPLOYER_SCHEMA_VERSION,
    kind:DEPLOYMENT_KIND,
    deploymentId,
    providerId:DEPLOYER_PROVIDER_ID,
    accountId,
    targetRef:Object.freeze({kind:DEPLOYER_TARGET_KIND,id:generatorId}),
    desired:Object.freeze({revision:value.desired.revision,sourceHash:desiredHash}),
    observed:Object.freeze({sourceHash:observedHash,confirmedAt}),
    operation:Object.freeze({sequence:value.operation.sequence,operationId:expectedOperationId,status:value.operation.status}),
    createdAt:normalizeTimestamp(value.createdAt),
    updatedAt:normalizeTimestamp(value.updatedAt)
  });
}
export function emptyDeployerState() {
  return Object.freeze({schemaVersion:DEPLOYER_SCHEMA_VERSION,kind:DEPLOYER_STATE_KIND,deployments:Object.freeze([])});
}
export function normalizeDeployerState(value) {
  exact(value, ["schemaVersion","kind","deployments"], DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  if (value.schemaVersion !== DEPLOYER_SCHEMA_VERSION || value.kind !== DEPLOYER_STATE_KIND) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  denseArray(value.deployments, DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  if (value.deployments.length > DEPLOYER_MAX_DEPLOYMENTS) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
  const deployments=[]; const ids=new Set(); const targets=new Set(); let previous=null;
  for (const raw of value.deployments) {
    const deployment=normalizeDeploymentRecord(raw);
    if (ids.has(deployment.deploymentId) || targets.has(deployment.targetRef.id)) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
    if (previous !== null && previous.localeCompare(deployment.deploymentId) >= 0) fail(DEPLOYER_ERROR_CODES.CORRUPT_STATE);
    ids.add(deployment.deploymentId); targets.add(deployment.targetRef.id); deployments.push(deployment); previous=deployment.deploymentId;
  }
  return Object.freeze({schemaVersion:DEPLOYER_SCHEMA_VERSION,kind:DEPLOYER_STATE_KIND,deployments:Object.freeze(deployments)});
}
export function makeDeployerState(deployments) {
  if (!Array.isArray(deployments)) fail();
  const normalized=deployments.map((deployment)=>normalizeDeploymentRecord(deployment));
  normalized.sort((left,right)=>left.deploymentId.localeCompare(right.deploymentId));
  return normalizeDeployerState({schemaVersion:DEPLOYER_SCHEMA_VERSION,kind:DEPLOYER_STATE_KIND,deployments:normalized});
}
