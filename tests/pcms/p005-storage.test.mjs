import assert from "node:assert/strict";
import test from "node:test";

import { STORAGE_ERROR_CODES, storageError } from "../../extension/pcms/storage/errors.js";
import {
  PCMS_DB_VERSION,
  PCMS_NAMESPACE_INDEX,
  PCMS_RECORD_STORE,
  applyPcmsMigrations
} from "../../extension/pcms/storage/migrations.js";
import { openPcmsDatabase } from "../../extension/pcms/storage/indexeddb-backend.js";
import { createPcmsStorageBroker } from "../../extension/pcms/storage/storage-broker.js";

function makeMigrationDb() {
  const stores = new Map();
  return {
    stores,
    createObjectStore(name, options) {
      if (stores.has(name)) throw new Error("duplicate store");
      const indices = new Map();
      const store = {
        name,
        options,
        indices,
        createIndex(indexName, keyPath, indexOptions) {
          indices.set(indexName, { keyPath, options:indexOptions });
        }
      };
      stores.set(name, store);
      return store;
    },
    close() {}
  };
}

function makeOpenIndexedDb({ db, oldVersion=0, newVersion=PCMS_DB_VERSION } = {}) {
  const calls = { aborts:0, opens:[] };
  return {
    calls,
    open(name, version) {
      calls.opens.push({name,version});
      const transaction = {
        error:null,
        abort() {
          calls.aborts += 1;
          this.error = new Error("aborted");
          this.aborted = true;
        }
      };
      const request = { result:db, transaction, error:null };
      queueMicrotask(() => {
        request.onupgradeneeded?.({ oldVersion, newVersion });
        if (transaction.aborted) {
          request.error = transaction.error;
          request.onerror?.();
        } else {
          request.onsuccess?.();
        }
      });
      return request;
    }
  };
}

function makeMemoryBackend(shared = { records:new Map(), opens:0, failNextWrite:false }) {
  const clone = (value) => structuredClone(value);
  return {
    shared,
    async open() { shared.opens += 1; },
    close() {},
    async get(namespace, key) {
      const record = shared.records.get(namespace+"\u0000"+key);
      return record ? clone(record) : null;
    },
    async compareAndSwap(namespace, key, expectedRevision, value, updatedAt) {
      const id=namespace+"\u0000"+key;
      const existing=shared.records.get(id);
      const currentRevision=existing?.revision || 0;
      if (currentRevision !== expectedRevision) {
        throw storageError(STORAGE_ERROR_CODES.CAS_MISMATCH, "revision mismatch", { currentRevision });
      }
      if (shared.failNextWrite) {
        shared.failNextWrite=false;
        throw storageError(STORAGE_ERROR_CODES.UNAVAILABLE, "injected write failure");
      }
      const record={id,namespace,key,revision:currentRevision+1,value:clone(value),updatedAt};
      shared.records.set(id,record);
      return clone(record);
    },
    async deleteCompareAndSwap(namespace, key, expectedRevision) {
      const id=namespace+"\u0000"+key;
      const existing=shared.records.get(id);
      const currentRevision=existing?.revision || 0;
      if (currentRevision !== expectedRevision) {
        throw storageError(STORAGE_ERROR_CODES.CAS_MISMATCH, "revision mismatch", { currentRevision });
      }
      if (!existing) return {deleted:false,revision:0};
      if (shared.failNextWrite) {
        shared.failNextWrite=false;
        throw storageError(STORAGE_ERROR_CODES.UNAVAILABLE, "injected delete failure");
      }
      shared.records.delete(id);
      return {deleted:true,revision:currentRevision};
    },
    async listNamespace(namespace) {
      return [...shared.records.values()]
        .filter((record) => record.namespace===namespace)
        .sort((a,b) => a.key.localeCompare(b.key))
        .map(clone);
    }
  };
}

test("A005-01 migration authority creates only the versioned PCMS schema", () => {
  const db=makeMigrationDb();
  applyPcmsMigrations({db,transaction:{},oldVersion:0,newVersion:1});

  assert.equal(PCMS_DB_VERSION,1);
  assert.deepEqual([...db.stores.keys()],[PCMS_RECORD_STORE]);
  const records=db.stores.get(PCMS_RECORD_STORE);
  assert.equal(records.options.keyPath,"id");
  assert.deepEqual(records.indices.get(PCMS_NAMESPACE_INDEX),{
    keyPath:"namespace",
    options:{unique:false}
  });

  assert.throws(
    () => applyPcmsMigrations({
      db:makeMigrationDb(),
      transaction:{},
      oldVersion:0,
      newVersion:2
    }),
    (error) => error?.code===STORAGE_ERROR_CODES.MIGRATION_FAILED
  );
});

