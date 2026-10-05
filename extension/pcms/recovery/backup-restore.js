import { BACKUP_ERROR_CODES, backupError } from "./errors.js";
import {
  PCMS_BACKUP_EXCLUDED_NAMESPACES,
  PCMS_BACKUP_KIND,
  PCMS_BACKUP_MAX_RECORDS,
  PCMS_BACKUP_SCHEMA_VERSION,
  PCMS_STAGED_RESTORE_KIND,
  backupDigestPayload,
  normalizeBackupEnvelope,
  normalizeBackupId,
  normalizeStagedRestore
} from "./schema.js";
import { planBackupRetention } from "./retention.js";

function fail(code) { throw backupError(code); }

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype || proto===null;
}

function snapshotMethods(value,names,label) {
  if(!plain(value)||Object.getOwnPropertySymbols(value).length) throw new TypeError(label+" is invalid");
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(!names.every((name)=>Object.hasOwn(descriptors,name)
      &&descriptors[name].enumerable
      &&Object.hasOwn(descriptors[name],"value")
      &&typeof descriptors[name].value==="function")) throw new TypeError(label+" is invalid");
  return Object.freeze(Object.fromEntries(names.map((name)=>[name,descriptors[name].value])));
}

function isoNow(clock) {
  let value;
  try { value=new Date(clock()).toISOString(); }
  catch { fail(BACKUP_ERROR_CODES.INVALID_ARGUMENT); }
  return value;
}

async function defaultSha256Hex(text) {
  if(typeof text!=="string"||!globalThis.crypto?.subtle?.digest) fail(BACKUP_ERROR_CODES.INTEGRITY_MISMATCH);
  const bytes=new TextEncoder().encode(text);
  let digest;
  try { digest=new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes)); }
  catch { fail(BACKUP_ERROR_CODES.INTEGRITY_MISMATCH); }
  return [...digest].map((byte)=>byte.toString(16).padStart(2,"0")).join("");
}

function stateOf(record) {
  return record?.value?.state;
}

