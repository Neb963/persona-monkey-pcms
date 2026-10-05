import {
  PERCHANCE_DRIVER_CONTRACT_ID,
  PERCHANCE_DRIVER_CONTRACT_VERSION,
  PERCHANCE_GENERATOR_UPDATE_ACTION,
  PERCHANCE_PROVIDER_ID
} from "./contract.js";

function clone(value) { return structuredClone(value); }

export function createPerchanceEmulator() {
  const generators = new Map();
  const receipts = new Map();
  let compatible = true;
  let nextFault = null;

  function probe() {
    if (!compatible) {
      return Promise.resolve({ contractId:PERCHANCE_DRIVER_CONTRACT_ID, contractVersion:999, providerId:PERCHANCE_PROVIDER_ID, operations:[PERCHANCE_GENERATOR_UPDATE_ACTION] });
    }
    return Promise.resolve({ contractId:PERCHANCE_DRIVER_CONTRACT_ID, contractVersion:PERCHANCE_DRIVER_CONTRACT_VERSION, providerId:PERCHANCE_PROVIDER_ID, operations:[PERCHANCE_GENERATOR_UPDATE_ACTION] });
  }

  async function updateGenerator(input) {
    const fault = nextFault; nextFault = null;
    if (fault === "before-apply") {
      receipts.set(input.operationId, { status:"NOT_APPLIED", generatorId:input.generatorId, sourceHash:input.sourceHash });
      throw new Error("emulated pre-apply transport loss");
    }
    generators.set(input.generatorId, { generatorId:input.generatorId, sourceHash:input.sourceHash, source:input.source });
    receipts.set(input.operationId, { status:"APPLIED", generatorId:input.generatorId, sourceHash:input.sourceHash });
    if (fault === "after-apply") throw new Error("emulated post-apply transport loss");
    if (fault === "malformed") return { status:"APPLIED", extra:true };
    return { status:"APPLIED" };
  }

  async function reconcileGeneratorUpdate(input) {
    const receipt = receipts.get(input.operationId);
    if (!receipt) return { status:"UNKNOWN" };
    if (receipt.generatorId !== input.generatorId || receipt.sourceHash !== input.sourceHash) return { status:"UNKNOWN" };
    return { status: receipt.status };
  }

  return Object.freeze({
    driver: Object.freeze({ probe, updateGenerator, reconcileGeneratorUpdate }),
    seedGenerator({ generatorId, sourceHash, source = "" }) {
      generators.set(generatorId, { generatorId, sourceHash, source });
    },
    getGenerator(generatorId) {
      const item=generators.get(generatorId);
      return item ? clone(item) : null;
    },
    setCompatible(value) { compatible = value === true; },
    failNext(mode) {
      if (!["before-apply","after-apply","malformed"].includes(mode)) throw new TypeError("Unknown emulator fault");
      nextFault = mode;
    },
    clearReceipts() { receipts.clear(); }
  });
}
