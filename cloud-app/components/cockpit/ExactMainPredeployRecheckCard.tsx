export function ExactMainPredeployRecheckCard() {
  return (
    <article className="eclipse-status-card good" data-testid="exact-main-predeploy-recheck">
      <span>Main authority freshness</span>
      <strong>Rechecked immediately pre-mutation</strong>
      <p>
        Merged #1066 reuses verify-exact-head.mjs immediately before seven Cloudflare deploy/admission/acceptance steps in cloudflare-execution-runtime.yml. GITHUB_TOKEN is passed only for the assertion then unset. Observational CI provenance only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This narrows the freshness window; it is not an atomic GitHub-to-Cloudflare transaction. Exact deployed identity and runtime acceptance remain required. No traffic authority, readiness, or production claim is granted.
      </p>
    </article>
  );
}
