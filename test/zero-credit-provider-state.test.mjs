import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stateUrl = new URL("../state/zero-credit-provider.json", import.meta.url);

test("hard-zero provider state remains closed until standalone Free proof exists", async () => {
  const state = JSON.parse(await readFile(stateUrl, "utf8"));
  assert.equal(state.billingBoundary, "standalone-workers-free-account");
  assert.equal(state.status, "provisioning-required");
  assert.equal(state.zeroDollarStopGuaranteed, false);
  assert.equal(state.liveCognitionAuthorized, false);
  assert.equal(state.trafficAuthorityVerified, false);
});
