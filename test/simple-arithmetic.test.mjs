import test from "node:test";
import assert from "node:assert/strict";
import { executeSimpleArithmetic, recognizeSimpleArithmetic } from "../src/simple-arithmetic.mjs";

test("answers bounded arithmetic without a model invocation", () => {
  assert.deepEqual(recognizeSimpleArithmetic("2+2"), { expression: "2+2", answer: "4" });
  const result = executeSimpleArithmetic({ requestedOutcome: "What is (12 - 2) / 5?" });
  assert.equal(result.answer, "2");
  assert.equal(result.summary, "2");
  assert.equal(result.modelInvocations, 0);
  assert.equal(result.verified, true);
});

test("honors precedence, decimals, and unary signs", () => {
  assert.equal(recognizeSimpleArithmetic("calculate: -2 + 3 * 4")?.answer, "10");
  assert.equal(recognizeSimpleArithmetic(".5 + .25")?.answer, "0.75");
});

test("rejects non-arithmetic, unsafe, invalid, and unbounded input", () => {
  for (const value of ["2 + process.exit()", "sqrt(4)", "1 / 0", "2 ** 8", "1e309", "(".repeat(121)]) {
    assert.equal(recognizeSimpleArithmetic(value), null, value);
  }
});
