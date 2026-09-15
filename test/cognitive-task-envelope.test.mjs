import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RuntimeDatabase } from "../src/database.mjs";
import { createContentVault } from "../src/content-vault.mjs";
import { deriveTaskPolicy, policyTaskInput } from "../src/task-policy.mjs";

const positions = [
  { individualId: "majority-a", conclusion: "deploy", confidence: 0.7, evidenceRefs: ["majority-a-evidence"], assumptions: [], unknowns: [], dissentTags: [] },
  { individualId: "majority-b", conclusion: "deploy", confidence: 0.72, evidenceRefs: ["majority-b-evidence"], assumptions: [], unknowns: [], dissentTags: [] },
  { individualId: "minority-rescue", conclusion: "hold", confidence: 0.95, evidenceRefs: ["minority-evidence"], assumptions: [], unknowns: ["causal-gap"], dissentTags: ["safety-risk"] },
];
const worker = { id: "cognitive-core", enabled: true, capabilities: ["cognitive.deliberate"], dataClasses: ["synthetic"], executionPlane: "local", costClass: "deterministic", routing: { requiresAttendedDesktop: false } };
const manifest = { defaultAutonomyMode: "local", queue: { maximumAttempts: 3 }, workers: [worker] };

async function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-cognitive-envelope-"));
  const dbPath = path.join(root, "state.sqlite");
  const vault = await createContentVault({ root: path.join(root, "vault"), masterKey: Buffer.alloc(32, 7) });
  const database = new RuntimeDatabase(dbPath, { contentVault: vault });
  return { root, dbPath, database, cleanup: () => { database.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("cognitive policy preserves bounded typed capability input", () => {
  const request = { intent: "cognitive.deliberate", requestedOutcome: "Challenge wrong-majority reasoning.", capabilityInput: { positions } };
  const policy = deriveTaskPolicy(request, { manifest, internal: true });  assert.deepEqual(policyTaskInput(request, policy, manifest).capabilityInput, request.capabilityInput);
});

test("cognitive capability input is encrypted at rest and execution-only", async (t) => {
  const { dbPath, database, cleanup } = await fixture();
  t.after(cleanup);
  const capabilityInput = { positions };
  const task = database.submitTask({
    capability: "cognitive.deliberate", dataClass: "synthetic", requestedMode: "local",
    requestedOutcome: "Challenge wrong-majority reasoning.", capabilityInput,
    idempotencyKey: "cognitive-envelope-at-rest",
  });
  assert.equal(task.capabilityInput, null);
  assert.match(task.capabilityInputReference, /^vault:/);
  assert.deepEqual(database.getTaskForExecution(task.id).capabilityInput, capabilityInput);
  const bytes = readFileSync(dbPath);
  assert.equal(bytes.includes(Buffer.from("minority-rescue")), false);
  assert.equal(bytes.includes(Buffer.from("safety-risk")), false);
});

test("capability input rejects unbounded or unsupported values", async (t) => {
  const { database, cleanup } = await fixture();
  t.after(cleanup);
  assert.throws(() => database.submitTask({
    capability: "cognitive.deliberate", dataClass: "synthetic", requestedMode: "local",
    requestedOutcome: "reject functions", capabilityInput: { positions, bad: () => true },
    idempotencyKey: "cognitive-envelope-invalid",
  }), /capability input/i);
});