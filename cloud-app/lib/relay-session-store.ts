"use client";

const DATABASE_NAME = "mahoraga-relay";
const DATABASE_VERSION = 1;
const STORE_NAME = "sessions";
const PRIMARY_KEY = "primary";

export type StoredRelaySession = {
  schemaVersion: 1;
  sessionId: string;
  deviceId: string;
  expiresAt: string;
  resumeCredential: string;
  key: CryptoKey;
  sendCounter: number;
  receivedCounter: number;
};

export async function loadRelaySession(): Promise<StoredRelaySession | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const database = await openDatabase();
    const value = await requestResult(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(PRIMARY_KEY));
    database.close();
    if (!validRecord(value) || Date.parse(value.expiresAt) <= Date.now()) {
      await clearRelaySession();
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
export async function saveRelaySession(record: StoredRelaySession): Promise<void> {
  if (typeof indexedDB === "undefined" || !validRecord(record)) throw new Error("relay-session-store-invalid");
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record, PRIMARY_KEY);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearRelaySession(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(PRIMARY_KEY);
    await transactionDone(transaction);
    database.close();
  } catch {
    // Browser persistence is an optimization; relay revocation remains authoritative.
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mahoraga-relay", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("relay-session-store-open-failed"));
  });
}
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("relay-session-store-request-failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("relay-session-store-transaction-aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("relay-session-store-transaction-failed"));
  });
}

function validRecord(value: unknown): value is StoredRelaySession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<StoredRelaySession>;
  if (record.schemaVersion !== 1 || typeof record.sessionId !== "string" || !/^rls-[A-Za-z0-9_-]{32}$/.test(record.sessionId)) return false;
  if (typeof record.deviceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(record.deviceId)) return false;
  if (typeof record.expiresAt !== "string" || !Number.isFinite(Date.parse(record.expiresAt))) return false;
  if (typeof record.resumeCredential !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(record.resumeCredential)) return false;
  if (!record.key || typeof record.key !== "object" || record.key.type !== "secret" || record.key.algorithm?.name !== "AES-GCM") return false;
  if (!Number.isSafeInteger(record.sendCounter) || Number(record.sendCounter) < 0) return false;
  if (!Number.isSafeInteger(record.receivedCounter) || Number(record.receivedCounter) < 0) return false;
  return true;
}