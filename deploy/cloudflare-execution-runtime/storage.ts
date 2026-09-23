import type { EncryptedContentRecord, ConversationContentRole } from "./content-vault";
import type { AssistantCostClass } from "./provider-policy";

export type ReceiptStatus = "SUCCESS" | "FAILED";
export type AssistantTurnStatus = "PENDING" | "SUCCESS" | "FAILED";
export type AssistantCreditPolicy = "zero-codex" | "licensed-approved";

export interface StorageReceipt {
  id: string;
  idempotencyKey: string;
  status: ReceiptStatus;
  resultPayload: Record<string, unknown>;
  createdAt: number;
}

export interface ConversationRecord {
  id: string;
  ownerIdHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantTurnRecord {
  id: string;
  conversationId: string;
  requestDigest: string;
  responseDigest: string | null;
  providerId: string | null;
  costClass: AssistantCostClass | null;
  creditPolicy: AssistantCreditPolicy;
  status: AssistantTurnStatus;
  contentIdUser: string;
  contentIdAssistant: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface ProviderStateRecord {
  providerId: string;
  available: boolean;
  zeroCreditEligible: boolean;
  reasonCode: string | null;
  observedAt: number;
  verifiedAt: number | null;
  canaryExpiresAt: number | null;
}

export interface StorageAdapter {
  initSchema(): void;
  acquireLease(resourceId: string, holderId: string, ttlMs: number): boolean;
  releaseLease(resourceId: string, holderId: string): void;
  getIdempotentReceipt(key: string): StorageReceipt | null;
  saveReceipt(receipt: StorageReceipt): void;
  getConversation(id: string): ConversationRecord | null;
  saveConversation(record: ConversationRecord): void;
  getTurn(id: string): AssistantTurnRecord | null;
  listTurns(conversationId: string): AssistantTurnRecord[];
  saveTurn(record: AssistantTurnRecord): void;
  getProviderState(providerId: string): ProviderStateRecord | null;
  saveProviderState(record: ProviderStateRecord): void;
  getContentRecord(contentId: string): EncryptedContentRecord | null;
  saveContentRecord(record: EncryptedContentRecord): void;
  executeTransaction<T>(fn: () => T): T;
}

type ReceiptRow = Record<string, SqlStorageValue> & {
  id: string;
  idempotency_key: string;
  status: ReceiptStatus;
  payload: string;
  created_at: number;
};

type ConversationRow = Record<string, SqlStorageValue> & {
  id: string;
  owner_id_hash: string;
  created_at: number;
  updated_at: number;
};

type TurnRow = Record<string, SqlStorageValue> & {
  id: string;
  conversation_id: string;
  request_digest: string;
  response_digest: string | null;
  provider_id: string | null;
  cost_class: AssistantCostClass | null;
  credit_policy: AssistantCreditPolicy;
  status: AssistantTurnStatus;
  content_id_user: string;
  content_id_assistant: string | null;
  created_at: number;
  completed_at: number | null;
};

type ProviderStateRow = Record<string, SqlStorageValue> & {
  provider_id: string;
  available: number;
  zero_credit_eligible: number;
  reason_code: string | null;
  observed_at: number;
  verified_at: number | null;
  canary_expires_at: number | null;
};

type ContentRow = Record<string, SqlStorageValue> & {
  content_id: string;
  conversation_id: string;
  role: ConversationContentRole;
  ciphertext: string;
  iv: string;
  content_hash: string;
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
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        owner_id_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        response_digest TEXT,
        provider_id TEXT,
        cost_class TEXT,
        credit_policy TEXT NOT NULL CHECK (credit_policy IN ('zero-codex', 'licensed-approved')),
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
        content_id_user TEXT NOT NULL,
        content_id_assistant TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_turns_conversation_created_at ON turns(conversation_id, created_at);
      CREATE TABLE IF NOT EXISTS provider_state (
        provider_id TEXT PRIMARY KEY,
        available INTEGER NOT NULL CHECK (available IN (0, 1)),
        zero_credit_eligible INTEGER NOT NULL CHECK (zero_credit_eligible IN (0, 1)),
        reason_code TEXT,
        observed_at INTEGER NOT NULL,
        verified_at INTEGER,
        canary_expires_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS conversation_content (
        content_id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_content_conversation_created_at
        ON conversation_content(conversation_id, created_at);
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

  getConversation(id: string): ConversationRecord | null {
    const row = this.sql
      .exec<ConversationRow>(
        "SELECT id, owner_id_hash, created_at, updated_at FROM conversations WHERE id = ?",
        id,
      )
      .toArray()[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      ownerIdHash: row.owner_id_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveConversation(record: ConversationRecord): void {
    this.sql.exec(
      `INSERT INTO conversations (id, owner_id_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         owner_id_hash = excluded.owner_id_hash,
         updated_at = excluded.updated_at`,
      record.id,
      record.ownerIdHash,
      record.createdAt,
      record.updatedAt,
    );
  }

  getTurn(id: string): AssistantTurnRecord | null {
    const row = this.sql
      .exec<TurnRow>(
        `SELECT id, conversation_id, request_digest, response_digest, provider_id, cost_class,
                credit_policy, status, content_id_user, content_id_assistant, created_at, completed_at
         FROM turns WHERE id = ?`,
        id,
      )
      .toArray()[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      requestDigest: row.request_digest,
      responseDigest: row.response_digest,
      providerId: row.provider_id,
      costClass: row.cost_class,
      creditPolicy: row.credit_policy,
      status: row.status,
      contentIdUser: row.content_id_user,
      contentIdAssistant: row.content_id_assistant,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  listTurns(conversationId: string): AssistantTurnRecord[] {
    return this.sql.exec<{ id: string } & Record<string, SqlStorageValue>>(
      "SELECT id FROM turns WHERE conversation_id = ? ORDER BY created_at, id LIMIT 200", conversationId,
    ).toArray().map((row) => this.getTurn(row.id)!).filter(Boolean);
  }

  saveTurn(record: AssistantTurnRecord): void {
    this.sql.exec(
      `INSERT INTO turns (
         id, conversation_id, request_digest, response_digest, provider_id, cost_class,
         credit_policy, status, content_id_user, content_id_assistant, created_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         response_digest = excluded.response_digest,
         provider_id = excluded.provider_id,
         cost_class = excluded.cost_class,
         credit_policy = excluded.credit_policy,
         status = excluded.status,
         content_id_assistant = excluded.content_id_assistant,
         completed_at = excluded.completed_at`,
      record.id,
      record.conversationId,
      record.requestDigest,
      record.responseDigest,
      record.providerId,
      record.costClass,
      record.creditPolicy,
      record.status,
      record.contentIdUser,
      record.contentIdAssistant,
      record.createdAt,
      record.completedAt,
    );
  }

  getProviderState(providerId: string): ProviderStateRecord | null {
    const row = this.sql
      .exec<ProviderStateRow>(
        `SELECT provider_id, available, zero_credit_eligible, reason_code, observed_at, verified_at, canary_expires_at
         FROM provider_state WHERE provider_id = ?`,
        providerId,
      )
      .toArray()[0];
    if (row === undefined) return null;
    return {
      providerId: row.provider_id,
      available: row.available === 1,
      zeroCreditEligible: row.zero_credit_eligible === 1,
      reasonCode: row.reason_code,
      observedAt: row.observed_at,
      verifiedAt: row.verified_at,
      canaryExpiresAt: row.canary_expires_at,
    };
  }

  saveProviderState(record: ProviderStateRecord): void {
    this.sql.exec(
      `INSERT INTO provider_state (
         provider_id, available, zero_credit_eligible, reason_code, observed_at, verified_at, canary_expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider_id) DO UPDATE SET
         available = excluded.available,
         zero_credit_eligible = excluded.zero_credit_eligible,
         reason_code = excluded.reason_code,
         observed_at = excluded.observed_at,
         verified_at = excluded.verified_at,
         canary_expires_at = excluded.canary_expires_at`,
      record.providerId,
      record.available ? 1 : 0,
      record.zeroCreditEligible ? 1 : 0,
      record.reasonCode,
      record.observedAt,
      record.verifiedAt,
      record.canaryExpiresAt,
    );
  }

  getContentRecord(contentId: string): EncryptedContentRecord | null {
    const row = this.sql
      .exec<ContentRow>(
        `SELECT content_id, conversation_id, role, ciphertext, iv, content_hash, created_at
         FROM conversation_content WHERE content_id = ?`,
        contentId,
      )
      .toArray()[0];
    if (row === undefined) return null;
    return {
      contentId: row.content_id,
      conversationId: row.conversation_id,
      role: row.role,
      ciphertext: row.ciphertext,
      iv: row.iv,
      contentHash: row.content_hash,
      createdAt: row.created_at,
    };
  }

  saveContentRecord(record: EncryptedContentRecord): void {
    this.sql.exec(
      `INSERT INTO conversation_content (
         content_id, conversation_id, role, ciphertext, iv, content_hash, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      record.contentId,
      record.conversationId,
      record.role,
      record.ciphertext,
      record.iv,
      record.contentHash,
      record.createdAt,
    );
  }

  executeTransaction<T>(fn: () => T): T {
    return this.state.storage.transactionSync(fn);
  }
}
