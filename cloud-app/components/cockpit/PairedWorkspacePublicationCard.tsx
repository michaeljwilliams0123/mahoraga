export const PAIRED_WORKSPACE_PUBLICATION = {
  product: "Mahoraga",
  buildProvenanceOnly: "7.0.0-alpha.2",
  sourcePr: 971,
  candidateOrigin: "https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev",
  pagesOrigin: "https://michaeljwilliams0123.github.io",
  gatewayOrigin: "https://mahoraga-owner-gateway.mahoraga-mjw0123.workers.dev",
  publicationGate: "same-run-after-exact-main-runtime-acceptance",
  staticReadinessGrantsExecution: false,
  primaryHostPromotion: false,
  windowsProduction: "3.6.0",
} as const;

export function PairedWorkspacePublicationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="paired-workspace-publication">
      <span>Workspace publication</span>
      <strong>Same-run acceptance gate</strong>
      <p>
        After #971, the workspace-candidate publisher runs only as a dependent job after deploy-accept succeeds and passes the exact verified source SHA. Renewal-only and failed acceptance runs cannot publish a UI. Standalone publish remains owner-only recovery. A published candidate stays unverified until the owner pairing/activation transaction is observed. Static readiness grants no execution authority and does not promote the primary host. Pages remains the derived presentation mirror. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Windows production stays 3.6.0. This card does not grant traffic authority, runtime readiness, or production cutover. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
