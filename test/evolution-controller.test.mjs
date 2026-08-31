import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeDatabase } from "../src/database.mjs";
import { createEvolutionController } from "../src/evolution-controller.mjs";

function fixture(t, overrides = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-evolution-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const database = new RuntimeDatabase(path.join(root, "runtime.sqlite"), { allowLegacyPlaintextWrites: true });
  t.after(() => database.close());
  const baseSha = "a".repeat(40); const headSha = "b".repeat(40);
  const calls = [];
  const repository = overrides.repository ?? { async build(input) { calls.push(["build", input]); return { headSha, changedPaths: ["src/safe.mjs"] }; } };
  const verifier = overrides.verifier ?? { async verify(input) { calls.push(["verify", input]); return { conclusion: "success", headSha, workflowId: "wf-1", pullRequestNumber: 71 }; } };
  const deployer = overrides.deployer ?? {
    async deploy(input) { calls.push(["deploy", input]); return { immutable: true, artifactId: "artifact-1", artifactSha256: "c".repeat(64), deploymentId: "deployment-1" }; },
    async canary(input) { calls.push(["canary", input]); return { state: "passed", canaryId: "canary-1" }; },
  };
  const updater = overrides.updater ?? {
    async activate(input) { calls.push(["activate", input]); return { activated: true, activationId: "activation-1" }; },
    async rollback(input) { calls.push(["rollback", input]); return { rolledBack: true, rollbackId: "rollback-1" }; },
  };
  const controller = createEvolutionController({ database, repository, verifier, deployer, updater });
  return { controller, database, root, baseSha, headSha, calls };
}

function request(input) {
  return input.controller.request({
    conversationId: "con-evolution-test",
    requestSha256: "d".repeat(64),
    baseSha: input.baseSha,
    branch: "destiny/safe-evolution",
    allowedPaths: ["src"],
    candidateRoot: path.join(input.root, "candidate"),
    activeRoot: path.join(input.root, "active"),
  });
}

test("evolution advances through exact-head verification, immutable deployment, canary, and activation", async (t) => {
  const input = fixture(t); const candidate = request(input);
  assert.equal(input.database.getEvolutionCandidate(candidate.id).state, "planned");
  for (let index = 0; index < 5; index += 1) await input.controller.advance(candidate.id);
  const complete = input.controller.status(candidate.id);
  assert.equal(complete.state, "activated");
  assert.equal(complete.headSha, input.headSha);
  assert.equal(complete.artifactSha256, "c".repeat(64));
  assert.equal(complete.canaryId, "canary-1");
  assert.equal(complete.activationId, "activation-1");
  assert.deepEqual(input.calls.map(([name]) => name), ["build", "verify", "deploy", "canary", "activate"]);
  assert.ok(input.calls.every(([, call]) => Array.isArray(call.args) && call.args.every((part) => typeof part === "string")));
  assert.equal(Object.hasOwn(input.controller.receipt(candidate.id), "request"), false);
});

test("evolution rejects active-root candidates, changed-path escape, and stale CI", async (t) => {
  const input = fixture(t);
  assert.throws(() => input.controller.request({ conversationId: "con-x", requestSha256: "d".repeat(64), baseSha: input.baseSha, branch: "destiny/x", allowedPaths: ["src"], candidateRoot: input.root, activeRoot: input.root }), /candidate-active-root-forbidden/);

  const escaped = fixture(t, { repository: { async build() { return { headSha: input.headSha, changedPaths: ["outside.txt"] }; } } });
  const escapedCandidate = request(escaped);
  await assert.rejects(() => escaped.controller.advance(escapedCandidate.id), /candidate-path-forbidden/);
  assert.equal(escaped.controller.status(escapedCandidate.id).state, "failed");

  const stale = fixture(t, { verifier: { async verify() { return { conclusion: "success", headSha: "e".repeat(40), workflowId: "wf-stale", pullRequestNumber: 72 }; } } });
  const staleCandidate = request(stale); await stale.controller.advance(staleCandidate.id);
  await assert.rejects(() => stale.controller.advance(staleCandidate.id), /verification-head-mismatch/);
  assert.equal(stale.controller.status(staleCandidate.id).state, "failed");
});

test("failed canary rolls back the immutable deployed artifact", async (t) => {
  const updaterCalls = [];
  const input = fixture(t, {
    deployer: {
      async deploy() { return { immutable: true, artifactId: "artifact-2", artifactSha256: "f".repeat(64), deploymentId: "deployment-2" }; },
      async canary() { return { state: "failed", canaryId: "canary-2" }; },
    },
    updater: {
      async activate() { throw new Error("must-not-activate"); },
      async rollback(value) { updaterCalls.push(value); return { rolledBack: true, rollbackId: "rollback-2" }; },
    },
  });
  const candidate = request(input);
  await input.controller.advance(candidate.id); await input.controller.advance(candidate.id); await input.controller.advance(candidate.id);
  await assert.rejects(() => input.controller.advance(candidate.id), /canary-failed/);
  assert.equal(input.controller.status(candidate.id).state, "rolled-back");
  assert.equal(input.controller.status(candidate.id).rollbackId, "rollback-2");
  assert.equal(updaterCalls.length, 1);
});
