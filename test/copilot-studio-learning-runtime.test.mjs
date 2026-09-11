import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRuntime } from "../src/runtime.mjs";
import { createCapabilityReceipt } from "../src/receipt-registry.mjs";

const TOKEN = "studio-learning-runtime-token-000000000001";
const VAULT_KEY = Buffer.alloc(32, 29);

test("authenticated owner bridge admits only verified Studio execution evidence", { concurrency: false }, async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-studio-learning-runtime-"));
  const runtime = await startRuntime({
    port: 0,
    databaseFile: path.join(root, "runtime.sqlite"),
    artifactRoot: path.join(root, "artifacts"),
    contentVaultMasterKey: VAULT_KEY,
    primaryCodexToken: TOKEN,
    syncCoordinationMailbox: false,
  });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const source = runtime.database.submitTask({
    capability: "studio.delegate", dataClass: "personal", requestedMode: "hybrid",
    idempotencyKey: "studio-runtime-learning-source", correlationId: "studio-eval-runtime-1",
  });
  runtime.database.claimNext({ workerId: "copilot-studio", capabilities: ["studio.delegate"], leaseMs: 5000 });
  runtime.database.markVerifying(source.id, "copilot-studio:test");
  runtime.database.completeTaskWithReceipt(source.id, createCapabilityReceipt("studio.delegate", {
    verified: true,
    summary: "Studio delegation completed with authenticated evidence.",
    providerReceipt: { providerClass: "copilot-studio", authenticated: true, conversationEstablished: true },
  }));
  const body = JSON.stringify({ sourceTaskId: source.id, record: {
    correlation_id: "studio-eval-runtime-1", capability: "microsoft-visio-edit",
    evidence_references: ["studio-eval:runtime-1"], provenance: "copilot-studio-evaluate", confidence: 0.93,
    peer_event_type: "routing-learned", statement: "Prefer the verified Visio-capable route for semantic diagram edits.",
    objective_ids: ["universal-microsoft-capability"], observed_at: "2026-09-11T05:20:00.000Z",
    objective: "Improve Microsoft capability routing", source: "General Mahoraga evaluation",
    unknowns: [], recommended_next_action: "admit lesson",
  } });
  const unauthenticated = await fetch(`${base}/api/intake/primary-codex/studio-learning`, {
    method: "POST", headers: { "content-type": "application/json" }, body,
  });
  assert.equal(unauthenticated.status, 401);

  const response = await fetch(`${base}/api/intake/primary-codex/studio-learning`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body,
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ingestion.duplicate, false);
  assert.match(payload.ingestion.peerEventId, /^ple-[a-f0-9]{32}$/);
  assert.match(payload.ingestion.memoryId, /^mem-[a-f0-9]{32}$/);
  assert.equal(runtime.database.listStudioLearningIngestions().length, 1);
});
