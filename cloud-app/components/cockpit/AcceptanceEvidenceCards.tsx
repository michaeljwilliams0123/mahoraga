import { projectAcceptanceEvidence, type AcceptanceEvidence } from "@/lib/acceptance-evidence";

const STATE_COPY: Record<AcceptanceEvidence["state"], { label: string; tone: string }> = {
  absent: { label: "Unobserved", tone: "neutral" },
  partial: { label: "Partial receipt", tone: "warn" },
  hold: { label: "Fail closed", tone: "warn" },
  observed: { label: "Observed receipt", tone: "good" },
};

export function AcceptanceEvidenceCards({
  receipt,
  expectedSha,
  deploymentSha,
}: {
  receipt?: unknown;
  expectedSha?: unknown;
  deploymentSha?: unknown;
}) {
  const evidence = projectAcceptanceEvidence(receipt, { expectedSha, deploymentSha });
  const state = STATE_COPY[evidence.state];
  const stages = [
    ["Access verification", evidence.accessVerified],
    ["Transport readiness", evidence.transportVerified],
    ["Provider cognition", evidence.providerCognitionVerified],
    ["Durable result", evidence.durableVerified],
    ["Traffic evidence", evidence.trafficAuthorityVerified],
  ] as const;
  const sha = evidence.targetSha?.slice(0, 12) ?? "source unobserved";
  return (
    <section className="eclipse-status-grid" aria-label="Cloudflare acceptance evidence" data-product="Mahoraga" data-build="7.0.0-alpha.2">
      <article className={`eclipse-status-card ${state.tone}`} aria-label="Acceptance evidence state" data-testid="acceptance-evidence-state">
        <span>Acceptance evidence</span>
        <strong>{state.label}</strong>
        <p>{evidence.reason} · {sha}. Observational only. 7.0.0-alpha.2 is build provenance, not a live grant.</p>
      </article>
      {stages.map(([label, observed]) => (
        <article key={label} className={`eclipse-status-card ${observed ? "good" : "neutral"}`} aria-label={label}>
          <span>{label}</span>
          <strong>{observed ? "Observed receipt" : "Unverified"}</strong>
          <p>{evidence.reason} · {sha}</p>
        </article>
      ))}
      <article className="eclipse-status-card" aria-label="Execution uniqueness">
        <span>Execution uniqueness</span>
        <strong>{evidence.executions === null ? "Unobserved" : `${evidence.executions} provider execution`}</strong>
        <p>{evidence.replays === null ? "Replay evidence unavailable" : `${evidence.replays} replay responses`} · replay does not count as another execution. Receipts are observations; they grant no authority.</p>
      </article>
    </section>
  );
}