export function createBackupRestoreService({
  storageBroker,
  recoveryHold,
  remoteOps,
  providerGate,
  moduleRuntime,
  reconciliationChecks,
  clock=()=>new Date().toISOString(),
  sha256Hex=defaultSha256Hex
}={}) {
  if(!storageBroker?.admin) throw new TypeError("Backup service requires privileged PCMS storage administration");
  const storage=snapshotMethods(storageBroker.admin,["snapshotRecords","validateRecords","replaceAllRecords"],"Storage administration");
  const hold=snapshotMethods(recoveryHold,["getStatus","enterRecoveryHold","releaseRecoveryHold"],"Recovery hold");
  const ops=snapshotMethods(remoteOps,["listUnresolved","recoverInterruptedDispatches","cancel"],"RemoteOps");
  const gate=snapshotMethods(providerGate,["reconcile"],"ProviderGate");
  const runtime=snapshotMethods(moduleRuntime,["listStates","prepareUpdate","recoverAll"],"Module runtime");
  const checks=snapshotMethods(reconciliationChecks,["personaBindings","providerCapabilities"],"Recovery reconciliation checks");
  if(typeof clock!=="function"||typeof sha256Hex!=="function") throw new TypeError("Backup service clock/hash is invalid");

  async function digestPayload(payload) {
    const digest=await sha256Hex(JSON.stringify(payload));
    if(typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest)) fail(BACKUP_ERROR_CODES.INTEGRITY_MISMATCH);
    return digest;
  }

  async function normalizeAndVerifyBackup(raw) {
    const normalized=normalizeBackupEnvelope(raw,storage.validateRecords);
    const actual=await digestPayload(backupDigestPayload(normalized));
    if(actual!==normalized.sha256) fail(BACKUP_ERROR_CODES.INTEGRITY_MISMATCH);
    return normalized;
  }

  async function createBackup({backupId}={}) {
    const id=normalizeBackupId(backupId);
    const all=await storage.snapshotRecords();
    const records=storage.validateRecords(all.filter((record)=>!PCMS_BACKUP_EXCLUDED_NAMESPACES.includes(record.namespace)));
    if(records.length>PCMS_BACKUP_MAX_RECORDS) fail(BACKUP_ERROR_CODES.CAPACITY);
    const payload=Object.freeze({
      schemaVersion:PCMS_BACKUP_SCHEMA_VERSION,
      kind:PCMS_BACKUP_KIND,
      backupId:id,
      createdAt:isoNow(clock),
      recordCount:records.length,
      records
    });
    const sha256=await digestPayload(payload);
    return Object.freeze({...payload,sha256});
  }

  async function stageRestore(rawBackup) {
    const backup=await normalizeAndVerifyBackup(rawBackup);
    return Object.freeze({
      schemaVersion:PCMS_BACKUP_SCHEMA_VERSION,
      kind:PCMS_STAGED_RESTORE_KIND,
      stagedAt:isoNow(clock),
      backup
    });
  }

  async function normalizeStage(rawStage) {
    return normalizeStagedRestore(rawStage,(backup)=>{
      const normalized=normalizeBackupEnvelope(backup,storage.validateRecords);
      return normalized;
    });
  }

  async function verifyStage(rawStage) {
    const stage=await normalizeStage(rawStage);
    const backup=await normalizeAndVerifyBackup(stage.backup);
    return Object.freeze({...stage,backup});
  }

  async function quiesceRuntimes() {
    const states=await runtime.listStates();
    if(!Array.isArray(states)) fail(BACKUP_ERROR_CODES.RESTORE_STATE);
    const quiesced=[];
    for(const row of states) {
      const state=stateOf(row);
      if(state==="ACTIVE"||state==="DRAINING") {
        await runtime.prepareUpdate(row.moduleId,{expectedRevision:row.revision});
        quiesced.push(row.moduleId);
      } else if(state!=="IDLE"&&state!=="DISABLED") {
        fail(BACKUP_ERROR_CODES.RESTORE_STATE);
      }
    }
    return Object.freeze(quiesced.sort());
  }

  async function applyStagedRestore(rawStage) {
    const stage=await verifyStage(rawStage);
    const entered=await hold.enterRecoveryHold({reason:"restore:"+stage.backup.backupId});
    if(stateOf(entered?.hold)!=="RECOVERY_HOLD") fail(BACKUP_ERROR_CODES.RESTORE_STATE);

    const quiescedModuleIds=await quiesceRuntimes();
    const current=await storage.snapshotRecords();
    const preserved=current.filter((record)=>PCMS_BACKUP_EXCLUDED_NAMESPACES.includes(record.namespace));
    const replacement=storage.validateRecords([...stage.backup.records,...preserved]);
    await storage.replaceAllRecords(replacement);

    const recoveredModuleIds=await runtime.recoverAll();
    const recoveredOperationIds=await ops.recoverInterruptedDispatches();
    const currentHold=await hold.getStatus();
    if(stateOf(currentHold)!=="RECOVERY_HOLD") fail(BACKUP_ERROR_CODES.RESTORE_STATE);

    return Object.freeze({
      backupId:stage.backup.backupId,
      holdRevision:currentHold.revision,
      quiescedModuleIds:Object.freeze([...quiescedModuleIds]),
      recoveredModuleIds:Object.freeze([...recoveredModuleIds]),
      recoveredOperationIds:Object.freeze([...recoveredOperationIds])
    });
  }

  async function reconcileRemoteOperations() {
    await ops.recoverInterruptedDispatches();
    const before=await ops.listUnresolved();
    for(const row of before) {
      const id=row?.value?.operationId;
      const state=stateOf(row);
      if(typeof id!=="string") fail(BACKUP_ERROR_CODES.RESTORE_STATE);
      if(state==="PREPARED"||state==="RETRYABLE") {
        await ops.cancel(id,{expectedRevision:row.revision});
        continue;
      }
      if(state==="UNCERTAIN") {
        try {
          const reconciled=await gate.reconcile(id);
          if(stateOf(reconciled)==="RETRYABLE") {
            await ops.cancel(id,{expectedRevision:reconciled.revision});
          }
        } catch {}
      }
    }
    return ops.listUnresolved();
  }

  async function safeBooleanCheck(fn) {
    try { return (await fn())===true; }
    catch { return false; }
  }

  async function reconcileAndRelease() {
    const currentHold=await hold.getStatus();
    if(stateOf(currentHold)!=="RECOVERY_HOLD") fail(BACKUP_ERROR_CODES.RESTORE_STATE);

    await runtime.recoverAll();
    const remaining=await reconcileRemoteOperations();
    const states=await runtime.listStates();
    const moduleGenerations=Array.isArray(states)&&states.every((row)=>["IDLE","DISABLED"].includes(stateOf(row)));
    const personaBindings=await safeBooleanCheck(checks.personaBindings);
    const providerCapabilities=await safeBooleanCheck(checks.providerCapabilities);

    const reconciliation=Object.freeze({moduleGenerations,personaBindings,providerCapabilities});
    if(remaining.length||!moduleGenerations||!personaBindings||!providerCapabilities) {
      return Object.freeze({
        released:false,
        reconciliation,
        unresolvedOperationIds:Object.freeze(remaining.map((row)=>row.value.operationId).sort())
      });
    }

    const latest=await hold.getStatus();
    if(stateOf(latest)!=="RECOVERY_HOLD") fail(BACKUP_ERROR_CODES.RESTORE_STATE);
    const released=await hold.releaseRecoveryHold({expectedRevision:latest.revision,checks:reconciliation});
    return Object.freeze({released:true,reconciliation,unresolvedOperationIds:Object.freeze([]),hold:released});
  }

  return Object.freeze({
    createBackup,
    stageRestore,
    applyStagedRestore,
    reconcileAndRelease,
    planRetention:planBackupRetention
  });
}
