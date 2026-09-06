import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { createEvolutionController } from "../src/evolution-controller.mjs";

function createDatabase() {
  let candidate = null;
  return {
    createEvolutionCandidate(input) {
      candidate = { id: "candidate-1", state: "planned", ...input };
      return candidate;
    },
    updateEvolutionCandidate(id, patch) {
      assert.equal(id, "candidate-1");
      candidate = { ...candidate, ...patch };
      return candidate;
    },
    getEvolutionCandidate(id) {
      return id === "candidate-1" ? candidate : null;
    },
  };
}

function controllerFor(build) {
  const database = createDatabase();
  const controller = createEvolutionController({
    database,
    repository: { build },
    verifier: { async verify() { throw new Error("not-reached"); } },
    deployer: {
      async deploy() { throw new Error("not-reached"); },
      async canary() { throw new Error("not-reached"); },
    },
    updater: {
      async activate() { throw new Error("not-reached"); },
      async rollback() { throw new Error("not-reached"); },
    },
  });
  return { controller, database };
}

function request(controller) {
  return controller.request({
    conversationId: "con-pdf-authority-wiring",
    requestSha256: "d".repeat(64),
    baseSha: "a".repeat(40),
    branch: "upgrade/pdf-authority-wiring-test",
    allowedPaths: ["src"],
    candidateRoot: path.join(os.tmpdir(), "mahoraga-pdf-authority-candidate"),
    activeRoot: path.join(os.tmpdir(), "mahoraga-pdf-authority-active"),
  });
}

function validEnvelope(overrides = {}) {
  return {
    id: "mutation-1",
    targetPath: "src/safe.mjs",
    source: "export const safe = true;",
    costClass: "deterministic",
    signed: true,
    sandboxPassed: true,
    benchmarkPassed: true,
    rollbackCheckpoint: true,
    quorumVotes: 2,
    privateMesh: true,
    publicIngress: false,
    usesRuntimeEval: false,
    touchesProtectedRoot: false,
    commitsSecrets: false,
    ...overrides,
  };
}

test("generated candidate is rejected when mutation authority envelope is missing", async () => {
  const input = controllerFor(async () => ({
    generated: true,
    headSha: "b".repeat(40),
    changedPaths: ["src/safe.mjs"],
  }));
  const candidate = request(input.controller);

  await assert.rejects(() => input.controller.advance(candidate.id), /pdf-authority-mutation-envelope-required/);
  assert.equal(input.database.getEvolutionCandidate(candidate.id).state, "failed");
});

test("generated candidate is rejected when mutation authority envelope is unsafe", async () => {
  const input = controllerFor(async () => ({
    generated: true,
    headSha: "b".repeat(40),
    changedPaths: ["src/safe.mjs"],
    mutationEnvelopes: [validEnvelope({ costClass: "metered-cloud" })],
  }));
  const candidate = request(input.controller);

  await assert.rejects(() => input.controller.advance(candidate.id), /metered-cloud-cost-class/);
  assert.equal(input.database.getEvolutionCandidate(candidate.id).state, "failed");
});

test("generated candidate rejects envelopes that do not target an actual changed path", async () => {
  const input = controllerFor(async () => ({
    generated: true,
    headSha: "b".repeat(40),
    changedPaths: ["src/safe.mjs"],
    mutationEnvelopes: [validEnvelope({ targetPath: "src/not-changed.mjs" })],
  }));
  const candidate = request(input.controller);

  await assert.rejects(() => input.controller.advance(candidate.id), /pdf-authority-envelope-target-not-changed/);
  assert.equal(input.database.getEvolutionCandidate(candidate.id).state, "failed");
});

test("generated candidate becomes candidate-created only after a valid mutation authority envelope passes", async () => {
  const input = controllerFor(async () => ({
    generated: true,
    headSha: "b".repeat(40),
    changedPaths: ["src/safe.mjs"],
    mutationEnvelopes: [validEnvelope()],
  }));
  const candidate = request(input.controller);

  const advanced = await input.controller.advance(candidate.id);
  assert.equal(advanced.state, "candidate-created");
  assert.equal(advanced.headSha, "b".repeat(40));
});

test("manual deterministic candidate remains compatible without mutation authority envelope", async () => {
  const input = controllerFor(async () => ({
    headSha: "b".repeat(40),
    changedPaths: ["src/safe.mjs"],
  }));
  const candidate = request(input.controller);

  const advanced = await input.controller.advance(candidate.id);
  assert.equal(advanced.state, "candidate-created");
});
