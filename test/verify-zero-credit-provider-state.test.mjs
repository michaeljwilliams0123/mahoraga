import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("zero-credit gate verifier passes only the fail-closed checked-in state", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-zero-credit-provider-state.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "provisioning-required");
  assert.equal(receipt.liveCognitionAuthorized, false);
  assert.equal(receipt.zeroDollarStopGuaranteed, false);
});
