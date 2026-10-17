export function PromotionExecutorObservationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="promotion-executor-observation">
      <span>Promotion executor observation</span>
      <strong>Fail-closed freshness · observational</strong>
      <p>
        Merged #1154 (4aafc15) rejects contradictory run/job lifecycle states, inconsistent completion metadata, and impossible/future-dated job timestamps for authenticated GitHub-run observers. Preserves substrateIdentity: unattested, capabilityHealth: unassessed, promotionAuthority: unassessed. Scheduling evidence never grants deployment authority. Metadata-only jobStartedAt/jobCompletedAt retained for provenance. Partial #663; does not attest runner substrate, capability health, owner authority, or post-deployment identity. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only. Not execution readiness, cognition readiness, or traffic authority.
      </p>
    </article>
  );
}
