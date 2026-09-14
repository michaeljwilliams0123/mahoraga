import test from "node:test";
import assert from "node:assert/strict";
import { zeroCreditChatTaskRequestedMode } from "../src/server.mjs";

test("zero-credit chat tasks persist the zero-credit routing mode", () => {
  assert.equal(zeroCreditChatTaskRequestedMode("zero-codex", "hybrid"), "zero-credit");
  assert.equal(zeroCreditChatTaskRequestedMode("standard", "hybrid"), "hybrid");
  assert.equal(zeroCreditChatTaskRequestedMode("licensed-approved", "hybrid"), "hybrid");
});
