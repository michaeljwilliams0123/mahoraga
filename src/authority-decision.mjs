const HARD_DENY_REASONS = new Set([
  "owner-grant-inactive",
  "owner-scope-revoked",
  "owner-authority-missing",
  "deployment-target-invalid",
  "deployment-target-not-granted",
]);

export function createAuthorityDecision({
  ownerGrant = null,
  task = null,
  candidate = null,
  ownerDecision = null,
  providerDecision = null,
  creditFreeDecision = null,
  billingDecision = null,
  context = {},
  legacyReason = null,
} = {}) {
  const now = Number.isFinite(context?.now) ? context.now : Date.now();
  const classification = classifyDecision({
    ownerDecision,
    providerDecision,
    creditFreeDecision,
    billingDecision,
    legacyReason,
  });
  const owner = {
    grantId: ownerGrant?.grantId ?? null,
    state: ownerGrant?.state ?? null,
    authorized: ownerDecision?.authorized ?? null,
    confirmationRequired: ownerDecision?.confirmationRequired === true,
    requestedScope: ownerDecision?.requestedScope ?? task?.authorityScope ?? null,
    requestedTarget: ownerDecision?.requestedTarget ?? task?.authorityTarget ?? null,
    requiredScopes: [...(ownerDecision?.requiredScopes ?? [])],
  };
  const request = {
    capability: task?.capability ?? null,
    mutationClass: task?.mutationClass ?? null,
    affectedResources: normalizeResources(task),
    dataClass: task?.dataClass ?? null,
  };
  const provider = {
    id: candidate?.workerId ?? providerDecision?.providerId ?? task?.provider ?? task?.requestedProvider ?? null,
    costClass: candidate?.costClass ?? null,
    billingClass: candidate?.billingClass ?? billingDecision?.effectiveClass ?? null,
    attendanceRequired: candidate?.requiresAttendedDesktop ?? null,
  };
  const execution = {
    integrationLeaseId: task?.integrationLeaseId ?? context?.integrationLeaseId ?? null,
    trustEpoch: context?.trustEpoch ?? task?.trustEpoch ?? null,
    candidateHeadSha: task?.candidateHeadSha ?? context?.candidateHeadSha ?? null,
  };
  const timing = {
    observedAt: new Date(now).toISOString(),
    expiresAt: context?.authorityExpiresAt ?? null,
    revokedAt: context?.authorityRevokedAt ?? null,
  };
  const evidence = {
    ownerAuthority: cloneEvidence(ownerDecision),
    providerAdmission: cloneEvidence(providerDecision),
    creditFree: cloneEvidence(creditFreeDecision),
    billing: cloneEvidence(billingDecision),
  };
  return deepFreeze({
    schemaVersion: 1,
    kind: "authority-decision-v1",
    decision: classification.decision,
    reasonCodes: classification.reasonCodes,
    owner,
    request,
    provider,
    execution,
    timing,
    evidence,
  });
}
function classifyDecision(input) {
  const { ownerDecision, providerDecision, creditFreeDecision, billingDecision, legacyReason } = input;
  if (ownerDecision?.authorized === false) {
    const reason = ownerDecision.reason ?? "owner-authority-denied";
    return decision(HARD_DENY_REASONS.has(reason) ? "deny" : "hold", reason);
  }
  if (ownerDecision?.confirmationRequired === true) {
    return decision("hold", "owner-confirmation-required");
  }
  if (creditFreeDecision?.ok === false) {
    const reason = creditFreeDecision.reason ?? legacyReason ?? "credit-free-unavailable";
    return decision("hold", reason);
  }
  if (providerDecision?.status === "waiting") {
    return decision("hold", "provider-unavailable");
  }
  if (billingDecision?.required === true && billingDecision?.eligible !== true) {
    return decision("hold", "billing-not-zero-credit");
  }
  if (legacyReason) return decision("hold", legacyReason);
  return { decision: "allow", reasonCodes: [] };
}

function decision(value, reason) {
  return { decision: value, reasonCodes: [reason] };
}
function normalizeResources(task) {
  const resources = task?.affectedResources ?? task?.affectedPaths ?? task?.allowedPaths ?? [];
  return Array.isArray(resources) ? [...resources] : [];
}
function cloneEvidence(value) {
  if (value === null || value === undefined) return null;
  return structuredClone(value);
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
