import { projectAcceptanceEvidence } from "@/lib/acceptance-evidence";
export function AcceptanceEvidenceCards({ receipt, expectedSha, deploymentSha }: { receipt?: unknown; expectedSha?: unknown; deploymentSha?: unknown }) {
 const evidence = projectAcceptanceEvidence(receipt, { expectedSha, deploymentSha });
 const stages = [["Access verification", evidence.accessVerified], ["Transport readiness", evidence.transportVerified], ["Provider cognition", evidence.providerCognitionVerified], ["Durable result", evidence.durableVerified], ["Traffic evidence", evidence.trafficAuthorityVerified]] as const;
 return <>
  {stages.map(([label, observed]) => <article key={label} className={`eclipse-status-card ${observed ? "good" : "neutral"}`} aria-label={label}><span>{label}</span><strong>{observed ? "Observed receipt" : "Unverified"}</strong><p>{evidence.reason} · {evidence.targetSha?.slice(0, 12) ?? "source unobserved"}</p></article>)}
  <article className="eclipse-status-card" aria-label="Execution uniqueness"><span>Execution uniqueness</span><strong>{evidence.executions === null ? "Unobserved" : `${evidence.executions} provider execution`}</strong><p>{evidence.replays === null ? "Replay evidence unavailable" : `${evidence.replays} replay responses`} · replay does not count as another execution. Receipts are observations; they grant no authority.</p></article>
 </>;
}
