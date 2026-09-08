import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createTwinEvent } from "../src/twin-federation.mjs";
import { TwinEventJournal } from "../src/twin-event-journal.mjs";

const federationId = "mahoraga-federation";
const localPeerId = "mahoraga-twin-1";
const baseCommit = "f8c0cb1d98061ffe129bfb1727089602e5559c2b";
const headCommit = "1111111111111111111111111111111111111111";
const otherCommit = "2222222222222222222222222222222222222222";
const createdAt = "2026-09-08T02:00:00.000Z";
const acceptedAt = "2026-09-08T02:01:00.000Z";

function event(overrides = {}) {
  return createTwinEvent({
    federationId,
    originPeerId: "mahoraga-primary",
    targetPeerId: localPeerId,
    sequence: 1,
    kind: "update",
    repository: "michaeljwilliams0123/mahoraga",
    baseCommit,
    headCommit,
    capability: null,
    payloadDigest: "a".repeat(64),
    createdAt,
    ...overrides,
  });
}

function journalFile(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-twin-journal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return path.join(root, "twin.sqlite");
}

function journal(file, localCommit = baseCommit, maximumEventIds = 4096) {
  return new TwinEventJournal(file, { federationId, localPeerId, localCommit, maximumEventIds, now: () => acceptedAt });
}

test("durably suppresses a replay and stale origin sequence after reopening", (t) => {
  const file = journalFile(t);
  const first = journal(file);
  const accepted = event({ sequence: 2 });
  assert.deepEqual(first.accept(accepted), {
    accepted: true,
    applied: true,
    reason: "accepted",
    disposition: { status: "pending-repository-reconciliation", capability: null },
  });
  first.close();

  const reopened = journal(file);
  assert.deepEqual(reopened.accept(accepted), {
    accepted: true,
    applied: false,
    reason: "duplicate",
    disposition: { status: "pending-repository-reconciliation", capability: null },
  });
  assert.deepEqual(reopened.accept(event({ sequence: 1, payloadDigest: "b".repeat(64) })), {
    accepted: true,
    applied: false,
    reason: "stale",
    disposition: null,
  });
  assert.equal(reopened.accept(event({ sequence: 3, payloadDigest: "c".repeat(64) })).applied, true);
  reopened.close();
});

test("rejects events outside the journal federation, target, and origin boundary", (t) => {
  const value = journal(journalFile(t));
  assert.deepEqual(value.accept(event({ federationId: "foreign-federation" })), {
    accepted: false, applied: false, reason: "federation-mismatch", disposition: null,
  });
  assert.deepEqual(value.accept(event({ targetPeerId: "mahoraga-other" })), {
    accepted: false, applied: false, reason: "not-target", disposition: null,
  });
  assert.deepEqual(value.accept(event({ originPeerId: localPeerId, targetPeerId: "*" })), {
    accepted: false, applied: false, reason: "self-origin", disposition: null,
  });
  assert.deepEqual(value.snapshot(), {
    federationId,
    localPeerId,
    highestSequenceByOrigin: {},
    eventIds: [],
  });
  value.close();
});

test("records only bounded event metadata and content-free convergence dispositions", (t) => {
  const file = journalFile(t);
  const value = journal(file);
  assert.deepEqual(value.accept(event({ kind: "presence", baseCommit, headCommit: baseCommit })), {
    accepted: true, applied: true, reason: "accepted", disposition: { status: "receipt", capability: null },
  });
  assert.deepEqual(value.accept(event({ sequence: 2, payloadDigest: "b".repeat(64) })), {
    accepted: true, applied: true, reason: "accepted", disposition: { status: "pending-repository-reconciliation", capability: null },
  });
  assert.deepEqual(value.accept(event({ sequence: 3, kind: "handoff", capability: "twin.review", payloadDigest: "c".repeat(64) })), {
    accepted: true, applied: true, reason: "accepted", disposition: { status: "proposed", capability: "twin.review" },
  });
  assert.deepEqual(value.entries().map((entry) => Object.keys(entry).sort()), [
    ["acceptanceStatus", "acceptedAt", "baseCommit", "capability", "createdAt", "dispositionAt", "dispositionCapability", "dispositionStatus", "eventId", "federationId", "headCommit", "kind", "localPeerId", "originPeerId", "payloadDigest", "repository", "sequence", "targetPeerId"],
    ["acceptanceStatus", "acceptedAt", "baseCommit", "capability", "createdAt", "dispositionAt", "dispositionCapability", "dispositionStatus", "eventId", "federationId", "headCommit", "kind", "localPeerId", "originPeerId", "payloadDigest", "repository", "sequence", "targetPeerId"],
    ["acceptanceStatus", "acceptedAt", "baseCommit", "capability", "createdAt", "dispositionAt", "dispositionCapability", "dispositionStatus", "eventId", "federationId", "headCommit", "kind", "localPeerId", "originPeerId", "payloadDigest", "repository", "sequence", "targetPeerId"],
  ]);
  value.close();

  const db = new DatabaseSync(file);
  const columns = db.prepare("PRAGMA table_info(twin_event_journal)").all().map((row) => row.name).sort();
  assert.deepEqual(columns, ["acceptance_status", "accepted_at", "base_commit", "capability", "created_at", "disposition_at", "disposition_capability", "disposition_status", "event_id", "federation_id", "head_commit", "journal_id", "kind", "local_peer_id", "origin_peer_id", "payload_digest", "repository", "sequence", "target_peer_id"].sort());
  assert.equal(db.prepare("SELECT count(*) AS count FROM twin_event_journal").get().count, 3);
  db.close();
});

test("proposes twin analysis for a divergent update without repository mutation", (t) => {
  const value = journal(journalFile(t), otherCommit);
  assert.deepEqual(value.accept(event()), {
    accepted: true, applied: true, reason: "accepted", disposition: { status: "proposed", capability: "twin.analyze" },
  });
  value.close();
});

test("bounds retained event IDs without losing durable origin high-water marks", (t) => {
  const file = journalFile(t);
  const first = journal(file, baseCommit, 2);
  const one = event({ sequence: 1 });
  const two = event({ sequence: 2, payloadDigest: "b".repeat(64) });
  const three = event({ sequence: 3, payloadDigest: "c".repeat(64) });
  first.accept(one);
  first.accept(two);
  first.accept(three);
  assert.deepEqual(first.snapshot().eventIds, [two.eventId, three.eventId]);
  first.close();

  const reopened = journal(file, baseCommit, 2);
  assert.deepEqual(reopened.accept(one), {
    accepted: true, applied: false, reason: "stale", disposition: null,
  });
  assert.deepEqual(reopened.snapshot().highestSequenceByOrigin, { "mahoraga-primary": 3 });
  reopened.close();
});

test("journals one broadcast event independently for each local federation peer", (t) => {
  const file = journalFile(t);
  const first = journal(file);
  const broadcast = event({ targetPeerId: "*" });
  assert.equal(first.accept(broadcast).applied, true);
  first.close();

  const second = new TwinEventJournal(file, {
    federationId,
    localPeerId: "mahoraga-twin-2",
    localCommit: baseCommit,
    now: () => acceptedAt,
  });
  assert.equal(second.accept(broadcast).applied, true);
  assert.deepEqual(second.snapshot().eventIds, [broadcast.eventId]);
  second.close();
});
