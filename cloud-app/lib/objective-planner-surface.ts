export type PlannerSurface = {
  status: "observed" | "unverified";
  planFingerprint: string | null;
  hold: { blockedBy: string[] } | null;
  escalate: { objectiveId: string | null } | null;
  execute: { selectedAlternativeId: string | null; riskAdjustedValue: number | null; experienceAdjustedValue: number | null } | null;
  replan: { priorPlanFingerprint: string; newPlanFingerprint: string; reasonCode: string } | null;
  reason: string;
};

const SHA256 = /^[a-f0-9]{64}$/;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value: unknown) => typeof value === "string" && value.length > 0 ? value : null;
const fingerprint = (value: unknown) => typeof value === "string" && SHA256.test(value) ? value : null;

export function projectObjectivePlannerSurface(value: unknown): PlannerSurface {
  const root = record(value);
  const planner = record(root?.planner);
  const receipt = record(planner?.planReceipt);
  const planFingerprint = fingerprint(receipt?.fingerprint);
  if (!planner || !planFingerprint || !Array.isArray(planner.actions)) {
    return { status: "unverified", planFingerprint: null, hold: null, escalate: null, execute: null, replan: null, reason: "planner-receipt-unverified" };
  }
  const actions = planner.actions.map(record).filter((item): item is Record<string, unknown> => item !== null);
  const holdAction = actions.find((item) => item.reasonCode === "objective-dependencies-blocked" && item.disposition === "hold") ?? null;
  const escalateAction = actions.find((item) => item.reasonCode === "objective-overdue" && item.disposition === "escalate") ?? null;
  const executeAction = actions.find((item) => item.reasonCode === "objective-ready" && item.disposition === "execute") ?? null;
  const holdEvidence = record(holdAction?.evidence);
  const escalateEvidence = record(escalateAction?.evidence);
  const executeEvidence = record(executeAction?.evidence);
  const blockedBy = Array.isArray(holdEvidence?.blockedBy) ? holdEvidence.blockedBy.filter((item): item is string => typeof item === "string").slice(0, 32) : [];
  const replanReceipt = record(planner.replanReceipt);
  const prior = fingerprint(replanReceipt?.priorPlanFingerprint);
  const next = fingerprint(replanReceipt?.newPlanFingerprint);
  const replanReason = text(replanReceipt?.reasonCode);
  return {
    status: "observed",
    planFingerprint,
    hold: holdAction ? { blockedBy } : null,
    escalate: escalateAction ? { objectiveId: text(escalateEvidence?.objectiveId) } : null,
    execute: executeAction ? { selectedAlternativeId: text(executeEvidence?.selectedAlternativeId), riskAdjustedValue: finite(executeEvidence?.riskAdjustedValue), experienceAdjustedValue: finite(executeEvidence?.experienceAdjustedValue) } : null,
    replan: prior && next && replanReason ? { priorPlanFingerprint: prior, newPlanFingerprint: next, reasonCode: replanReason } : null,
    reason: "verified-plan-receipt",
  };
}
