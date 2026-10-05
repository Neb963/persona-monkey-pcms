import { PERCHANCE_PROVIDER_ERROR_CODES, perchanceProviderError } from "./errors.js";

export const PERCHANCE_PROVIDER_ID = "perchance";
export const PERCHANCE_DRIVER_CONTRACT_ID = "pcms.perchance.driver";
export const PERCHANCE_DRIVER_CONTRACT_VERSION = 1;
export const PERCHANCE_GENERATOR_UPDATE_ACTION = "generator.update";
export const PERCHANCE_GENERATOR_TARGET_KIND = "generator";
export const PERCHANCE_MAX_SOURCE_BYTES = 4 * 1024 * 1024;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OUTCOMES = new Set(["APPLIED", "NOT_APPLIED", "UNKNOWN"]);
const TEXT_ENCODER = new TextEncoder();

function fail(code = PERCHANCE_PROVIDER_ERROR_CODES.INVALID_ARGUMENT) {
  throw perchanceProviderError(code);
}
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
function boundedId(value, code = PERCHANCE_PROVIDER_ERROR_CODES.INVALID_ARGUMENT) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) fail(code);
  return value;
}

export function generatorSourceFingerprint(sourceHash) {
  if (typeof sourceHash !== "string" || !SHA256_PATTERN.test(sourceHash)) fail();
  return "perchance:generator-source:v1:" + sourceHash;
}

export function normalizePerchanceCompatibility(raw) {
  exact(raw, ["contractId", "contractVersion", "providerId", "operations"], PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  const operations = raw.operations;
  if (!Array.isArray(operations)
      || Object.getPrototypeOf(operations) !== Array.prototype
      || Object.getOwnPropertySymbols(operations).length
      || Object.keys(Object.getOwnPropertyDescriptors(operations)).some((key) => key !== "length" && key !== "0")
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(operations, "0") || {}, "value")
      || raw.contractId !== PERCHANCE_DRIVER_CONTRACT_ID
      || raw.contractVersion !== PERCHANCE_DRIVER_CONTRACT_VERSION
      || raw.providerId !== PERCHANCE_PROVIDER_ID
      || operations.length !== 1
      || operations[0] !== PERCHANCE_GENERATOR_UPDATE_ACTION) {
    fail(PERCHANCE_PROVIDER_ERROR_CODES.INCOMPATIBLE);
  }
  return Object.freeze({
    contractId: raw.contractId,
    contractVersion: raw.contractVersion,
    providerId: raw.providerId,
    operations: Object.freeze([...raw.operations])
  });
}

export function normalizePerchanceOperation(operation) {
  exact(operation, ["schemaVersion","kind","operationId","providerId","action","targetRef","intentFingerprint","state","attempt","createdAt","updatedAt","lastDispatchAt","resolvedAt","resolution"], PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  if (operation.providerId !== PERCHANCE_PROVIDER_ID || operation.action !== PERCHANCE_GENERATOR_UPDATE_ACTION) fail(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  boundedId(operation.operationId, PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  exact(operation.targetRef, ["kind","id"], PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  if (operation.targetRef.kind !== PERCHANCE_GENERATOR_TARGET_KIND) fail(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  boundedId(operation.targetRef.id, PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  if (typeof operation.intentFingerprint !== "string" || !operation.intentFingerprint.startsWith("perchance:generator-source:v1:")) {
    fail(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  }
  const sourceHash = operation.intentFingerprint.slice("perchance:generator-source:v1:".length);
  if (!SHA256_PATTERN.test(sourceHash)) fail(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  return Object.freeze({ operationId:operation.operationId, generatorId:operation.targetRef.id, sourceHash, state:operation.state });
}

export function normalizeGeneratorUpdateInput(input, operation) {
  exact(input, ["sourceHash", "source"], PERCHANCE_PROVIDER_ERROR_CODES.INVALID_ARGUMENT);
  const op = normalizePerchanceOperation(operation);
  if (typeof input.sourceHash !== "string" || !SHA256_PATTERN.test(input.sourceHash) || input.sourceHash !== op.sourceHash) fail();
  if (typeof input.source !== "string" || TEXT_ENCODER.encode(input.source).byteLength > PERCHANCE_MAX_SOURCE_BYTES) fail();
  return Object.freeze({ sourceHash:input.sourceHash, source:input.source });
}

export function normalizePerchanceOutcome(raw, { reconciliation = false } = {}) {
  exact(raw, ["status"], PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  if (!OUTCOMES.has(raw.status) || (!reconciliation && raw.status === "UNKNOWN")) fail(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  return Object.freeze({ status: raw.status });
}

export async function sha256Hex(source) {
  if (typeof source !== "string") fail();
  const bytes = TEXT_ENCODER.encode(source);
  if (bytes.byteLength > PERCHANCE_MAX_SOURCE_BYTES) fail();
  if (!globalThis.crypto?.subtle?.digest) fail(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
  let digest;
  try { digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)); }
  catch { fail(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL); }
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeDriver(driver) {
  if (!plain(driver) || Object.getOwnPropertySymbols(driver).length) {
    throw new TypeError("Perchance driver must expose only probe(), updateGenerator(), and reconcileGeneratorUpdate()");
  }
  const descriptors = Object.getOwnPropertyDescriptors(driver);
  const names = ["probe","updateGenerator","reconcileGeneratorUpdate"];
  if (Object.keys(descriptors).length !== names.length
      || !names.every((name) => Object.hasOwn(descriptors, name)
        && descriptors[name].enumerable
        && Object.hasOwn(descriptors[name], "value")
        && typeof descriptors[name].value === "function")) {
    throw new TypeError("Perchance driver must expose only probe(), updateGenerator(), and reconcileGeneratorUpdate()");
  }
  return driver;
}
