import test from "node:test";
import assert from "node:assert/strict";

import { classifyChatTurn } from "../src/chat-intake.mjs";

const CAPABILITIES = ["assistant.respond", "artifact.inspect", "repository.inspect", "system.health", "repair.scan"];

test("Auto treats a general question as an answer, not a merge candidate", () => {
  assert.deepEqual(classifyChatTurn({
    mode: "auto",
    content: "Can you explain why it rains outside?",
    availableCapabilities: CAPABILITIES,
  }), {
    mode: "ask",
    execution: "task",
    capability: "assistant.respond",
    intentKind: "answer",
    reasonCode: "general-question",
  });
});

test("Act executes a registered operation and escalates a general change to an objective", () => {
  assert.deepEqual(classifyChatTurn({
    mode: "act",
    content: "Inspect the current repository and summarize its production state",
    availableCapabilities: CAPABILITIES,
  }), {
    mode: "act",
    execution: "task",
    capability: "repository.inspect",
    intentKind: "repository-inspect",
    reasonCode: "repository-inspection",
  });

  assert.deepEqual(classifyChatTurn({
    mode: "act",
    content: "Update the Mahoraga interface and apply the change",
    availableCapabilities: CAPABILITIES,
  }), {
    mode: "act",
    execution: "objective",
    capability: null,
    intentKind: "autonomous-action",
    reasonCode: "explicit-action-request",
  });
});

test("Ask with an attachment inspects the artifact instead of discarding it", () => {
  assert.deepEqual(classifyChatTurn({
    mode: "ask",
    content: "What is shown in this screenshot?",
    attachmentCount: 1,
    availableCapabilities: CAPABILITIES,
  }), {
    mode: "ask",
    execution: "task",
    capability: "artifact.inspect",
    intentKind: "attachment",
    reasonCode: "attachment-present",
  });
});
