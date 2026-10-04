export const SECRET_ERROR_CODES = Object.freeze({
  INVALID_REF: "PCMS_SECRET_INVALID_REF",
  INVALID_VALUE: "PCMS_SECRET_INVALID_VALUE",
  NOT_FOUND: "PCMS_SECRET_NOT_FOUND",
  UNAVAILABLE: "PCMS_SECRET_UNAVAILABLE",
  TIMEOUT: "PCMS_SECRET_TIMEOUT",
  PROTOCOL: "PCMS_SECRET_PROTOCOL",
  CLOSED: "PCMS_SECRET_CLOSED"
});

const SAFE_MESSAGES = Object.freeze({
  [SECRET_ERROR_CODES.INVALID_REF]: "Secret reference is invalid",
  [SECRET_ERROR_CODES.INVALID_VALUE]: "Secret value is invalid",
  [SECRET_ERROR_CODES.NOT_FOUND]: "Secret reference was not found",
  [SECRET_ERROR_CODES.UNAVAILABLE]: "Secret backend is unavailable",
  [SECRET_ERROR_CODES.TIMEOUT]: "Secret backend request timed out",
  [SECRET_ERROR_CODES.PROTOCOL]: "Secret backend protocol failed",
  [SECRET_ERROR_CODES.CLOSED]: "Secret store is closed"
});

export class PcmsSecretError extends Error {
  constructor(code) {
    super(SAFE_MESSAGES[code] || "Secret operation failed");
    this.name = "PcmsSecretError";
    this.code = code;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

export function secretError(code) {
  return new PcmsSecretError(code);
}

export function normalizeSecretError(error, fallback = SECRET_ERROR_CODES.UNAVAILABLE) {
  if (error instanceof PcmsSecretError) return error;
  return secretError(fallback);
}
