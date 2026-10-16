export function BotAuthorityObservationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="bot-authority-observation">
      <span>Bot authority observations</span>
      <strong>60s freshness bound (observational)</strong>
      <p>
        Merged #1119 rejects current observations older than 60 seconds (matching GrokBot host bound) while a mission lease remains unexpired. Fresh evidence permits another executor to continue the same mission; explicit revocation still wins. Observational only. Not traffic authority, not live execution proof, fail-closed. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
