import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  buildQuestionPrompt,
  executeQuestionModel,
  parseCodexQuestionEvents,
  probeQuestionModel,
} from "../src/question-model.mjs";
import { createCapabilityReceipt } from "../src/receipt-registry.mjs";
import { mkdtemp, readFile, rm } from "node:fs/promises";

test("question prompt requests a direct detailed answer without granting action authority", () => {
  const prompt = buildQuestionPrompt({
    requestedOutcome: "Why does it rain?",
    messages: [{ role: "user", content: "Why does it rain?" }],
  });
  assert.match(prompt, /answer the owner's question directly/i);
  assert.match(prompt, /do not modify files/i);
  assert.match(prompt, /Why does it rain\?/);
  assert.doesNotMatch(prompt, /merge-after-verify/i);
});

test("Codex question events retain only the final answer and bounded usage", () => {
  const parsed = parseCodexQuestionEvents([
    JSON.stringify({ type: "thread.started", thread_id: "thread-12345678" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Rain forms when condensed droplets become heavy enough to fall from clouds." } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 120, output_tokens: 34 } }),
  ].join("\n"));
  assert.equal(parsed.completed, true);
  assert.match(parsed.finalText, /condensed droplets/);
  assert.deepEqual(parsed.usage, { inputTokens: 120, outputTokens: 34 });
});

test("question model returns a substantive answer rather than a durable-assignment acknowledgement", async () => {
  const result = await executeQuestionModel({
    task: { id: "mhg-question-1", requestedOutcome: "Why does it rain outside?", messages: [{ role: "user", content: "Why does it rain outside?" }] },
    run: async ({ prompt, sandbox, approvalPolicy, networkAccess }) => {
      assert.match(prompt, /Why does it rain outside\?/);
      assert.equal(sandbox, "read-only");
      assert.equal(approvalPolicy, "never");
      assert.equal(networkAccess, false);
      return { exitCode: 0, stdout: [
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Rain happens when moist air cools, water vapor condenses around tiny particles, and the droplets grow heavy enough to fall. Mountains, fronts, and daytime heating can all lift air and start that cooling process." } }),
        JSON.stringify({ type: "turn.completed", usage: { input_tokens: 80, output_tokens: 45 } }),
      ].join("\n") };
    },
  });
  assert.equal(result.verified, true);
  assert.match(result.answer, /water vapor condenses/);
  assert.match(result.summary, /water vapor condenses/);
  assert.doesNotMatch(result.answer, /saved this assignment/i);
  assert.deepEqual(result.providerHealth, {
    availability: "healthy", provider: "primary-codex-question", executionMode: "transient-read-only",
    networkAccess: false, responseContentPersistedOutsideVault: false, usage: { inputTokens: 80, outputTokens: 45 },
  });
});

test("long question answers stay out of bounded operational receipts", async () => {
  const detailedAnswer = `Rain begins when ${"moist air cools and condensed droplets grow. ".repeat(30)}`;
  const result = await executeQuestionModel({
    task: { requestedOutcome: "Explain rain in detail." },
    run: async () => ({ exitCode: 0, stdout: [
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: detailedAnswer } }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, output_tokens: 300 } }),
    ].join("\n") }),
  });
  const receipt = createCapabilityReceipt("assistant.respond", result);
  assert.equal(result.answer, detailedAnswer.trim());
  assert.ok(receipt.summary.length <= 512);
  assert.equal("answer" in receipt.details.outputEvidence, false);
});

