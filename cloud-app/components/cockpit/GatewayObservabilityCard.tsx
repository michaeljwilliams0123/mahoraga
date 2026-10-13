export function GatewayObservabilityCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="gateway-observability">
      <span>Gateway observability</span>
      <strong>Bounded sampled (observational)</strong>
      <p>
        Merged #1076 enables bounded sampled Cloudflare owner-gateway observability and failure grouping in both canonical configs. Contract test covers the observability settings and secret-free tracked vars. Prevents the retired RAILWAY_PROJECT_TOKEN name from re-entering active workflows. Observational only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not execution readiness, not cognition proof, not traffic authority, and not a production deployment claim. Historical stale runs and the retired secret remain preserved pending explicit external-state authorization.
      </p>
    </article>
  );
}
