import assert from "node:assert/strict";
import test from "node:test";
import { validateAnswerCompleteness } from "../deploy/cloudflare-execution-runtime/response-completeness.ts";

test("single-turn answers do not require artificial scenario numbering", () => {
  assert.deepEqual(validateAnswerCompleteness("Explain the deployment risk.", "The deployment is unsafe until verified."), { complete: true, expected: [] });
});

test("multi-scenario answers expose missing numbered sections as retryable", () => {
  assert.deepEqual(
    validateAnswerCompleteness("1) Predict. 2) Act. 3) Govern. 4) Learn.", "1) Forecast. 2) Plan."),
    { complete: false, expected: [1, 2, 3, 4], missing: [3, 4] },
  );
});

test("completed multi-scenario answers satisfy the receipt boundary", () => {
  assert.deepEqual(
    validateAnswerCompleteness("Scenario 7) AGI. Scenario 8) AGI. Scenario 9) SGI. Scenario 10) SGI.", "7) Answer. 8) Answer. 9) Answer. 10) Answer."),
    { complete: true, expected: [7, 8, 9, 10] },
  );
});
