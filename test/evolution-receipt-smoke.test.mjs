import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { createEvolutionController } from "../src/evolution-controller.mjs";

test("evolution receipt joins exact head, PR, CI, artifact, canary, and activation", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-evolution-smoke-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true }); t.after(() => database.close());
  const headSha = "b".repeat(40);
  const controller = createEvolutionController({
    database,
    repository: { async build() { return { headSha, changedPaths: ["src/safe.mjs"] }; } },
    verifier: { async verify() { return { conclusion: "success", headSha, workflowId: "workflow-88", pullRequestNumber: 88 }; } },
    deployer: { async deploy() { return { immutable: true, artifactId: "artifact-88", artifactSha256: "c".repeat(64), deploymentId: "pages-88" }; }, async canary() { return { state: "passed", canaryId: "canary-88" }; } },
    updater: { async activate() { return { activated: true, activationId: "activation-88" }; }, async rollback() { return { rolledBack: true, rollbackId: "rollback-88" }; } },
  });
  const candidate = controller.request({ conversationId: "con-smoke", requestSha256: "d".repeat(64), baseSha: "a".repeat(40), branch: "destiny/smoke", allowedPaths: ["src"], candidateRoot: path.join(root, "candidate"), activeRoot: path.join(root, "active") });
  for (let step = 0; step < 5; step += 1) await controller.advance(candidate.id);
  assert.deepEqual(controller.receipt(candidate.id), {
    schemaVersion: 1, candidateId: candidate.id, requestSha256: "d".repeat(64), baseSha: "a".repeat(40), headSha,
    state: "activated", pullRequestNumber: 88, workflowId: "workflow-88", artifactId: "artifact-88",
    artifactSha256: "c".repeat(64), deploymentId: "pages-88", canaryId: "canary-88", activationId: "activation-88", rollbackId: null, lastErrorCode: null,
  });
});
