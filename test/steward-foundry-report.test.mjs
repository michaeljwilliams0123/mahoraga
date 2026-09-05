import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStewardFoundryReport,
  STEWARD_FOUNDRY_REPORT_KIND,
} from "../src/steward-foundry-report.mjs";

test("a schemaVersion-1 empty plan list is a legal hold, not a crash", () => {
  const report = normalizeStewardFoundryReport({ schemaVersion: 1, plannedCount: 0, plans: [] });
  assert.equal(report.kind, STEWARD_FOUNDRY_REPORT_KIND);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.plannedCount, 0);
  assert.equal(report.nextAction, "hold-planned");
  assert.equal(report.creditCost, 0);
  assert.equal(report.paidFallback, false);
  assert.equal(report.zeroCredit, true);
});

test("missing schemaVersion is the production two-hour crash shape and stays invalid", () => {
  assert.throws(
    () => normalizeStewardFoundryReport({ plannedCount: 0, plans: [] }),
    (error) => error instanceof TypeError && error.message === "steward-agent-foundry-report-invalid",
  );
});

test("plans without a matching plannedCount fail closed", () => {
  assert.throws(
    () => normalizeStewardFoundryReport({ schemaVersion: 1, plannedCount: 2, plans: [] }),
    (error) => error.message === "steward-agent-foundry-report-invalid",
  );
});

test("paid contamination never becomes a foundry apply", () => {
  assert.throws(
    () => normalizeStewardFoundryReport({ schemaVersion: 1, plans: [], paidFallback: true }),
    (error) => error.message === "paid-fallback-forbidden",
  );
  assert.throws(
    () => normalizeStewardFoundryReport({ schemaVersion: 1, plans: [], spendGrantUsd: 1 }),
    (error) => error.message === "spend-grant-not-zero",
  );
});

test("a non-empty valid report applies foundry at $0", () => {
  const report = normalizeStewardFoundryReport({
    schemaVersion: 1,
    plannedCount: 1,
    plans: [{ schemaVersion: 1, gapId: "primary-codex-builder" }],
  });
  assert.equal(report.nextAction, "apply-foundry");
  assert.equal(report.plannedCount, 1);
  assert.equal(JSON.stringify(report).includes("prompt"), false);
});
