export const STEWARD_FOUNDRY_REPORT_KIND = "steward-foundry-report";
export const STEWARD_FOUNDRY_REPORT_SCHEMA_VERSION = 1;

export function normalizeStewardFoundryReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("steward-agent-foundry-report-invalid");
  if (value.paidFallback === true) fail("paid-fallback-forbidden");
  if (typeof value.spendGrantUsd === "number" && value.spendGrantUsd !== 0) fail("spend-grant-not-zero");
  if (value.zeroCredit === false) fail("paid-fallback-forbidden");
  if (value.schemaVersion !== STEWARD_FOUNDRY_REPORT_SCHEMA_VERSION || !Array.isArray(value.plans)) {
    fail("steward-agent-foundry-report-invalid");
  }
  const plannedCount = value.plannedCount ?? value.plans.length;
  if (!Number.isInteger(plannedCount) || plannedCount !== value.plans.length || plannedCount < 0 || plannedCount > 512) {
    fail("steward-agent-foundry-report-invalid");
  }
  return Object.freeze({
    schemaVersion: STEWARD_FOUNDRY_REPORT_SCHEMA_VERSION,
    kind: STEWARD_FOUNDRY_REPORT_KIND,
    plannedCount,
    plans: Object.freeze([...value.plans]),
    zeroCredit: true,
    nextAction: plannedCount === 0 ? "hold-planned" : "apply-foundry",
    creditCost: 0,
    paidFallback: false,
  });
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
