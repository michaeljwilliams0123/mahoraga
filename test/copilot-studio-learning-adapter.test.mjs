import test from "node:test";
import assert from "node:assert/strict";
import * as studioLearning from "../src/copilot-studio-learning-adapter.mjs";
const { studioLearningRecordToPeerEvent } = studioLearning;

const APPROVED = {
  correlation_id: "studio-eval-42",
  objective: "Improve Microsoft capability routing",
  capability: "microsoft-visio-edit",
  source: "General Mahoraga evaluation",
  evidence_references: ["studio-eval:test-case-42"],
  provenance: "copilot-studio-evaluate",
  confidence: 0.92,
  unknowns: [],
  verification_state: "verified",
  approval_state: "approved",
  recommended_next_action: "admit lesson",
  peer_event_type: "routing-learned",
  statement: "Prefer the verified Visio-capable route for semantic diagram edits.",
  objective_ids: ["universal-microsoft-capability"],
  observed_at: "2026-09-11T03:58:00.000Z",
};

test("approved verified Studio lesson maps to strict peer event", () => {
  const event = studioLearningRecordToPeerEvent(APPROVED);
  assert.equal(event.source, "copilot-studio-mahoraga");
  assert.equal(event.eventType, "routing-learned");
  assert.equal(event.capability, "microsoft-visio-edit");
  assert.equal(event.confidence, 0.92);
  assert.deepEqual(event.objectiveIds, ["universal-microsoft-capability"]);
  assert.ok(event.evidenceRefs.includes("studio-eval:test-case-42"));
  assert.ok(event.evidenceRefs.includes("studio-correlation:studio-eval-42"));
  assert.equal(event.dataClass, "metadata");
  assert.equal(event.zeroCredit, true);
});
test("unapproved or unverified Studio lessons fail closed", () => {
  assert.throws(
    () => studioLearningRecordToPeerEvent({ ...APPROVED, approval_state: "proposed" }),
    /studio-learning-not-approved/,
  );
  assert.throws(
    () => studioLearningRecordToPeerEvent({ ...APPROVED, verification_state: "unverified" }),
    /studio-learning-not-verified/,
  );
});

test("Studio adapter rejects unsupported event classes and sensitive evidence", () => {
  assert.throws(
    () => studioLearningRecordToPeerEvent({ ...APPROVED, peer_event_type: "arbitrary" }),
    /peer-learning-event-type-invalid/,
  );
  assert.throws(
    () => studioLearningRecordToPeerEvent({
      ...APPROVED,
      evidence_references: ["Authorization: Bearer abcdefghijklmnopqrstuvwxyz"],
    }),
    /peer-learning-sensitive-content/,
  );
});
test("runtime Studio learning ingestion requires trusted completed Studio evidence and persists metadata only", () => {
  assert.equal(typeof studioLearning.ingestVerifiedStudioLearning, "function");
  const proposal = Object.fromEntries(Object.entries(APPROVED).filter(([key]) => !["approval_state", "verification_state"].includes(key)));
  let persisted = null;
  const database = {
    getTask: () => ({ id: "task-studio-1", capability: "studio.delegate", status: "completed", assignedWorker: "copilot-studio", correlationId: proposal.correlation_id }),
    listReceipts: () => [{ capability: "studio.delegate", outcome: "succeeded", receipt: { details: { verified: true, providerEvidence: { authenticated: true, conversationEstablished: true } } } }],
    recordStudioLearningIngestion: (value) => { persisted = value; return { peerEventId: value.peerEvent.eventId, memoryId: value.memory.memoryId, receiptId: "slr-1", duplicate: false }; },
  };
  const result = studioLearning.ingestVerifiedStudioLearning({ database, sourceTaskId: "task-studio-1", record: proposal });
  assert.equal(result.duplicate, false);
  assert.equal(persisted.peerEvent.source, "copilot-studio-mahoraga");
  assert.equal(persisted.memory.zeroCredit, true);
  assert.equal(persisted.memory.providerRequired, false);
  assert.equal(persisted.sourceTaskId, "task-studio-1");
});

test("runtime Studio learning ingestion rejects caller-selected trust and unverified provider evidence", () => {
  assert.equal(typeof studioLearning.ingestVerifiedStudioLearning, "function");
  const proposal = Object.fromEntries(Object.entries(APPROVED).filter(([key]) => !["approval_state", "verification_state"].includes(key)));
  const base = {
    getTask: () => ({ id: "task-studio-2", capability: "studio.delegate", status: "completed", assignedWorker: "copilot-studio", correlationId: proposal.correlation_id }),
    listReceipts: () => [{ capability: "studio.delegate", outcome: "succeeded", receipt: { details: { verified: true, providerEvidence: { authenticated: false } } } }],
    recordStudioLearningIngestion: () => { throw new Error("should-not-persist"); },
  };
  assert.throws(() => studioLearning.ingestVerifiedStudioLearning({ database: base, sourceTaskId: "task-studio-2", record: { ...proposal, approval_state: "approved" } }), /studio-learning-trust-field-forbidden/);
  assert.throws(() => studioLearning.ingestVerifiedStudioLearning({ database: base, sourceTaskId: "task-studio-2", record: proposal }), /studio-learning-provider-evidence-unverified/);
});