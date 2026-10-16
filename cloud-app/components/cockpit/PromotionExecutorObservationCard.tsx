export function PromotionExecutorObservationCard() {
  return (
    <article className="eclipse-status-card neutral">
      <span>Promotion runner observation</span>
      <strong>GitHub scheduling metadata (observational)</strong>
      <p>Bounded authenticated CLI observes current run + exact-attempt jobs + current run again via GitHub Actions REST. Accepts only fixed repo/workflow/main/SHA/attempt/job. Rejects drift, malformed/truncated responses, unavailable runner metadata. Receipt identifies GitHub-observed scheduling (runner id/name/group/labels, statuses) and expressly leaves substrateIdentity unattested, capabilityHealth unassessed, promotionAuthority unassessed. No token/raw errors in output. Does not add production gate, independently authenticate a machine, or claim authority. Live invocation and trusted mutation-boundary integration remain pending. Refs #1115 #663. Product remains Mahoraga; 7.0.0-alpha.2 is provenance only.</p>
    </article>
  );
}
