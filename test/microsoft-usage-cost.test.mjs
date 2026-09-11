import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCopilotHarnessUsage,
  classifyMicrosoftUsageCost,
  isZeroMarginalCreditEligible,
  validateMicrosoftBillingClass,
} from "../src/microsoft-usage-cost.mjs";

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

test("GitHub Copilot harness model-backed operations are always Copilot-credit metered", () => {
  for (const operation of ["execute", "build", "test", "evaluate"]) {
    assert.equal(classifyCopilotHarnessUsage({
      harnessType: "github-copilot-harness",
      operation,
      runtimeAttestation: "license-included",
    }), "metered-copilot-credit");
  }
  assert.equal(isZeroMarginalCreditEligible("metered-copilot-credit"), false);
  assert.equal(validateMicrosoftBillingClass("metered-copilot-credit"), "metered-copilot-credit");
});

test("harness metadata operations are deterministic-zero without invoking the harness", () => {
  for (const operation of ["discover", "inspect-metadata", "project-topology"]) {
    assert.equal(classifyCopilotHarnessUsage({ harnessType: "github-copilot-harness", operation }), "deterministic-zero");
  }
});

test("standard harness execution requires exact route billing evidence", () => {
  assert.equal(classifyCopilotHarnessUsage({ harnessType: "standard-harness", operation: "execute" }), "unknown");
  assert.equal(classifyCopilotHarnessUsage({ harnessType: "standard-harness", operation: "execute", runtimeAttestation: "license-included" }), "license-included");
  assert.equal(classifyCopilotHarnessUsage({ harnessType: "standard-harness", operation: "execute", runtimeAttestation: "metered" }), "metered");
});
