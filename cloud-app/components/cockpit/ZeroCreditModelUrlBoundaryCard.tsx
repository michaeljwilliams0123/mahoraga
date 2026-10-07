export function ZeroCreditModelUrlBoundaryCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="zero-credit-model-url-boundary">
      <span>Sovereign workflow boundary</span>
      <strong>Dev-only model URL cleared</strong>
      <p>
        Merged #1017: the production sovereign workflow clears the self-hosted runner&apos;s development-only MAHORAGA_ZERO_CREDIT_MODEL_URL at the workflow boundary, so production cycles cannot inherit the loopback zero-credit model endpoint. The existing fail-closed local-AI guard is unchanged. Observational copy only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card is not execution readiness, not cognition proof, and not production traffic authority. Clearing the inherited loopback URL is not a provider selection or traffic-authority claim.
      </p>
    </article>
  );
}
