export type PlannerSurface = {
  status: "observed" | "unverified";
  planFingerprint: string | null;
  actionCount: number | null;
  otherActionCount: number | null;
  hold: { objectiveId: string; blockedBy: string[] } | null;
  escalate: { objectiveId: string } | null;
  execute: {
    objectiveId: string;
    selectedAlternativeId: string | null;
    riskAdjustedValue: number | null;
    experienceAdjustedValue: number | null;
    calibrationPenalty: number | null;
    calibrationSummaryFingerprint: string | null;
  } | null;
  calibrationSummaryFingerprint: string | null;
  calibrationBind: "match" | "unbound" | "mismatch" | "unverified";
  plannerTrust: number | null;
  replan: { priorPlanFingerprint: string; newPlanFingerprint: string; reasonCode: string } | null;
  reason: string;
};

const SHA256 = /^[a-f0-9]{64}$/;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const boundedTrust = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
const boundedText = (value: unknown): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
const fingerprint = (value: unknown): string | null => typeof value === "string" && SHA256.test(value) ? value : null;
const absent = (object: Record<string, unknown>, key: string) => !Object.hasOwn(object, key);
const UNVERIFIED: PlannerSurface = {
  status: "unverified", planFingerprint: null, actionCount: null, otherActionCount: null,
  hold: null, escalate: null, execute: null, calibrationSummaryFingerprint: null,
  calibrationBind: "unverified", plannerTrust: null,
  replan: null, reason: "planner-receipt-unverified",
};