test("question model uses the installed Codex 0.145 approval configuration", async () => {
  const source = await readFile(new URL("../src/question-model.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /--ask-for-approval/);
  assert.match(source, /approval_policy=\\"never\\"/);
});

test("question-model health fails closed when the Codex executable is not callable", async () => {
  const result = await probeQuestionModel({ findCli: async () => "C:\\trusted\\codex.exe", runVersion: async () => ({ exitCode: 1, stderr: "Access is denied" }) });
  assert.equal(result.verified, false);
  assert.equal(result.providerHealth.availability, "unavailable");
  assert.equal(result.providerHealth.invocation, "not-callable");
});

test("question model classifies Codex quota exhaustion instead of generic incompleteness", async () => {
  const resetMessage = "You've hit your usage limit. Upgrade to Pro or try again at Sep 15th, 2026 8:25 AM.";
  await assert.rejects(() => executeQuestionModel({
    task: { requestedOutcome: "Answer this live acceptance prompt." },
    run: async () => ({ exitCode: 1, stdout: [
      JSON.stringify({ type: "error", message: resetMessage }), JSON.stringify({ type: "turn.failed", error: { message: resetMessage } }),
    ].join("\n"), stderr: "" }),
  }), (error) => error?.code === "question-model-usage-limit" && /usage limit/i.test(error.message));
});

test("question-model execution state fails closed after quota exhaustion without another model call", async () => {
  const mod = await import("../src/question-model.mjs");
  assert.equal(typeof mod.createQuestionModelExecutionState, "function");
  assert.equal(typeof mod.probeQuestionModelExecutionState, "function");
  const state = mod.createQuestionModelExecutionState();
  const resetMessage = "You've hit your usage limit. Try again at Sep 15th, 2099 8:25 AM.";
  await assert.rejects(() => executeQuestionModel({
    task: { requestedOutcome: "Answer this live acceptance prompt." }, executionState: state,
    run: async () => ({ exitCode: 1, stdout: JSON.stringify({ type: "turn.failed", error: { message: resetMessage } }), stderr: "" }),
  }), (error) => error?.code === "question-model-usage-limit");
  const readiness = mod.probeQuestionModelExecutionState({ executionState: state, now: Date.parse("2026-09-12T05:00:00Z") });
  assert.equal(readiness.verified, false);
  assert.equal(readiness.providerHealth.availability, "unavailable");
  assert.equal(readiness.providerHealth.reasonCode, "question-model-usage-limit");
  assert.match(readiness.providerHealth.retryAfter, /^2099-/);
});

test("question-model quota backoff survives worker restart without persisting conversation content", async () => {
  const mod = await import("../src/question-model.mjs");
  assert.equal(typeof mod.saveQuestionModelExecutionState, "function");
  assert.equal(typeof mod.loadQuestionModelExecutionState, "function");
  const directory = await mkdtemp(path.join(tmpdir(), "mahoraga-question-model-"));
  const file = path.join(directory, "question-model-execution-state.json");
  try {
    const state = mod.createQuestionModelExecutionState();
    state.reasonCode = "question-model-usage-limit";
    state.blockedUntil = "2099-09-15T12:25:00.000Z";
    await mod.saveQuestionModelExecutionState(state, { file });
    const restarted = await mod.loadQuestionModelExecutionState({ file });
    assert.deepEqual(restarted, { reasonCode: "question-model-usage-limit", blockedUntil: "2099-09-15T12:25:00.000Z" });
    const readiness = mod.probeQuestionModelExecutionState({ executionState: restarted, now: Date.parse("2026-09-12T05:00:00Z") });
    assert.equal(readiness.verified, false);
    assert.equal(readiness.providerHealth.reasonCode, "question-model-usage-limit");
    const persisted = JSON.parse(await readFile(file, "utf8"));
    assert.deepEqual(Object.keys(persisted).sort(), ["blockedUntil", "reasonCode", "schemaVersion"].sort());
    assert.equal(persisted.schemaVersion, 1);
    assert.equal(JSON.stringify(persisted).includes("Answer this live acceptance prompt"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("question-model persisted backoff follows the runtime artifact state root when no database env is inherited", async () => {
  const mod = await import("../src/question-model.mjs");
  const runtimeRoot = path.join(tmpdir(), "mahoraga-candidate-state");
  const artifactRoot = path.join(runtimeRoot, "artifacts");
  const resolved = mod.resolveQuestionModelExecutionStatePath({
    root: path.join(tmpdir(), "repo-checkout"),
    env: { MAHORAGA_ARTIFACT_ROOT: artifactRoot },
  });
  assert.equal(resolved, path.join(runtimeRoot, "question-model-execution-state.json"));
});
