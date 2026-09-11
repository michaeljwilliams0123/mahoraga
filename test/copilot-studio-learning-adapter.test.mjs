import test from "node:test";
import assert from "node:assert/strict";
import { studioLearningRecordToPeerEvent } from "../src/copilot-studio-learning-adapter.mjs";

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
