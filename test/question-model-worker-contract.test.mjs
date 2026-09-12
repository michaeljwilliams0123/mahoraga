import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("assistant responses have a dedicated transient provider worker", async () => {
  const manifest = JSON.parse(await readFile(new URL("../mahoraga.manifest.json", import.meta.url), "utf8"));
  const localCore = manifest.workers.find((item) => item.id === "local-core");
  const questionModel = manifest.workers.find((item) => item.id === "question-model");

  assert.equal(localCore.capabilities.includes("assistant.respond"), false);
  assert.deepEqual(questionModel.capabilities, ["assistant.health", "assistant.respond"]);
  assert.equal(questionModel.healthProbe, "assistant.health");
  assert.equal(questionModel.capabilityCanaries["assistant.respond"], "provider-derived");
  assert.equal(questionModel.routing.executionType, "transient-read-only");
  assert.equal(questionModel.costClass, "licensed-cloud");
});

test("question-model worker feeds real quota failures back into readiness without a paid probe", async () => {
  const source = await readFile(new URL("../src/worker-process.mjs", import.meta.url), "utf8");
  assert.match(source, /createQuestionModelExecutionState/);
  assert.match(source, /loadQuestionModelExecutionState/);
  assert.match(source, /saveQuestionModelExecutionState/);
  assert.match(source, /workerId\s*===\s*["']question-model["'][\s\S]*await loadQuestionModelExecutionState\(\)/);
  assert.match(source, /executeQuestionModel\(\{ task, executionState: questionModelExecutionState \}\)/);
  assert.match(source, /question-model-usage-limit[\s\S]*saveQuestionModelExecutionState\(questionModelExecutionState\)/);
  assert.match(source, /probeQuestionModelExecutionState/);
  assert.match(source, /probeProviderReadiness\(\)/);
});
