import { BACKUP_ERROR_CODES, backupError } from "./errors.js";

export const PCMS_BACKUP_SCHEMA_VERSION = 1;
export const PCMS_BACKUP_KIND = "pcms-backup";
export const PCMS_STAGED_RESTORE_KIND = "pcms-staged-restore";
export const PCMS_BACKUP_MAX_RECORDS = 10000;
export const PCMS_BACKUP_EXCLUDED_NAMESPACES = Object.freeze(["core.backups", "core.recovery"]);

const BACKUP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function fail(code = BACKUP_ERROR_CODES.INVALID_ARGUMENT) {
  throw backupError(code);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function exact(value, names, code) {
  if (!plain(value) || Object.getOwnPropertySymbols(value).length) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== names.length
      || !names.every((name) => Object.hasOwn(descriptors, name)
        && descriptors[name].enumerable
        && Object.hasOwn(descriptors[name], "value"))) {
    fail(code);
  }
  return descriptors;
}

export function normalizeBackupId(value, code = BACKUP_ERROR_CODES.INVALID_ARGUMENT) {
  if (typeof value !== "string" || !BACKUP_ID_PATTERN.test(value)) fail(code);
  return value;
}

export function normalizeBackupTimestamp(value, code = BACKUP_ERROR_CODES.CORRUPT_BACKUP) {
  if (typeof value !== "string" || value.length < 1 || value.length > 64 || Number.isNaN(Date.parse(value))) fail(code);
  return new Date(value).toISOString();
}

export function normalizeBackupDigest(value, code = BACKUP_ERROR_CODES.CORRUPT_BACKUP) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) fail(code);
  return value;
}

export function normalizeBackupEnvelope(raw, validateRecords) {
  if (typeof validateRecords !== "function") throw new TypeError("Backup validation requires storage record validation");
  const d = exact(raw, ["schemaVersion","kind","backupId","createdAt","recordCount","records","sha256"], BACKUP_ERROR_CODES.CORRUPT_BACKUP);
  if (d.schemaVersion.value !== PCMS_BACKUP_SCHEMA_VERSION || d.kind.value !== PCMS_BACKUP_KIND) fail(BACKUP_ERROR_CODES.CORRUPT_BACKUP);
  const backupId = normalizeBackupId(d.backupId.value, BACKUP_ERROR_CODES.CORRUPT_BACKUP);
  const createdAt = normalizeBackupTimestamp(d.createdAt.value);
  if (!Number.isSafeInteger(d.recordCount.value) || d.recordCount.value < 0 || d.recordCount.value > PCMS_BACKUP_MAX_RECORDS) fail(BACKUP_ERROR_CODES.CORRUPT_BACKUP);
  let records;
  try { records = validateRecords(d.records.value); } catch { fail(BACKUP_ERROR_CODES.CORRUPT_BACKUP); }
  if (records.length !== d.recordCount.value || records.length > PCMS_BACKUP_MAX_RECORDS) fail(BACKUP_ERROR_CODES.CORRUPT_BACKUP);
  if (records.some((record) => PCMS_BACKUP_EXCLUDED_NAMESPACES.includes(record.namespace))) fail(BACKUP_ERROR_CODES.CORRUPT_BACKUP);
  return Object.freeze({
    schemaVersion:PCMS_BACKUP_SCHEMA_VERSION,
    kind:PCMS_BACKUP_KIND,
    backupId,
    createdAt,
    recordCount:records.length,
    records,
    sha256:normalizeBackupDigest(d.sha256.value)
  });
}

export function normalizeStagedRestore(raw, normalizeBackup) {
  if (typeof normalizeBackup !== "function") throw new TypeError("Staged restore requires backup normalization");
  const d=exact(raw,["schemaVersion","kind","stagedAt","backup"],BACKUP_ERROR_CODES.RESTORE_STATE);
  if(d.schemaVersion.value!==PCMS_BACKUP_SCHEMA_VERSION || d.kind.value!==PCMS_STAGED_RESTORE_KIND) fail(BACKUP_ERROR_CODES.RESTORE_STATE);
  return Object.freeze({
    schemaVersion:PCMS_BACKUP_SCHEMA_VERSION,
    kind:PCMS_STAGED_RESTORE_KIND,
    stagedAt:normalizeBackupTimestamp(d.stagedAt.value,BACKUP_ERROR_CODES.RESTORE_STATE),
    backup:normalizeBackup(d.backup.value)
  });
}

export function backupDigestPayload(backup) {
  return Object.freeze({
    schemaVersion:backup.schemaVersion,
    kind:backup.kind,
    backupId:backup.backupId,
    createdAt:backup.createdAt,
    recordCount:backup.recordCount,
    records:backup.records
  });
}
