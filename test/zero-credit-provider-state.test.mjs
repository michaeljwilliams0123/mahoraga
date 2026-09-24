import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stateUrl = new URL("../state/zero-credit-provider.json", import.meta.url);

test("hard-zero provider state remains closed until the daily free-allocation budget is proven live", async () => {
  const state = JSON.parse(await readFile(stateUrl, "utf8"));
  assert.equal(state.billingBoundary, "daily-free-allocation-budget");
  assert.equal(state.cloudflareFreeAllocationNeurons, 10000);
  assert.equal(state.mahoragaDailyBudgetNeurons, 9000);
  assert.equal(state.status, "budget-guard-implemented");
  assert.equal(state.zeroDollarStopGuaranteed, false);
  assert.equal(state.liveCognitionAuthorized, false);
  assert.equal(state.trafficAuthorityVerified, false);
});
