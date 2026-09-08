import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { classifyTwinConvergence, validateTwinEvent } from "./twin-federation.mjs";

export class TwinEventJournal {
  constructor(file, { federationId, localPeerId, localCommit, maximumEventIds = 4096, now = () => new Date().toISOString() } = {}) {
    if (typeof file !== "string" || file.length < 1) fail("twin-journal-file-invalid");
    slug(federationId, "twin-journal-federation-invalid");
    peerId(localPeerId, "twin-journal-peer-invalid");
    sha(localCommit, "twin-journal-local-commit-invalid");
    if (!Number.isSafeInteger(maximumEventIds) || maximumEventIds < 1 || maximumEventIds > 4096) fail("twin-journal-limit-invalid");
    if (typeof now !== "function") fail("twin-journal-now-invalid");
    mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.federationId = federationId;
    this.localPeerId = localPeerId;
    this.localCommit = localCommit;
    this.maximumEventIds = maximumEventIds;
    this.now = now;
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.#migrate();
  }

  close() {
    this.db.close();
  }

  accept(rawEvent) {
    const event = validateTwinEvent(rawEvent);
    if (event.federationId !== this.federationId) return result(false, false, "federation-mismatch", null);
    if (event.targetPeerId !== "*" && event.targetPeerId !== this.localPeerId) return result(false, false, "not-target", null);
    if (event.originPeerId === this.localPeerId) return result(false, false, "self-origin", null);
    return this.#transaction(() => {
      const existing = this.#find(event.eventId);
      if (existing) return result(true, false, "duplicate", disposition(existing));
      const highWater = this.db.prepare(`
        SELECT sequence FROM twin_event_high_water
        WHERE federation_id = ? AND local_peer_id = ? AND origin_peer_id = ?
      `).get(this.federationId, this.localPeerId, event.originPeerId)?.sequence ?? null;
      if (highWater !== null && event.sequence <= highWater) return result(true, false, "stale", null);
      const acceptedAt = timestamp(this.now(), "twin-journal-now-invalid");
      const nextDisposition = classifyDisposition(this.localCommit, event);
      this.db.prepare(`
        INSERT INTO twin_event_journal (
          event_id, federation_id, local_peer_id, origin_peer_id, target_peer_id, sequence, kind, repository,
          base_commit, head_commit, capability, payload_digest, created_at, accepted_at, acceptance_status,
          disposition_at, disposition_status, disposition_capability
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.eventId, event.federationId, this.localPeerId, event.originPeerId, event.targetPeerId, event.sequence,
        event.kind, event.repository, event.baseCommit, event.headCommit, event.capability, event.payloadDigest,
        event.createdAt, acceptedAt, "accepted", acceptedAt, nextDisposition.status, nextDisposition.capability,
      );
      this.db.prepare(`
        INSERT INTO twin_event_high_water (federation_id, local_peer_id, origin_peer_id, sequence)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(federation_id, local_peer_id, origin_peer_id) DO UPDATE SET sequence = excluded.sequence
      `).run(this.federationId, this.localPeerId, event.originPeerId, event.sequence);
      const retained = this.db.prepare(`
        SELECT journal_id FROM twin_event_journal
        WHERE federation_id = ? AND local_peer_id = ? ORDER BY journal_id DESC LIMIT -1 OFFSET ?
      `).all(this.federationId, this.localPeerId, this.maximumEventIds);
      for (const row of retained) this.db.prepare("DELETE FROM twin_event_journal WHERE journal_id = ?").run(row.journal_id);
      return result(true, true, "accepted", nextDisposition);
    });
  }

  snapshot() {
    const highestSequenceByOrigin = Object.fromEntries(this.db.prepare(`
      SELECT origin_peer_id, sequence FROM twin_event_high_water
      WHERE federation_id = ? AND local_peer_id = ?
      ORDER BY origin_peer_id ASC
    `).all(this.federationId, this.localPeerId).map((row) => [row.origin_peer_id, row.sequence]));
    const eventIds = this.db.prepare(`
      SELECT event_id FROM twin_event_journal
      WHERE federation_id = ? AND local_peer_id = ? ORDER BY journal_id ASC
    `).all(this.federationId, this.localPeerId).map((row) => row.event_id);
    return freeze({ federationId: this.federationId, localPeerId: this.localPeerId, highestSequenceByOrigin, eventIds });
  }

  entries() {
    return this.db.prepare(`
      SELECT event_id, federation_id, local_peer_id, origin_peer_id, target_peer_id, sequence, kind, repository,
        base_commit, head_commit, capability, payload_digest, created_at, accepted_at, acceptance_status,
        disposition_at, disposition_status, disposition_capability
      FROM twin_event_journal
      WHERE federation_id = ? AND local_peer_id = ? ORDER BY journal_id ASC
    `).all(this.federationId, this.localPeerId).map((row) => freeze({
      eventId: row.event_id,
      federationId: row.federation_id,
      localPeerId: row.local_peer_id,
      originPeerId: row.origin_peer_id,
      targetPeerId: row.target_peer_id,
      sequence: row.sequence,
      kind: row.kind,
      repository: row.repository,
      baseCommit: row.base_commit,
      headCommit: row.head_commit,
      capability: row.capability,
      payloadDigest: row.payload_digest,
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
      acceptanceStatus: row.acceptance_status,
      dispositionAt: row.disposition_at,
      dispositionStatus: row.disposition_status,
      dispositionCapability: row.disposition_capability,
    }));
  }

  #find(eventId) {
    return this.db.prepare(`
      SELECT disposition_status, disposition_capability FROM twin_event_journal
      WHERE event_id = ? AND federation_id = ? AND local_peer_id = ?
    `).get(eventId, this.federationId, this.localPeerId);
  }

  #migrate() {
    const columns = this.db.prepare("PRAGMA table_info(twin_event_journal)").all();
    const legacyEventIdPrimaryKey = columns.some((column) => column.name === "event_id" && column.pk === 1);
    if (!legacyEventIdPrimaryKey) {
      createJournalTables(this.db);
      return;
    }
    this.#transaction(() => {
      this.db.exec("ALTER TABLE twin_event_journal RENAME TO twin_event_journal_legacy");
      this.db.exec("DROP INDEX IF EXISTS twin_event_journal_high_water");
      createJournalTables(this.db);
      this.db.exec(`
        INSERT INTO twin_event_journal (
          event_id, federation_id, local_peer_id, origin_peer_id, target_peer_id, sequence, kind, repository,
          base_commit, head_commit, capability, payload_digest, created_at, accepted_at, acceptance_status,
          disposition_at, disposition_status, disposition_capability
        )
        SELECT event_id, federation_id, local_peer_id, origin_peer_id, target_peer_id, sequence, kind, repository,
          base_commit, head_commit, capability, payload_digest, created_at, accepted_at, acceptance_status,
          disposition_at, disposition_status, disposition_capability
        FROM twin_event_journal_legacy ORDER BY rowid ASC
      `);
      this.db.exec(`
        INSERT INTO twin_event_high_water (federation_id, local_peer_id, origin_peer_id, sequence)
        SELECT federation_id, local_peer_id, origin_peer_id, MAX(sequence)
        FROM twin_event_journal GROUP BY federation_id, local_peer_id, origin_peer_id
        ON CONFLICT(federation_id, local_peer_id, origin_peer_id) DO UPDATE SET sequence = excluded.sequence
      `);
      this.db.exec("DROP TABLE twin_event_journal_legacy");
    });
  }

  #transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      this.db.exec("COMMIT");
      return value;
    } catch (cause) {
      this.db.exec("ROLLBACK");
      throw cause;
    }
  }
}

function createJournalTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS twin_event_journal (
      journal_id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      federation_id TEXT NOT NULL,
      local_peer_id TEXT NOT NULL,
      origin_peer_id TEXT NOT NULL,
      target_peer_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      kind TEXT NOT NULL,
      repository TEXT NOT NULL,
      base_commit TEXT NOT NULL,
      head_commit TEXT NOT NULL,
      capability TEXT,
      payload_digest TEXT NOT NULL,
      created_at TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      acceptance_status TEXT NOT NULL,
      disposition_at TEXT NOT NULL,
      disposition_status TEXT NOT NULL,
      disposition_capability TEXT,
      UNIQUE(federation_id, local_peer_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS twin_event_journal_high_water
      ON twin_event_journal(federation_id, local_peer_id, origin_peer_id, sequence);
    CREATE TABLE IF NOT EXISTS twin_event_high_water (
      federation_id TEXT NOT NULL,
      local_peer_id TEXT NOT NULL,
      origin_peer_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      PRIMARY KEY(federation_id, local_peer_id, origin_peer_id)
    );
  `);
}

function classifyDisposition(localCommit, event) {
  const convergence = classifyTwinConvergence({ localCommit, event });
  if (convergence === "in-sync") return freeze({ status: "receipt", capability: null });
  if (convergence === "fast-forward-candidate") return freeze({ status: "pending-repository-reconciliation", capability: null });
  if (convergence === "reconciliation-required") return freeze({ status: "proposed", capability: "twin.analyze" });
  return freeze({ status: "proposed", capability: "twin.review" });
}

function disposition(row) {
  return freeze({ status: row.disposition_status, capability: row.disposition_capability });
}

function result(accepted, applied, reason, nextDisposition) {
  return freeze({ accepted, applied, reason, disposition: nextDisposition });
}

function slug(value, code) { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(value)) fail(code); }
function peerId(value, code) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(value)) fail(code); }
function sha(value, code) { if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) fail(code); }
function timestamp(value, code) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code); return value; }
function freeze(value) { return Object.freeze(value); }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
