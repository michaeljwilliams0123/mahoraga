export const BROKER_OBSERVATION_KIND = "broker-lease-observation-v1" as const;

export const BROKER_LEASE_REASONS = {
  metricsInvalid: "attestation-metrics-invalid",
  deadlineExceeded: "execution-deadline-exceeded",
  deadlineInvalid: "execution-deadline-invalid",
  leaseExpired: "execution-lease-expired",
  noEligibleRoute: "no-eligible-route",
} as const;

export type BrokerLeaseReason = (typeof BROKER_LEASE_REASONS)[keyof typeof BROKER_LEASE_REASONS];

export type BrokerObservationWindowResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "broker-observation-schema-invalid"
        | "broker-observation-unverified"
        | "broker-observation-contradicted"
        | "broker-observation-receipt-invalid"
        | "broker-observation-source-invalid"
        | "broker-observation-source-unbound"
        | "broker-observation-source-mismatch"
        | "broker-observation-time-invalid"
        | "broker-observation-future"
        | "broker-observation-stale";
    };

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    ? value as Record<string, unknown>
    : null;

export function classifyBrokerObservationWindow(
  value: unknown,
  nowMs: number,
  expectedSourceSha?: string,
): BrokerObservationWindowResult {
  const input = record(value);
  if (!input || input.schemaVersion !== 1 || input.kind !== BROKER_OBSERVATION_KIND) {
    return { ok: false, reason: "broker-observation-schema-invalid" };
  }
  if (input.verified !== true) return { ok: false, reason: "broker-observation-unverified" };
  if (input.contradicted === true) return { ok: false, reason: "broker-observation-contradicted" };
  if (input.contradicted !== undefined && input.contradicted !== false) {
    return { ok: false, reason: "broker-observation-unverified" };
  }
  if (typeof input.receiptId !== "string" || !/^brokerobs-[A-Za-z0-9_-]{8,80}$/.test(input.receiptId)) {
    return { ok: false, reason: "broker-observation-receipt-invalid" };
  }
  if (typeof input.sourceSha !== "string" || !/^[a-f0-9]{40}$/.test(input.sourceSha)) {
    return { ok: false, reason: "broker-observation-source-invalid" };
  }
  if (typeof expectedSourceSha !== "string" || !/^[a-f0-9]{40}$/.test(expectedSourceSha)) {
    return { ok: false, reason: "broker-observation-source-unbound" };
  }
  if (input.sourceSha !== expectedSourceSha) {
    return { ok: false, reason: "broker-observation-source-mismatch" };
  }

  const observedAt = typeof input.observedAt === "string" ? Date.parse(input.observedAt) : NaN;
  const validUntil = typeof input.validUntil === "string" ? Date.parse(input.validUntil) : NaN;
  if (!Number.isFinite(nowMs) || !Number.isFinite(observedAt) || !Number.isFinite(validUntil) || validUntil < observedAt) {
    return { ok: false, reason: "broker-observation-time-invalid" };
  }
  if (observedAt > nowMs) return { ok: false, reason: "broker-observation-future" };
  if (validUntil <= nowMs) return { ok: false, reason: "broker-observation-stale" };
  return { ok: true };
}

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
