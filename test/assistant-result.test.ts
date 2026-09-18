import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAssistantCompletion } from "../src/assistant-result.ts";
import type { AssistantRespondResult } from "../contracts/worker-result.ts";

test("assistant completion requires a trimmed non-empty answer", () => {
  assert.deepEqual(
    normalizeAssistantCompletion({ answer: "  Hello  " }),
    { answer: "Hello" },
  );
  assert.equal(normalizeAssistantCompletion({ summary: "Hello" }), null);
  assert.equal(normalizeAssistantCompletion({ answer: "" }), null);
  assert.equal(normalizeAssistantCompletion({ answer: "   " }), null);
  assert.equal(normalizeAssistantCompletion([]), null);
});

const invalidAssistantCompletion: AssistantRespondResult = {
  status: "completed",
  receipt: { id: "receipt-invalid", outcome: "succeeded" },
  // @ts-expect-error completed assistant responses require output.answer
  output: {},
};
void invalidAssistantCompletion;
