import test from "node:test";
import assert from "node:assert/strict";
import { classifyMicrosoftUsageCost, isZeroMarginalCreditEligible } from "../src/microsoft-usage-cost.mjs";

test("Microsoft usage cost keeps deterministic discovery zero-credit and Studio unknown without attestation", () => {
  assert.equal(classifyMicrosoftUsageCost("powerplatform.health"), "deterministic-zero");
  assert.equal(classifyMicrosoftUsageCost("powerplatform.discover"), "deterministic-zero");
  assert.equal(classifyMicrosoftUsageCost("studio.health"), "deterministic-zero");
  assert.equal(classifyMicrosoftUsageCost("studio.delegate"), "unknown");
  assert.equal(isZeroMarginalCreditEligible("unknown"), false);
});

test("Studio delegation is zero-marginal eligible only with license-included runtime attestation", () => {
  assert.equal(classifyMicrosoftUsageCost("studio.delegate", "license-included"), "license-included");
  assert.equal(isZeroMarginalCreditEligible("license-included"), true);
  assert.equal(classifyMicrosoftUsageCost("studio.delegate", "metered"), "metered");
  assert.equal(isZeroMarginalCreditEligible("metered"), false);
});