// This checks the exposed contract and cross-field provenance. The browser cannot
// reproduce the receipt hash because the planner also hashes its private clock/input.
export function projectObjectivePlannerSurface(value: unknown): PlannerSurface {
  const planner = record(record(value)?.planner);
  const receipt = record(planner?.planReceipt);
  const planFingerprint = fingerprint(receipt?.fingerprint);
  if (!planner || !receipt || !planFingerprint || planner.schemaVersion !== 1 ||
      planner.plannerVersion !== "objective-planner-v1" || !Array.isArray(planner.actions) ||
      planner.actions.length > 8 || planner.actionCount !== planner.actions.length ||
      !["stable", "attention-required"].includes(String(planner.state)) ||
      (planner.actions.length === 0) !== (planner.state === "stable")) return UNVERIFIED;

  const calibrationSummaryFingerprint = absent(receipt, "calibrationSummaryFingerprint")
    ? null : fingerprint(receipt.calibrationSummaryFingerprint);
  if (!absent(receipt, "calibrationSummaryFingerprint") && !calibrationSummaryFingerprint) return {
    ...UNVERIFIED,
    calibrationBind: "mismatch",
    reason: "planner-calibration-profile-fingerprint-mismatch",
  };

  const actions = planner.actions.map(record);
  if (actions.some((action) => !action)) return UNVERIFIED;
  if (actions.some((action) => typeof action?.mutation !== "boolean") ||
      planner.automaticMutationAllowed !== actions.some((action) => action?.mutation === true)) return UNVERIFIED;
  const objectiveActions = actions.filter((action) => action?.intent === "objective.plan");
  if (objectiveActions.some((action) => action?.mutation !== false || action?.authority !== "world-state-observer")) return UNVERIFIED;
  const byDisposition = (reasonCode: string, disposition: string) =>
    objectiveActions.filter((action) => action?.reasonCode === reasonCode && action.disposition === disposition);
  const holds = byDisposition("objective-dependencies-blocked", "hold");
  const escalations = byDisposition("objective-overdue", "escalate");
  const executions = byDisposition("objective-ready", "execute");
  if (holds.length + escalations.length + executions.length !== objectiveActions.length ||
      [holds, escalations, executions].some((group) => group.length > 1)) return UNVERIFIED;

  const holdEvidence = holds.length ? record(holds[0]?.evidence) : null;
  const blockedBy = holdEvidence?.blockedBy;
  const holdId = holds.length ? boundedText(holdEvidence?.objectiveId) : null;
  if (holds.length && (!holdId || !Array.isArray(blockedBy) || blockedBy.length === 0 ||
      blockedBy.length > 32 || blockedBy.some((id) => !boundedText(id)))) return UNVERIFIED;

  const escalateEvidence = escalations.length ? record(escalations[0]?.evidence) : null;
  const escalateId = escalations.length ? boundedText(escalateEvidence?.objectiveId) : null;
  if (escalations.length && !escalateId) return UNVERIFIED;

  const executeEvidence = executions.length ? record(executions[0]?.evidence) : null;
  const executeId = executions.length ? boundedText(executeEvidence?.objectiveId) : null;
  if (executions.length && !executeId) return UNVERIFIED;
  const selected = executeEvidence && !absent(executeEvidence, "selectedAlternativeId")
    ? boundedText(executeEvidence.selectedAlternativeId) : null;
  const risk = executeEvidence && !absent(executeEvidence, "riskAdjustedValue")
    ? finite(executeEvidence.riskAdjustedValue) : null;
  const experience = executeEvidence && !absent(executeEvidence, "experienceAdjustedValue")
    ? finite(executeEvidence.experienceAdjustedValue) : null;
  const penalty = executeEvidence && !absent(executeEvidence, "calibrationPenalty")
    ? finite(executeEvidence.calibrationPenalty) : null;
  const actionCalibration = executeEvidence && !absent(executeEvidence, "calibrationSummaryFingerprint")
    ? fingerprint(executeEvidence.calibrationSummaryFingerprint) : null;
  if (executeEvidence && actionCalibration && calibrationSummaryFingerprint && actionCalibration !== calibrationSummaryFingerprint) {
    return {
      ...UNVERIFIED,
      calibrationBind: "mismatch",
      reason: "planner-calibration-profile-fingerprint-mismatch",
    };
  }
  if (executeEvidence && (
    (selected === null) !== (risk === null) ||
    (!absent(executeEvidence, "selectedAlternativeId") && !selected) ||
    (!absent(executeEvidence, "riskAdjustedValue") && risk === null) ||
    ((experience !== null || penalty !== null || actionCalibration !== null) &&
      (experience === null || penalty === null || actionCalibration !== calibrationSummaryFingerprint || !actionCalibration || risk === null)) ||
    (["experienceAdjustedValue", "calibrationPenalty", "calibrationSummaryFingerprint"] as const)
      .some((key) => !absent(executeEvidence, key) && (key === "experienceAdjustedValue" ? experience === null : key === "calibrationPenalty" ? penalty === null : !actionCalibration))
  )) return UNVERIFIED;

  const replanReceipt = planner.replanReceipt === undefined ? null : record(planner.replanReceipt);
  const prior = fingerprint(replanReceipt?.priorPlanFingerprint);
  const next = fingerprint(replanReceipt?.newPlanFingerprint);
  const replanReason = boundedText(replanReceipt?.reasonCode);
  if (planner.replanReceipt !== undefined && (!prior || next !== planFingerprint || !replanReason)) return UNVERIFIED;

  const profile = record(planner.calibrationProfile) ?? record(receipt.calibrationProfile);
  const profileFingerprint = fingerprint(profile?.fingerprint);
  if (profileFingerprint && calibrationSummaryFingerprint && profileFingerprint !== calibrationSummaryFingerprint) {
    return {
      ...UNVERIFIED,
      calibrationBind: "mismatch",
      reason: "planner-calibration-profile-fingerprint-mismatch",
    };
  }
  const calibrationBind = calibrationSummaryFingerprint ? "match" : "unbound";
  const plannerTrust = calibrationBind === "match" ? boundedTrust(profile?.plannerTrust ?? receipt.plannerTrust) : null;

  return {
    status: "observed", planFingerprint, actionCount: actions.length,
    otherActionCount: actions.length - objectiveActions.length,
    hold: holdId && Array.isArray(blockedBy) ? { objectiveId: holdId, blockedBy: blockedBy as string[] } : null,
    escalate: escalateId ? { objectiveId: escalateId } : null,
    execute: executeId ? {
      objectiveId: executeId, selectedAlternativeId: selected, riskAdjustedValue: risk,
      experienceAdjustedValue: experience, calibrationPenalty: penalty,
      calibrationSummaryFingerprint: actionCalibration,
    } : null,
    calibrationSummaryFingerprint,
    calibrationBind,
    plannerTrust,
    replan: prior && next && replanReason ? { priorPlanFingerprint: prior, newPlanFingerprint: next, reasonCode: replanReason } : null,
    reason: "planner-receipt-structurally-consistent",
  };
}
