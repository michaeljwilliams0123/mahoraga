import test from "node:test";
import assert from "node:assert/strict";
import {
  isWorkerResult,
  type AssistantRespondResult,
} from "../contracts/worker-result.ts";

test("worker result validator accepts completed, waiting, and failed envelopes", () => {
  assert.equal(isWorkerResult({
    status: "completed",
    receipt: { id: "receipt-1", outcome: "succeeded" },
    output: { answer: "Hello" },
  }), true);
  assert.equal(isWorkerResult({ status: "waiting", reasonCode: "provider-not-ready" }), true);
  assert.equal(isWorkerResult({ status: "failed", errorCode: "provider-failed" }), true);
});

test("worker result validator rejects malformed envelopes", () => {
  assert.equal(isWorkerResult({ status: "completed", output: {} }), false);
  assert.equal(isWorkerResult({ status: "waiting" }), false);
  assert.equal(isWorkerResult({ status: "failed" }), false);
  assert.equal(isWorkerResult([]), false);
});

const invalidAssistantResult: AssistantRespondResult = {
  status: "completed",
  receipt: { id: "receipt-2", outcome: "succeeded" },
  // @ts-expect-error completed assistant responses require output.answer
  output: {},
};
void invalidAssistantResult;
