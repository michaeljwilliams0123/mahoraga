export function ProviderRenewalWatchdogCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="provider-renewal-watchdog">
      <span>Provider admission renewal</span>
      <strong>Short fifteen-minute checks</strong>
      <p>
        Each scheduled renewal is a bounded quarter-hour one-shot check rather than a long-lived watchdog. It inspects current freshness, re-proves billing only when the 30-minute margin requires it, renews admission without redeploying, and exits so a later main update cannot strand the renewal lane. Deployment publication stays serialized and non-cancelling. This is operational continuity only, not traffic authority or runtime readiness. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
