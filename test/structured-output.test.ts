import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredOutput, validateStructuredOutput } from "../src/structured-output.ts";

const schema = { type: "object", additionalProperties: false, required: ["score", "tags"], properties: {
  score: { type: "number", minimum: 0, maximum: 1 },
  tags: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: ["repair", "hold"] } },
} };
test("structured generation validates nested constraints without coercion", () => {
  assert.deepEqual(parseStructuredOutput('{"score":0.8,"tags":["repair"]}', schema), { score: 0.8, tags: ["repair"] });
  for (const value of [{ score: "0.8", tags: ["repair"] }, { score: 2, tags: ["repair"] }, { score: 0.8, tags: [] }, { score: 0.8, tags: ["execute"] }, { score: 0.8, tags: ["hold"], secret: true }]) {
    assert.throws(() => validateStructuredOutput(value, schema), /structured-output-mismatch/);
  }
});
test("unsupported schemas and oversized or fenced outputs fail closed", () => {
  assert.throws(() => parseStructuredOutput("```json\n{}\n```", schema), /structured-output-json-invalid/);
  assert.throws(() => parseStructuredOutput(" ".repeat(70_000), schema), /structured-output-too-large/);
  assert.throws(() => validateStructuredOutput({}, { type: "object", patternProperties: {} }), /structured-schema-unsupported/);
  assert.throws(() => validateStructuredOutput({}, { type: "object", required: ["absent"], properties: {} }), /structured-schema-invalid/);
});
