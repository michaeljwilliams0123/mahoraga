export const BROKER_LEASE_REASONS = {
  metricsInvalid: "attestation-metrics-invalid",
  deadlineExceeded: "execution-deadline-exceeded",
  deadlineInvalid: "execution-deadline-invalid",
  leaseExpired: "execution-lease-expired",
  noEligibleRoute: "no-eligible-route",
} as const;

export type BrokerLeaseReason = (typeof BROKER_LEASE_REASONS)[keyof typeof BROKER_LEASE_REASONS];

export type BrokerLeaseSurface = {
  product: "Mahoraga";
  buildProvenanceOnly: "7.0.0-alpha.2";
  observationalOnly: true;
  failClosed: true;
  grantsTrafficAuthority: false;
  createsProviderRoute: false;
  meteredFallthrough: false;
  leaseExpiryHttpStatus: 409;
  leaseExpiryNotHttp200: true;
  merge874IsTrafficAuthority: false;
};

export function classifyAttestationMetrics(metrics: {
  observedLatencyMs?: unknown;
  queueDepth?: unknown;
  reliabilityScore?: unknown;
}): { ok: true } | { ok: false; reason: "attestation-metrics-invalid" } {
  const { observedLatencyMs, queueDepth, reliabilityScore } = metrics;
  if (
    observedLatencyMs !== undefined
    && (typeof observedLatencyMs !== "number" || !Number.isFinite(observedLatencyMs) || observedLatencyMs < 0)
  ) {
    return { ok: false, reason: BROKER_LEASE_REASONS.metricsInvalid };
  }
  if (
    queueDepth !== undefined
    && (typeof queueDepth !== "number" || !Number.isInteger(queueDepth) || queueDepth < 0)
  ) {
    return { ok: false, reason: BROKER_LEASE_REASONS.metricsInvalid };
  }
  if (
    reliabilityScore !== undefined
    && (typeof reliabilityScore !== "number" || !Number.isFinite(reliabilityScore) || reliabilityScore < 0 || reliabilityScore > 1)
  ) {
    return { ok: false, reason: BROKER_LEASE_REASONS.metricsInvalid };
  }
  return { ok: true };
}

export function classifyExecutionDeadline(
  deadlineAt: unknown,
  nowMs: number,
): { ok: true } | { ok: false; reason: "execution-deadline-exceeded" | "execution-deadline-invalid" } {
  if (deadlineAt === undefined || deadlineAt === null) return { ok: true };
  const deadline = Date.parse(String(deadlineAt));
  if (!Number.isFinite(deadline)) return { ok: false, reason: BROKER_LEASE_REASONS.deadlineInvalid };
  if (deadline <= nowMs) return { ok: false, reason: BROKER_LEASE_REASONS.deadlineExceeded };
  return { ok: true };
}

export function narrowRouteLeaseScope(input: {
  requestedPermission: string;
  workerAuthorityScopes: readonly string[];
  requestAuthorityScopes: readonly string[];
}): { permissionClass: string; authorityScopes: string[] } {
  return {
    permissionClass: input.requestedPermission,
    authorityScopes: input.workerAuthorityScopes.filter((scope) => input.requestAuthorityScopes.includes(scope)),
  };
}

export function classifyCompletionLease(input: {
  expiresAt: string;
  completedAtMs: number;
}): { ok: true; httpStatus: 200 } | { ok: false; reason: "execution-lease-expired"; httpStatus: 409 } {
  if (Date.parse(input.expiresAt) <= input.completedAtMs) {
    return { ok: false, reason: BROKER_LEASE_REASONS.leaseExpired, httpStatus: 409 };
  }
  return { ok: true, httpStatus: 200 };
}

export function classifyZeroCreditExhaustion(input: {
  requireZeroCredit: boolean;
  eligibleZeroCredit: boolean;
}): { ok: true; meteredFallthrough: false } | { ok: false; reason: "no-eligible-route"; meteredFallthrough: false } {
  if (input.requireZeroCredit && !input.eligibleZeroCredit) {
    return { ok: false, reason: BROKER_LEASE_REASONS.noEligibleRoute, meteredFallthrough: false };
  }
  return { ok: true, meteredFallthrough: false };
}

export function projectBrokerLeaseSurface(): BrokerLeaseSurface {
  return {
    product: "Mahoraga",
    buildProvenanceOnly: "7.0.0-alpha.2",
    observationalOnly: true,
    failClosed: true,
    grantsTrafficAuthority: false,
    createsProviderRoute: false,
    meteredFallthrough: false,
    leaseExpiryHttpStatus: 409,
    leaseExpiryNotHttp200: true,
    merge874IsTrafficAuthority: false,
  };
}
