import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCloudComputeBudget, MAX_ACTIVE_DURATION_MS } from "../src/cloud-compute-budget.mjs";

const now = new Date("2026-09-02T20:00:00.000Z");
const readyTelemetry = () => ({ observedAt: "2026-09-02T19:59:00.000Z", billingState: "verified-zero", metered: false, normalCreditBudget: 0, hostedComputeSpendCeilingUsd: 0, priceUsd: 0, spendUsd: 0, projectedSpendUsd: 0, projectedCoreHours: 0, zeroDollarStopGuaranteed: true, stopUsageEvidence: { active: true, observedAt: "2026-09-02T19:59:00.000Z" } });

test("admits only fresh verified zero-dollar compute telemetry", () => {
  const decision = evaluateCloudComputeBudget({ telemetry: readyTelemetry(), now });
  assert.equal(decision.ok, true);
  assert.equal(decision.limits.maximumActiveDurationMs, MAX_ACTIVE_DURATION_MS);
});

test("blocks stale, unknown billing, spend, metered, and missing stop evidence", () => {
  const cases = [
    [{ ...readyTelemetry(), observedAt: "2026-09-02T19:00:00.000Z" }, "cloud-budget-telemetry-stale"],
    [{ ...readyTelemetry(), billingState: "unknown" }, "cloud-budget-billing-not-verified-zero"],
    [{ ...readyTelemetry(), spendUsd: 0.01 }, "cloud-budget-spendUsd-not-zero"],
    [{ ...readyTelemetry(), metered: true }, "cloud-budget-metered-or-unknown"],
    [{ ...readyTelemetry(), stopUsageEvidence: null }, "cloud-budget-stop-usage-evidence-missing"],
    [{ ...readyTelemetry(), stopUsageEvidence: { active: true, observedAt: "2026-09-02T19:00:00.000Z" } }, "cloud-budget-stop-usage-evidence-stale"],
    [{ ...readyTelemetry(), projectedCoreHours: 1 }, "cloud-budget-projected-core-hours-exceed-limit"],
  ];
  for (const [telemetry, reason] of cases) assert.equal(evaluateCloudComputeBudget({ telemetry, now }).reason, reason);
});
