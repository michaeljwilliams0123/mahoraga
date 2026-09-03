export const MAX_ACTIVE_DURATION_MS = 110 * 60 * 1000;
export const DEFAULT_TELEMETRY_MAX_AGE_MS = 5 * 60 * 1000;
const ZERO_FIELDS = ["normalCreditBudget", "normalCreditBudgetUsd", "hostedComputeSpendCeilingUsd", "priceUsd", "spendUsd", "projectedSpendUsd"];

export function evaluateCloudComputeBudget({ telemetry = {}, now = new Date(), telemetryMaxAgeMs = DEFAULT_TELEMETRY_MAX_AGE_MS, softCoreHoursLimit = 0, hostedComputeSpendCeilingUsd = 0 } = {}) {
  const observedAt = parseTime(telemetry.observedAt);
  const nowMs = parseTime(now);
  const limits = Object.freeze({ hostedComputeSpendCeilingUsd, softCoreHoursLimit, maximumActiveDurationMs: MAX_ACTIVE_DURATION_MS, telemetryMaxAgeMs });
  if (!Number.isFinite(nowMs)) return blocked("invalid-now", limits);
  if (!observedAt) return blocked("cloud-budget-telemetry-missing", limits);
  if (nowMs - observedAt > telemetryMaxAgeMs) return blocked("cloud-budget-telemetry-stale", limits);
  if (telemetry.billingState !== "verified-zero") return blocked("cloud-budget-billing-not-verified-zero", limits);
  if (telemetry.metered !== false) return blocked("cloud-budget-metered-or-unknown", limits);
  if (telemetry.zeroDollarStopGuaranteed !== true) return blocked("cloud-budget-stop-guarantee-missing", limits);
  for (const field of ZERO_FIELDS) if (field in telemetry && Number(telemetry[field]) !== 0) return blocked(`cloud-budget-${field}-not-zero`, limits);
  if (hostedComputeSpendCeilingUsd !== 0) return blocked("cloud-budget-hosted-spend-ceiling-not-zero", limits);
  if (!telemetry.stopUsageEvidence || telemetry.stopUsageEvidence.active !== true) return blocked("cloud-budget-stop-usage-evidence-missing", limits);
  const stopEvidenceObservedAt = parseTime(telemetry.stopUsageEvidence.observedAt);
  if (!stopEvidenceObservedAt || nowMs - stopEvidenceObservedAt > telemetryMaxAgeMs) return blocked("cloud-budget-stop-usage-evidence-stale", limits);
  if (Number(telemetry.projectedCoreHours ?? 0) > softCoreHoursLimit) return blocked("cloud-budget-projected-core-hours-exceed-limit", limits);
  return Object.freeze({ ok: true, status: "admissible", reason: null, limits });
}

export function assertAdmissibleCloudBudget(input) {
  const decision = evaluateCloudComputeBudget(input);
  if (!decision.ok) throw Object.assign(new Error(decision.reason), { code: decision.reason, decision });
  return decision;
}
function blocked(reason, limits) { return Object.freeze({ ok: false, status: "blocked", reason, limits }); }
function parseTime(value) { const ms = value instanceof Date ? value.getTime() : Date.parse(String(value ?? "")); return Number.isFinite(ms) ? ms : 0; }
