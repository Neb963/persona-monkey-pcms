import { SECRET_ERROR_CODES, normalizeSecretError, secretError } from "./errors.js";
import { assertSecretRef, createSecretRef, secretRefDiagnostic } from "./secret-ref.js";
import { assertSecretValue } from "./protocol.js";

export function createSecretStore({
  backend,
  randomUUID = () => globalThis.crypto?.randomUUID?.()
} = {}) {
  if (!backend
      || typeof backend.put !== "function"
      || typeof backend.get !== "function"
      || typeof backend.delete !== "function"
      || typeof backend.probe !== "function") {
    throw secretError(SECRET_ERROR_CODES.UNAVAILABLE);
  }

  let closed = false;

  function ensureOpen() {
    if (closed) throw secretError(SECRET_ERROR_CODES.CLOSED);
  }

  async function safe(operation) {
    ensureOpen();
    try {
      return await operation();
    } catch (error) {
      throw normalizeSecretError(error);
    }
  }

  return Object.freeze({
    async probe() {
      return safe(async () => {
        const result = await backend.probe();
        return Object.freeze({ ready: result?.ready === true, backend: backend.kind || "secret-backend" });
      });
    },

    async create(value) {
      ensureOpen();
      const secret = assertSecretValue(value);
      const ref = createSecretRef({ randomUUID });
      await safe(() => backend.put(ref, secret));
      return ref;
    },

    async replace(secretRef, value) {
      const ref = assertSecretRef(secretRef);
      const secret = assertSecretValue(value);
      await safe(() => backend.put(ref, secret));
      return ref;
    },

    async resolveForPrivilegedUse(secretRef) {
      const ref = assertSecretRef(secretRef);
      return safe(async () => assertSecretValue(await backend.get(ref)));
    },

    async delete(secretRef) {
      const ref = assertSecretRef(secretRef);
      return safe(async () => {
        const result = await backend.delete(ref);
        return Object.freeze({ deleted: result?.deleted === true });
      });
    },

    describeRef(secretRef) {
      ensureOpen();
      return Object.freeze({ ref: secretRefDiagnostic(secretRef) });
    },

    close() {
      if (closed) return;
      closed = true;
      backend.close?.();
    }
  });
}
