export const BACKUP_ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: "PCMS_BACKUP_INVALID_ARGUMENT",
  CORRUPT_BACKUP: "PCMS_BACKUP_CORRUPT_BACKUP",
  INTEGRITY_MISMATCH: "PCMS_BACKUP_INTEGRITY_MISMATCH",
  RESTORE_STATE: "PCMS_BACKUP_RESTORE_STATE",
  RECONCILIATION_INCOMPLETE: "PCMS_BACKUP_RECONCILIATION_INCOMPLETE",
  CAPACITY: "PCMS_BACKUP_CAPACITY"
});

const MESSAGES = Object.freeze({
  [BACKUP_ERROR_CODES.INVALID_ARGUMENT]: "Backup or restore argument is invalid",
  [BACKUP_ERROR_CODES.CORRUPT_BACKUP]: "Backup payload is corrupt",
  [BACKUP_ERROR_CODES.INTEGRITY_MISMATCH]: "Backup integrity check failed",
  [BACKUP_ERROR_CODES.RESTORE_STATE]: "Restore state is invalid",
  [BACKUP_ERROR_CODES.RECONCILIATION_INCOMPLETE]: "Restore reconciliation is incomplete",
  [BACKUP_ERROR_CODES.CAPACITY]: "Backup capacity was exceeded"
});

export class PcmsBackupError extends Error {
  constructor(code) {
    super(MESSAGES[code] || MESSAGES[BACKUP_ERROR_CODES.CORRUPT_BACKUP]);
    this.name = "PcmsBackupError";
    this.code = code;
  }
}

export function backupError(code) {
  return new PcmsBackupError(code);
}
