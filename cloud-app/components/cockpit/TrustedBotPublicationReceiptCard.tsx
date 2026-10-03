export const TRUSTED_BOT_PUBLICATION_RECEIPT = {
  product: "Mahoraga",
  buildProvenanceOnly: "7.0.0-alpha.2",
  sourcePr: 967,
  artifact: "verified-main-publication-v1",
  sourceArtifact: "autonomous-main-publication",
  chain: "Autonomous Integration merge -> dispatch exact Verify -> bind source receipt to Verify run ID -> verified-main-publication artifact",
  actorOnlyTrust: false,
  grantsTrafficAuthority: false,
} as const;

export function TrustedBotPublicationReceiptCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="trusted-bot-publication-receipt">
      <span>Trusted bot publication</span>
      <strong>Receipt required · fail closed</strong>
      <p>
        Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Bot workflow-dispatch to Cloudflare runtime, GitHub Pages, or a staged GitHub release is observationally denied until an immutable receipt from the canonical Autonomous Integration run that produced the same merged SHA is bound to the exact Verify run ID and a normalized verified-main-publication-v1 artifact. Missing, duplicate, expired, malformed, foreign, stale, or replayed receipts fail closed. Actor identity alone is not publication trust. This card does not grant traffic authority, runtime readiness, or production cutover. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
