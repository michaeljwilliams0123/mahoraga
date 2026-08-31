import test from "node:test";
import assert from "node:assert/strict";
import { terminalRunType, validateRunEvent } from "../src/run-event-contract.mjs";

const base = {
  schemaVersion: 1,
  eventId: 1,
  sessionId: "ses-local",
  conversationId: "con-00000000-0000-4000-8000-000000000001",
  runId: "run-00000000-0000-4000-8000-000000000002",
  agentId: "local-core",
  type: "run-start",
  timestamp: "2026-08-31T00:00:00.000Z",
  payload: { requestSha256: "a".repeat(64), requestBytes: 42 },
};

test("run event validation rejects persisted conversation plaintext", () => {
  assert.throws(() => validateRunEvent({ ...base, payload: { content: "private request" } }), /run-event-payload-private/);
  assert.throws(() => validateRunEvent({ ...base, payload: { nested: { prompt: "private request" } } }), /run-event-payload-private/);
});

test("run event validation accepts bounded operational evidence", () => {
  const event = validateRunEvent(base);
  assert.equal(event.payload.requestBytes, 42);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(terminalRunType("run-completed"), true);
  assert.equal(terminalRunType("tool-result"), false);
});
