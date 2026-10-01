import {
  classifyAttestationMetrics,
  classifyCompletionLease,
  classifyExecutionDeadline,
  classifyZeroCreditExhaustion,
  narrowRouteLeaseScope,
  projectBrokerLeaseSurface,
} from "@/lib/broker-lease-surface";

function Card({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "neutral";
}) {
  return (
    <article className={`eclipse-status-card ${tone}`} aria-label={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function BrokerLeaseCards() {
  const surface = projectBrokerLeaseSurface();
  const metrics = classifyAttestationMetrics({ observedLatencyMs: -1, queueDepth: 1.5, reliabilityScore: 1.01 });
  const deadline = classifyExecutionDeadline("2026-09-28T21:39:59.000Z", Date.parse("2026-09-28T21:40:00.000Z"));
  const lease = classifyCompletionLease({
    expiresAt: "2026-09-28T21:40:00.000Z",
    completedAtMs: Date.parse("2026-09-28T21:41:01.000Z"),
  });
  const scope = narrowRouteLeaseScope({
    requestedPermission: "read",
    workerAuthorityScopes: ["repo:mahoraga:read", "cloud:execute"],
    requestAuthorityScopes: ["repo:mahoraga:read"],
  });
  const exhaustion = classifyZeroCreditExhaustion({ requireZeroCredit: true, eligibleZeroCredit: false });

  return (
    <>
      <Card
        label="Manipulated routing metrics"
        value={metrics.ok ? "Admitted" : "Rejected / fail-closed"}
        detail={`${metrics.ok ? "metrics valid" : metrics.reason} · negative latency/queue, non-integer queue depth, and reliability outside [0,1] never rank a route · observational StatusCards and telemetry only`}
        tone={metrics.ok ? "good" : "warn"}
      />
      <Card
        label="Execution deadline"
        value={deadline.ok ? "Inside deadline" : "Fail closed"}
        detail={`${deadline.ok ? "deadline open" : deadline.reason} · already-past deadlineAt cannot select, lease, or hand off · Merge #874 is not live traffic authority`}
        tone={deadline.ok ? "good" : "warn"}
      />
      <Card
        label="Route-lease scope"
        value={`${scope.permissionClass} ∩ ${scope.authorityScopes.join(" · ") || "empty"}`}
        detail="Step permission ∩ worker/request authority · lease cannot widen permissionClass or authorityScopes · BROKER_LEASE_OBS · LEASE_SCOPE_NARROW"
        tone="neutral"
      />
      <Card
        label="Mid-provider lease expiry"
        value={lease.ok ? "Lease live" : `HTTP ${lease.httpStatus} ${lease.reason}`}
        detail={`${surface.leaseExpiryNotHttp200 ? "Not HTTP 200" : "HTTP 200"} · completion/handoff after expiresAt is execution-lease-expired · receipts preserved · no traffic-authority grant`}
        tone={lease.ok ? "good" : "warn"}
      />
      <Card
        label="Zero-credit exhaustion"
        value={exhaustion.ok ? "Zero-credit route" : "Closed / no fallthrough"}
        detail={`${exhaustion.ok ? "zero-credit eligible" : exhaustion.reason} · metered-route fallthrough false · ZERO_CREDIT_NO_FALLTHROUGH · no paid provider route`}
        tone={exhaustion.ok ? "good" : "warn"}
      />
    </>
  );
}
