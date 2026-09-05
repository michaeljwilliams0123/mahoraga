const EVENT_TYPES = Object.freeze([
  "dispatch-created",
  "validation-accepted",
  "validation-rejected",
  "acked",
  "result",
  "duplicate-suppressed",
  "expired-no-ack",
]);
const BANNED = /prompt|response|content|token|secret|chat|credential|stdout|stderr/i;
const REASON_MAX = 80;

function frozen(value) {
  return Object.freeze(value);
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function boundedReason(value) {
  if (value == null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > REASON_MAX || BANNED.test(value)) {
    fail("destiny-metrics-reason-invalid");
  }
  return value;
}

export function emptyDestinyTriggerMetrics({
  actorFingerprint = null,
  installationFingerprint = null,
  lastHealthyAt = null,
} = {}) {
  if (actorFingerprint != null && (typeof actorFingerprint !== "string" || actorFingerprint.length > 128)) {
    fail("destiny-metrics-fingerprint-invalid");
  }
  if (installationFingerprint != null && (typeof installationFingerprint !== "string" || installationFingerprint.length > 128)) {
    fail("destiny-metrics-fingerprint-invalid");
  }
  if (lastHealthyAt != null && !Number.isFinite(Date.parse(lastHealthyAt))) fail("destiny-metrics-time-invalid");
  return frozen({
    schemaVersion: 1,
    kind: "destiny-trigger-metrics",
    dispatchesCreated: 0,
    validationAccepted: 0,
    validationRejected: 0,
    rejectReasons: frozen({}),
    ackCount: 0,
    resultCount: 0,
    ackLatencyCount: 0,
    ackLatencySumMs: 0,
    resultLatencyCount: 0,
    resultLatencySumMs: 0,
    duplicatesSuppressed: 0,
    expiredNoAck: 0,
    actorFingerprint: actorFingerprint ?? null,
    installationFingerprint: installationFingerprint ?? null,
    lastHealthyAt: lastHealthyAt ?? null,
    creditCost: 0,
    paidFallback: false,
  });
}

export function recordDestinyTriggerMetric(metricsInput, eventInput) {
  const base = requireObject(metricsInput, "destiny-metrics-invalid");
  const metrics = {
    ...emptyDestinyTriggerMetrics(base),
    ...base,
    rejectReasons: { ...(base.rejectReasons ?? {}) },
    schemaVersion: 1,
    kind: "destiny-trigger-metrics",
  };
  const event = requireObject(eventInput, "destiny-metrics-event-invalid");
  if (!EVENT_TYPES.includes(event.type)) fail("destiny-metrics-event-type-invalid");
  for (const key of Object.keys(event)) {
    if (BANNED.test(key)) fail("destiny-metrics-field-forbidden");
  }
  const next = { ...metrics, rejectReasons: { ...metrics.rejectReasons } };
  if (event.type === "dispatch-created") next.dispatchesCreated += 1;
  if (event.type === "validation-accepted") next.validationAccepted += 1;
  if (event.type === "validation-rejected") {
    next.validationRejected += 1;
    const reason = boundedReason(event.reason) ?? "unknown";
    next.rejectReasons[reason] = (next.rejectReasons[reason] ?? 0) + 1;
  }
  if (event.type === "acked") {
    next.ackCount += 1;
    const latency = event.latencyMs;
    if (latency != null) {
      if (!Number.isSafeInteger(latency) || latency < 0 || latency > 86_400_000) fail("destiny-metrics-latency-invalid");
      next.ackLatencyCount += 1;
      next.ackLatencySumMs += latency;
    }
  }
  if (event.type === "result") {
    next.resultCount += 1;
    const latency = event.latencyMs;
    if (latency != null) {
      if (!Number.isSafeInteger(latency) || latency < 0 || latency > 86_400_000) fail("destiny-metrics-latency-invalid");
      next.resultLatencyCount += 1;
      next.resultLatencySumMs += latency;
    }
  }
  if (event.type === "duplicate-suppressed") next.duplicatesSuppressed += 1;
  if (event.type === "expired-no-ack") next.expiredNoAck += 1;
  if (typeof event.actorFingerprint === "string") next.actorFingerprint = event.actorFingerprint;
  if (typeof event.installationFingerprint === "string") next.installationFingerprint = event.installationFingerprint;
  if (event.healthy === true) {
    if (typeof event.observedAt !== "string" || !Number.isFinite(Date.parse(event.observedAt))) fail("destiny-metrics-time-invalid");
    next.lastHealthyAt = event.observedAt;
  }
  next.rejectReasons = frozen(next.rejectReasons);
  next.creditCost = 0;
  next.paidFallback = false;
  return frozen(next);
}

export function summarizeDestinyTriggerMetrics(metricsInput) {
  const metrics = emptyDestinyTriggerMetrics(requireObject(metricsInput, "destiny-metrics-invalid"));
  const merged = { ...metrics, ...metricsInput, rejectReasons: frozen({ ...(metricsInput.rejectReasons ?? {}) }) };
  return frozen({
    schemaVersion: 1,
    kind: "destiny-trigger-metrics-summary",
    dispatchesCreated: merged.dispatchesCreated,
    validationAccepted: merged.validationAccepted,
    validationRejected: merged.validationRejected,
    rejectReasons: merged.rejectReasons,
    ackCount: merged.ackCount,
    resultCount: merged.resultCount,
    ackLatencyAvgMs: merged.ackLatencyCount === 0 ? null : Math.round(merged.ackLatencySumMs / merged.ackLatencyCount),
    resultLatencyAvgMs: merged.resultLatencyCount === 0 ? null : Math.round(merged.resultLatencySumMs / merged.resultLatencyCount),
    duplicatesSuppressed: merged.duplicatesSuppressed,
    expiredNoAck: merged.expiredNoAck,
    actorFingerprint: merged.actorFingerprint ?? null,
    installationFingerprint: merged.installationFingerprint ?? null,
    lastHealthyAt: merged.lastHealthyAt ?? null,
    creditCost: 0,
    paidFallback: false,
  });
}
