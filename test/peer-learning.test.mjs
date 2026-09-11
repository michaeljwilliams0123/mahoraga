import test from "node:test";
import assert from "node:assert/strict";
import {
  PEER_LEARNING_MARKER,
  createPeerLearningEvent,
  parsePeerLearningComment,
  peerEventToInstitutionalMemory,
  validatePeerLearningEvent,
} from "../src/peer-learning.mjs";

const BASE = {
  source: "copilot-studio-mahoraga",
  eventType: "routing-learned",
  capability: "microsoft-visio-edit",
  statement: "Use the Visio application capability for semantic diagram edits and Graph for supported file transport.",
  confidence: 0.95,
  objectiveIds: ["universal-microsoft-capability"],
  evidenceRefs: ["copilot-studio:general-mahoraga"],
  observedAt: "2026-09-10T17:00:00.000Z",
};

test("peer events are deterministic metadata-only zero-credit records", () => {
  const first = createPeerLearningEvent(BASE);
  const second = createPeerLearningEvent(BASE);
  assert.deepEqual(first, second);
  assert.match(first.eventId, /^ple-[a-f0-9]{32}$/);
  assert.equal(first.dataClass, "metadata");
  assert.equal(first.zeroCredit, true);
  assert.equal(first.providerRequired, false);
});

test("peer events reject unknown sources and credential-like content", () => {
  assert.throws(() => createPeerLearningEvent({ ...BASE, source: "random-agent" }), /peer-learning-source-invalid/);
  assert.throws(() => createPeerLearningEvent({ ...BASE, statement: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz" }), /peer-learning-sensitive-content/);
});

test("marked issue comments parse one strict peer event", () => {
  const event = createPeerLearningEvent(BASE);
  const parsed = parsePeerLearningComment(`${PEER_LEARNING_MARKER}\n\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\``);
  assert.deepEqual(parsed, event);
  assert.equal(parsePeerLearningComment("ordinary issue comment"), null);
});

test("peer event ids are content-addressed and tamper evident", () => {
  const event = createPeerLearningEvent(BASE);
  assert.throws(() => validatePeerLearningEvent({ ...event, statement: `${event.statement} changed` }), /peer-learning-id-mismatch/);
});

test("peer routing lessons map into existing institutional memory", () => {
  const event = createPeerLearningEvent(BASE);
  const memory = peerEventToInstitutionalMemory(event);
  assert.equal(memory.memoryClass, "strategy");
  assert.equal(memory.capability, "microsoft-visio-edit");
  assert.equal(memory.provenance, "connected-evidence");
  assert.equal(memory.zeroCredit, true);
  assert.equal(memory.providerRequired, false);
  assert.ok(memory.evidenceRefs.includes(`peer-event:${event.eventId}`));
  assert.ok(memory.evidenceRefs.includes("peer-source:copilot-studio-mahoraga"));
});