test("A005-01 migration failures abort the IndexedDB upgrade and fail closed", async () => {
  const db=makeMigrationDb();
  const indexedDB=makeOpenIndexedDb({db});
  const failingMigrations=[{
    version:1,
    apply() { throw new Error("injected migration failure"); }
  }];

  await assert.rejects(
    openPcmsDatabase({indexedDB,version:1,migrations:failingMigrations}),
    (error) => error?.code===STORAGE_ERROR_CODES.MIGRATION_FAILED
  );
  assert.equal(indexedDB.calls.aborts,1);
});

test("A005-02 namespaces are isolated and every mutation is revision-fenced", async () => {
  let tick=0;
  const backend=makeMemoryBackend();
  const broker=createPcmsStorageBroker({
    backend,
    clock:() => "2026-10-05T00:00:0"+(++tick)+"Z"
  });
  const alpha=broker.namespace("module.alpha");
  const beta=broker.namespace("module.beta");

  assert.equal(await alpha.get("settings"),null);
  const created=await alpha.compareAndSwap("settings",{
    expectedRevision:0,
    value:{enabled:true,nested:{count:1}}
  });
  assert.equal(created.revision,1);
  assert.equal(created.value.enabled,true);
  assert.equal(await beta.get("settings"),null);

  await assert.rejects(
    alpha.compareAndSwap("settings",{expectedRevision:0,value:{enabled:false}}),
    (error) => error?.code===STORAGE_ERROR_CODES.CAS_MISMATCH && error.currentRevision===1
  );
  assert.equal((await alpha.get("settings")).value.enabled,true);

  const updated=await alpha.compareAndSwap("settings",{
    expectedRevision:1,
    value:{enabled:false,nested:{count:2}}
  });
  assert.equal(updated.revision,2);

  await alpha.compareAndSwap("another",{expectedRevision:0,value:{order:1}});
  assert.deepEqual((await alpha.list()).map((row)=>row.key),["another","settings"]);
  assert.equal((await beta.list()).length,0);

  await assert.rejects(
    alpha.compareAndSwap("unsafe",{expectedRevision:0,value:{get token(){ return "no"; }}}),
    (error) => error?.code===STORAGE_ERROR_CODES.INVALID_VALUE
  );
});

test("A005-03 close/reopen preserves state and failed writes do not advance revision", async () => {
  const shared={records:new Map(),opens:0,failNextWrite:false};
  const firstBackend=makeMemoryBackend(shared);
  const first=createPcmsStorageBroker({backend:firstBackend,clock:()=> "2026-10-05T00:01:00Z"});
  const store=first.namespace("core.remoteops");

  await store.compareAndSwap("op-1",{expectedRevision:0,value:{state:"PREPARED"}});
  first.close();

  const secondBackend=makeMemoryBackend(shared);
  const second=createPcmsStorageBroker({backend:secondBackend,clock:()=> "2026-10-05T00:02:00Z"});
  const reopened=second.namespace("core.remoteops");
  const persisted=await reopened.get("op-1");
  assert.equal(persisted.revision,1);
  assert.equal(persisted.value.state,"PREPARED");

  shared.failNextWrite=true;
  await assert.rejects(
    reopened.compareAndSwap("op-1",{expectedRevision:1,value:{state:"DISPATCHED"}}),
    (error) => error?.code===STORAGE_ERROR_CODES.UNAVAILABLE
  );
  const afterFailure=await reopened.get("op-1");
  assert.equal(afterFailure.revision,1);
  assert.equal(afterFailure.value.state,"PREPARED");

  second.close();
  const third=createPcmsStorageBroker({backend:makeMemoryBackend(shared)});
  const afterRestart=await third.namespace("core.remoteops").get("op-1");
  assert.equal(afterRestart.revision,1);
  assert.equal(afterRestart.value.state,"PREPARED");
  assert.equal(shared.opens,3);
});

test("A005-02 invalid namespace/key/revision inputs fail before backend mutation", async () => {
  const backend=makeMemoryBackend();
  const broker=createPcmsStorageBroker({backend});
  assert.throws(
    () => broker.namespace("../persona"),
    (error) => error?.code===STORAGE_ERROR_CODES.INVALID_NAMESPACE
  );
  const store=broker.namespace("module.safe");
  await assert.rejects(
    store.compareAndSwap("",{expectedRevision:0,value:{}}),
    (error) => error?.code===STORAGE_ERROR_CODES.INVALID_KEY
  );
  await assert.rejects(
    store.compareAndSwap("x",{expectedRevision:-1,value:{}}),
    (error) => error?.code===STORAGE_ERROR_CODES.CAS_MISMATCH
  );
  assert.equal(backend.shared.records.size,0);
});
