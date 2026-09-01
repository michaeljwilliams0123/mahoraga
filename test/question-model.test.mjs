import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuestionPrompt,
  executeQuestionModel,
  parseCodexQuestionEvents,
} from "../src/question-model.mjs";
import { createCapabilityReceipt } from "../src/receipt-registry.mjs";
import { readFile } from "node:fs/promises";

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
    task: {
      id: "mhg-question-1",
      requestedOutcome: "Why does it rain outside?",
      messages: [{ role: "user", content: "Why does it rain outside?" }],
    },
    run: async ({ prompt, sandbox, approvalPolicy, networkAccess }) => {
      assert.match(prompt, /Why does it rain outside\?/);
      assert.equal(sandbox, "read-only");
      assert.equal(approvalPolicy, "never");
      assert.equal(networkAccess, false);
      return {
        exitCode: 0,
        stdout: [
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Rain happens when moist air cools, water vapor condenses around tiny particles, and the droplets grow heavy enough to fall. Mountains, fronts, and daytime heating can all lift air and start that cooling process." } }),
          JSON.stringify({ type: "turn.completed", usage: { input_tokens: 80, output_tokens: 45 } }),
        ].join("\n"),
      };
    },
  });

  assert.equal(result.verified, true);
  assert.match(result.answer, /water vapor condenses/);
  assert.match(result.summary, /water vapor condenses/);
  assert.doesNotMatch(result.answer, /saved this assignment/i);
  assert.deepEqual(result.providerHealth, {
    availability: "healthy",
    provider: "primary-codex-question",
    executionMode: "transient-read-only",
    networkAccess: false,
    responseContentPersistedOutsideVault: false,
    usage: { inputTokens: 80, outputTokens: 45 },
  });
});

test("long question answers stay out of bounded operational receipts", async () => {
  const detailedAnswer = `Rain begins when ${"moist air cools and condensed droplets grow. ".repeat(30)}`;
  const result = await executeQuestionModel({
    task: { requestedOutcome: "Explain rain in detail." },
    run: async () => ({
      exitCode: 0,
      stdout: [
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: detailedAnswer } }),
        JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, output_tokens: 300 } }),
      ].join("\n"),
    }),
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
