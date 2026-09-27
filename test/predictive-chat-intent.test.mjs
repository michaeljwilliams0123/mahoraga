import test from "node:test";
import assert from "node:assert/strict";
import { parsePredictiveChatIntent } from "../src/predictive-chat-intent.ts";

const request = '/predict {"observedState":{"queueDepth":4},"stateUncertainty":0.2,"action":{"actionId":"add-capacity","effects":{"queueDepth":-2},"uncertainty":0.1}}';

test("only explicit bounded scenario requests become predictive inputs", () => {
  assert.equal(parsePredictiveChatIntent("Predict tomorrow's demand"), null);
  assert.equal(parsePredictiveChatIntent("Please /predict {bad}"), null);
  assert.deepEqual(parsePredictiveChatIntent(request), {
    observedState: { queueDepth: 4 }, stateUncertainty: 0.2,
    action: { actionId: "add-capacity", effects: { queueDepth: -2 }, uncertainty: 0.1 },
  });
});

test("malformed, oversized, and expanded requests fail closed", () => {
  for (const input of ["/predict", "/predict {bad}", '/predict {"observedState":{}}', `${request} trailing`, `/predict ${"x".repeat(1001)}`]) {
    assert.throws(() => parsePredictiveChatIntent(input), /predictive-chat-input-invalid/);
  }
});
