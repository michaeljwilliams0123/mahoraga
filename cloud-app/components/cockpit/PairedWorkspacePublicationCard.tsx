import { ExactMainConvergenceDiagnosticCard } from "./ExactMainConvergenceDiagnosticCard";

export const PAIRED_WORKSPACE_PUBLICATION = {
  product: "Mahoraga",
  buildProvenanceOnly: "7.0.0-alpha.2",
  sourcePr: 959,
  candidateOrigin: "https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev",
  pagesOrigin: "https://michaeljwilliams0123.github.io",
  gatewayOrigin: "https://mahoraga-owner-gateway.mahoraga-mjw0123.workers.dev",
  publicationGate: "exact-main-runtime-acceptance-receipt",
  staticReadinessGrantsExecution: false,
  primaryHostPromotion: false,
  windowsProduction: "3.6.0",
} as const;

export function PairedWorkspacePublicationCard() {
  return (
    <>
      <article className="eclipse-status-card neutral" data-testid="paired-workspace-publication">
        <span>Workspace publication</span>
        <strong>Acceptance receipt required</strong>
        <p>
          Candidate publication is not paired acceptance. An owner-triggered publication can place static UI bytes before runtime convergence and acceptance complete, so a published candidate remains unverified until a valid exact-SHA receipt binds the UI source and accepted runtime source. Static readiness grants no execution authority and does not promote the primary host. Pages remains the derived presentation mirror. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Windows production stays 3.6.0. This card does not grant traffic authority, runtime readiness, or production cutover. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
        </p>
      </article>
      <ExactMainConvergenceDiagnosticCard />
    </>
  );
}
