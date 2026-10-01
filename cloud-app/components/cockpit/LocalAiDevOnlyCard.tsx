export function LocalAiDevOnlyCard() {
  return (
    <article className="eclipse-status-card warn" data-testid="local-ai-dev-only">
      <span>Local AI admission</span>
      <strong>Development-only</strong>
      <p>
        Merged #942 hard-enforces local AI adapters outside development. Non-development startup rejects configured local adapters and drops local routes from non-development manifests. Cloudflare runtime rejects local-model probes. Cloud provider selection stays available by default. Development opt-in requires both NODE_ENV=development and ALLOW_LOCAL_AI_DEV=true. Observational policy copy only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card does not grant traffic authority, runtime readiness, or production cutover.
      </p>
    </article>
  );
}
