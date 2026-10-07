import type { Health } from "../workspace/workspace-types";

const OWNER_GATEWAY = "mahoraga-owner-gateway.mahoraga-mjw0123.workers.dev";
const validSourceSha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);

/**
 * Observes the static workspace manifest only. The publisher validates this manifest
 * externally; the browser must never treat it as a runtime or authority receipt.
 */
export function StaticWorkspaceParityCard({ health }: { health: Health | null }) {
  const deployment = health?.deployment;
  const sourceSha = deployment?.commitSha;
  const candidateDeclared = deployment?.provider === "cloudflare-workers"
    && deployment.environment === "candidate"
    && deployment.gitRef === "main"
    && deployment.promotion === "unverified-cloudflare-static"
    && validSourceSha(sourceSha);

  return (
    <article className="eclipse-status-card neutral" data-testid="static-workspace-parity">
      <span>Unified workspace publication</span>
      <strong>{candidateDeclared ? "Static source declared" : "Static provenance unobserved"}</strong>
      <p>
        Owner Gateway: {OWNER_GATEWAY}. GitHub Pages is a source mirror, not the
        execution origin. Both export from cloud-app; the Cloudflare Owner Gateway
        is the single owner-facing workspace.
      </p>
      <p>
        Manifest source SHA: {candidateDeclared ? sourceSha : "unverified"}.
        This manifest is observational; exact-main source verification requires
        an independent successful publication receipt from GitHub Actions.
      </p>
      <p>
        Static-only receipt projection: pairedRuntimeSourceVerified: false;
        executionAuthorityGranted: false. These describe what static publication
        can establish, not whether a separately authenticated runtime is ready.
        Execution readiness, cognition readiness, provider admission, signed
        creditsUsed evidence, and traffic authority each require separate live proof.
        No credit, billing, or runtime authority is granted by UI publication.
      </p>
      <p>Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only.</p>
    </article>
  );
}
