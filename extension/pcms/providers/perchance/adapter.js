import {
  PERCHANCE_GENERATOR_UPDATE_ACTION,
  PERCHANCE_PROVIDER_ID,
  normalizeDriver,
  normalizeGeneratorUpdateInput,
  normalizePerchanceCompatibility,
  normalizePerchanceOperation,
  normalizePerchanceOutcome,
  sha256Hex
} from "./contract.js";
import { PERCHANCE_PROVIDER_ERROR_CODES, perchanceProviderError } from "./errors.js";

export function createPerchanceProviderAdapter({ driver } = {}) {
  const transport = normalizeDriver(driver);

  async function probeCompatibility() {
    let raw;
    try { raw = await transport.probe(); }
    catch { throw perchanceProviderError(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL); }
    return normalizePerchanceCompatibility(raw);
  }

  async function compatibleCall(fn) {
    await probeCompatibility();
    try { return await fn(); }
    catch (error) {
      if (error?.name === "PcmsPerchanceProviderError") throw error;
      throw perchanceProviderError(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
    }
  }

  async function dispatch({ operation, dispatchInput } = {}) {
    const op = normalizePerchanceOperation(operation);
    if (op.state !== "DISPATCHING") throw perchanceProviderError(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
    const input = normalizeGeneratorUpdateInput(dispatchInput, operation);
    if (await sha256Hex(input.source) !== input.sourceHash) throw perchanceProviderError(PERCHANCE_PROVIDER_ERROR_CODES.INVALID_ARGUMENT);
    return compatibleCall(async () => normalizePerchanceOutcome(await transport.updateGenerator(Object.freeze({
      operationId: op.operationId,
      generatorId: op.generatorId,
      sourceHash: op.sourceHash,
      source: input.source
    }))));
  }

  async function reconcile({ operation } = {}) {
    const op = normalizePerchanceOperation(operation);
    if (op.state !== "UNCERTAIN") throw perchanceProviderError(PERCHANCE_PROVIDER_ERROR_CODES.PROTOCOL);
    return compatibleCall(async () => normalizePerchanceOutcome(await transport.reconcileGeneratorUpdate(Object.freeze({
      operationId: op.operationId,
      generatorId: op.generatorId,
      sourceHash: op.sourceHash
    })), { reconciliation:true }));
  }

  const providerDescriptor = Object.freeze({
    operations: Object.freeze({
      [PERCHANCE_GENERATOR_UPDATE_ACTION]: Object.freeze({ dispatch, reconcile })
    })
  });

  return Object.freeze({
    providerId: PERCHANCE_PROVIDER_ID,
    probeCompatibility,
    providerDescriptor
  });
}
