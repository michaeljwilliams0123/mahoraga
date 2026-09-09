import test from "node:test";
import assert from "node:assert/strict";

import { createOmnichannelEnvelope, deriveTaskIntakeFromOmnichannelEnvelope, validateOmnichannelEnvelope } from "../src/omnichannel-intake.mjs";

const NOW = new Date().toISOString();
const LATER = new Date(Date.parse(NOW) + 90 * 60 * 1000).toISOString();

test("omnichannel intake normalizes Microsoft and file sources into bounded envelopes", () => {
  const email = createOmnichannelEnvelope({
    source: "microsoft-message",
    actor: {
      actorType: "microsoft-account",
      actorId: "owner@outlook",
      trustClass: "observed-session",
      accountBoundary: "personal",
    },
    object: {
      service: "outlook",
      objectType: "email",
      objectId: "msg-123",
      threadId: "thread-123",
      accountBoundary: "personal",
    },
    allowedActionClass: "draft",
    correlationId: "corr-email-1",
    idempotencyKey: "mail:msg-123",
    contentReferences: [],
    routeHint: { capability: "assistant.respond", actionPackId: "email-triage" },
    metadata: { "subject-digest": "invoice-follow-up", unread: true },
    zeroCreditEligible: true,
  }, { now: NOW, ttlSeconds: 3600 });
  assert.equal(email.channelFamily, "microsoft");
  assert.equal(email.dataClass, "personal");
  assert.equal(email.routeHint.actionPackId, "email-triage");

  const file = createOmnichannelEnvelope({
    source: "file-drop",
    actor: {
      actorType: "file-watcher",
      actorId: "watcher-local",
      trustClass: "queued-ingress",
      accountBoundary: "local-only",
    },
    object: {
      locationClass: "local-folder",
      fileName: "budget.csv",
      sha256: "a".repeat(64),
    },
    allowedActionClass: "triage",
    correlationId: "corr-file-1",
    idempotencyKey: "file:budget.csv:a",
    contentReferences: ["vault:12345678-1234-4234-8234-123456789abc"],
    routeHint: { capability: "artifact.inspect", actionPackId: "file-intake" },
    metadata: { folder: "finance-drop" },
    zeroCreditEligible: true,
  }, { now: NOW, ttlSeconds: 1800 });
  assert.equal(file.channelFamily, "file");
  assert.equal(file.dataClass, "local-only");
  assert.equal(file.object.objectType, "file");
});

test("omnichannel intake derives generic task intake without caller authority escalation", () => {
  const envelope = createOmnichannelEnvelope({
    source: "github-event",
    actor: {
      actorType: "owner",
      actorId: "michaeljwilliams0123",
      trustClass: "owner-explicit",
      accountBoundary: "local-only",
    },
    object: {
      repository: "michaeljwilliams0123/mahoraga",
      eventName: "pull_request",
      action: "opened",
      objectType: "pull-request",
      objectId: "184",
      deliveryId: "evt-184",
    },
    allowedActionClass: "observe",
    correlationId: "corr-pr-184",
    idempotencyKey: "github:evt-184",
    contentReferences: [],
    routeHint: { capability: "repository.inspect", actionPackId: "github-status-report" },
    metadata: { branch: "feature/x" },
    zeroCreditEligible: true,
  }, { now: NOW });

  const intake = deriveTaskIntakeFromOmnichannelEnvelope(envelope);
  assert.equal(intake.intent, "repository.inspect");
  assert.equal(intake.taskArea, "github");
  assert.equal(intake.priority, "high");
  assert.match(intake.requestedOutcome, /Inspect michaeljwilliams0123\/mahoraga/);
  assert.deepEqual(validateOmnichannelEnvelope(envelope, { now: NOW }), envelope);
});

test("omnichannel intake fails closed on secret-like metadata or mismatched freshness", () => {
  assert.throws(() => createOmnichannelEnvelope({
    source: "owner-request",
    actor: {
      actorType: "owner",
      actorId: "owner",
      trustClass: "owner-explicit",
      accountBoundary: "synthetic",
    },
    object: { surface: "command", requestId: "req-1" },
    allowedActionClass: "observe",
    correlationId: "corr-owner-1",
    idempotencyKey: "owner:req-1",
    contentReferences: [],
    routeHint: { capability: "assistant.respond", actionPackId: "draft-follow-up" },
    metadata: { secret: "sk-test-1234567890123456" },
    zeroCreditEligible: true,
  }, { now: NOW }), /omnichannel-metadata-invalid/);

  const value = createOmnichannelEnvelope({
    source: "cloud-queue",
    actor: {
      actorType: "queue-worker",
      actorId: "queue-1",
      trustClass: "queued-ingress",
      accountBoundary: "synthetic",
    },
    object: { queueKind: "reminder", messageId: "msg-1", objectType: "queue-message" },
    allowedActionClass: "execute-pack",
    correlationId: "corr-queue-1",
    idempotencyKey: "queue:msg-1",
    contentReferences: [],
    routeHint: { capability: "assistant.respond", actionPackId: "scheduled-follow-up" },
    metadata: { bucket: 1 },
    zeroCreditEligible: true,
  }, { now: NOW, ttlSeconds: 60 });
  assert.throws(() => validateOmnichannelEnvelope({ ...value, freshness: "fresh" }, { now: LATER }), /omnichannel-freshness-invalid/);
});
