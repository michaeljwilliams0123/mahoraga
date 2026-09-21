export type ReceiptStatus = "SUCCESS" | "FAILED";

export interface StorageReceipt {
  id: string;
  idempotencyKey: string;
  status: ReceiptStatus;
  resultPayload: Record<string, unknown>;
  createdAt: number;
}

export interface StorageAdapter {
  initSchema(): void;
  acquireLease(resourceId: string, holderId: string, ttlMs: number): boolean;
  releaseLease(resourceId: string, holderId: string): void;
  getIdempotentReceipt(key: string): StorageReceipt | null;
  saveReceipt(receipt: StorageReceipt): void;
  executeTransaction<T>(fn: () => T): T;
}

type ReceiptRow = Record<string, SqlStorageValue> & {
  id: string;
  idempotency_key: string;
  status: ReceiptStatus;
  payload: string;
  created_at: number;
};

const isLeaseConflict = (error: unknown): boolean =>
  error instanceof Error &&
  /(?:UNIQUE|PRIMARY KEY) constraint failed: leases\.resource_id/i.test(error.message);

export class CloudflareDOSQLiteAdapter implements StorageAdapter {
  readonly sql: SqlStorage;
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sql = state.storage.sql;
  }

  initSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS leases (
        resource_id TEXT PRIMARY KEY,
        holder_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_leases_expires_at ON leases(expires_at);
      CREATE TABLE IF NOT EXISTS execution_receipts (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  acquireLease(resourceId: string, holderId: string, ttlMs: number): boolean {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new RangeError("lease-ttl-invalid");
    const now = Date.now();
    try {
      return this.state.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM leases WHERE resource_id = ? AND expires_at <= ?", resourceId, now);
        this.sql.exec(
          "INSERT INTO leases (resource_id, holder_id, expires_at) VALUES (?, ?, ?)",
          resourceId,
          holderId,
          now + ttlMs,
        );
        return true;
      });
    } catch (error) {
      if (isLeaseConflict(error)) return false;
      throw error;
    }
  }

  releaseLease(resourceId: string, holderId: string): void {
    this.sql.exec("DELETE FROM leases WHERE resource_id = ? AND holder_id = ?", resourceId, holderId);
  }

  getIdempotentReceipt(key: string): StorageReceipt | null {
    const row = this.sql
      .exec<ReceiptRow>(
        `SELECT id, idempotency_key, status, payload, created_at
         FROM execution_receipts WHERE idempotency_key = ?`,
        key,
      )
      .toArray()[0];
    if (row === undefined) return null;
    const payload: unknown = JSON.parse(row.payload);
    if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
      throw new Error("receipt-payload-invalid");
    }
    return {
      id: row.id,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      resultPayload: payload as Record<string, unknown>,
      createdAt: row.created_at,
    };
  }

  saveReceipt(receipt: StorageReceipt): void {
    this.sql.exec(
      `INSERT INTO execution_receipts (id, idempotency_key, status, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      receipt.id,
      receipt.idempotencyKey,
      receipt.status,
      JSON.stringify(receipt.resultPayload),
      receipt.createdAt,
    );
  }

  executeTransaction<T>(fn: () => T): T {
    return this.state.storage.transactionSync(fn);
  }
}
