import {
  classifyAttestationMetrics,
  classifyBrokerObservationWindow,
  classifyCompletionLease,
  classifyExecutionDeadline,
  classifyZeroCreditExhaustion,
  narrowRouteLeaseScope,
  projectBrokerLeaseSurface,
} from "@/lib/broker-lease-surface";

export type BrokerLeaseObservation = Readonly<{
  schemaVersion: 1;
  kind: "broker-lease-observation-v1";
  receiptId: string;
  sourceSha: string;
  verified: true;
  contradicted?: false;
  observedAt: string;
  validUntil: string;
  metrics?: Readonly<{
    observedLatencyMs?: unknown;
    queueDepth?: unknown;
    reliabilityScore?: unknown;
  }>;
  deadlineAt?: unknown;
  completionLease?: Readonly<{
    expiresAt: string;
    completedAtMs: number;
  }>;
  routeLeaseScope?: Readonly<{
    requestedPermission: string;
    workerAuthorityScopes: readonly string[];
    requestAuthorityScopes: readonly string[];
  }>;
  zeroCredit?: Readonly<{
    requireZeroCredit: boolean;
    eligibleZeroCredit: boolean;
  }>;
}>;

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

function UnobservedCard({ label, reason }: { label: string; reason: string }) {
  return (
    <Card
      label={label}
      value="UNKNOWN / UNOBSERVED"
      detail={`${reason} · verified flag alone is insufficient · exact receipt/source binding required · no runtime health or failure is inferred · observational only · no traffic-authority grant`}
    />
  );
}

function sourceBindValue(expectedSourceSha?: string): { value: string; tone: "good" | "warn" | "neutral" } {
  if (typeof expectedSourceSha !== "string" || expectedSourceSha.length === 0) {
    return { value: "UNBOUND", tone: "warn" };
  }
  if (!/^[a-f0-9]{40}$/.test(expectedSourceSha)) {
    return { value: "INVALID SHA", tone: "warn" };
  }
  return { value: expectedSourceSha.slice(0, 12), tone: "neutral" };
}

export function BrokerLeaseCards({
  observation,
  expectedSourceSha,
  nowMs = Date.now(),
}: {
  observation?: BrokerLeaseObservation;
  expectedSourceSha?: string;
  nowMs?: number;
} = {}) {
  const surface = projectBrokerLeaseSurface();
  const observationWindow = classifyBrokerObservationWindow(observation, nowMs, expectedSourceSha);
  const sourceBind = sourceBindValue(expectedSourceSha);
  const sourceCard = (
    <Card
      label="Source-bind"
      value={sourceBind.value}
      detail={`${surface.buildProvenanceOnly} · ${surface.product} · exact 40-char source SHA required before any lease metric renders · ${observationWindow.ok ? "observation window open" : observationWindow.reason} · observational only · no traffic-authority grant · zero-credit fallthrough false`}
      tone={sourceBind.tone}
    />
  );

  if (!observationWindow.ok || !observation) {
    const reason = observationWindow.ok ? "broker-observation-unverified" : observationWindow.reason;
    return (
      <>
        {sourceCard}
        <UnobservedCard label="Broker attestation metrics" reason={reason} />
        <UnobservedCard label="Execution deadline" reason={reason} />
        <UnobservedCard label="Route-lease scope" reason={reason} />
        <UnobservedCard label="Mid-provider lease expiry" reason={reason} />
        <UnobservedCard label="Zero-credit exhaustion" reason={reason} />
      </>
    );
  }

  const metrics = observation.metrics ? classifyAttestationMetrics(observation.metrics) : null;
  const deadline = observation.deadlineAt !== undefined
    ? classifyExecutionDeadline(observation.deadlineAt, nowMs)
    : null;
  const lease = observation.completionLease
    ? classifyCompletionLease(observation.completionLease)
    : null;
  const scope = observation.routeLeaseScope
    ? narrowRouteLeaseScope(observation.routeLeaseScope)
    : null;
  const exhaustion = observation.zeroCredit
    ? classifyZeroCreditExhaustion(observation.zeroCredit)
    : null;

  return (
    <>
      {sourceCard}
      {metrics ? (
        <Card
          label="Broker attestation metrics"
          value={metrics.ok ? "Observed / valid" : "Rejected / fail-closed"}
          detail={`${metrics.ok ? "verified broker metrics" : metrics.reason} · receipt ${observation.receiptId} · source ${observation.sourceSha.slice(0, 12)} · invalid observed metrics never rank a route · observational only`}
          tone={metrics.ok ? "good" : "warn"}
        />
      ) : (
        <UnobservedCard label="Broker attestation metrics" reason="broker-metrics-unobserved" />
      )}
      {deadline ? (
        <Card
          label="Execution deadline"
          value={deadline.ok ? "Inside deadline" : "Fail closed"}
          detail={`${deadline.ok ? "verified deadline open" : deadline.reason} · deadline evidence never grants selection, lease, handoff, or traffic authority`}
          tone={deadline.ok ? "good" : "warn"}
        />
      ) : (
        <UnobservedCard label="Execution deadline" reason="execution-deadline-unobserved" />
      )}
      {scope ? (
        <Card
          label="Route-lease scope"
          value={`${scope.permissionClass} ∩ ${scope.authorityScopes.join(" · ") || "empty"}`}
          detail="Verified step permission ∩ worker/request authority · lease cannot widen permissionClass or authorityScopes · BROKER_LEASE_OBS · LEASE_SCOPE_NARROW"
        />
      ) : (
        <UnobservedCard label="Route-lease scope" reason="route-lease-scope-unobserved" />
      )}
      {lease ? (
        <Card
          label="Mid-provider lease expiry"
          value={lease.ok ? "Lease live" : `HTTP ${lease.httpStatus} ${lease.reason}`}
          detail={`${surface.leaseExpiryNotHttp200 ? "Expiry is not HTTP 200" : "HTTP 200"} · observed completion after expiresAt fails closed · receipts preserved · no traffic-authority grant`}
          tone={lease.ok ? "good" : "warn"}
        />
      ) : (
        <UnobservedCard label="Mid-provider lease expiry" reason="completion-lease-unobserved" />
      )}
      {exhaustion ? (
        <Card
          label="Zero-credit exhaustion"
          value={exhaustion.ok ? "Zero-credit route observed" : "Closed / no fallthrough"}
          detail={`${exhaustion.ok ? "verified zero-credit eligible" : exhaustion.reason} · metered-route fallthrough false · ZERO_CREDIT_NO_FALLTHROUGH · no paid provider route`}
          tone={exhaustion.ok ? "good" : "warn"}
        />
      ) : (
        <UnobservedCard label="Zero-credit exhaustion" reason="zero-credit-state-unobserved" />
      )}
    </>
  );
}
