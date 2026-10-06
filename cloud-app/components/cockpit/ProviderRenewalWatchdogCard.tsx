export function ProviderRenewalWatchdogCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="provider-renewal-watchdog">
      <span>Provider admission renewal</span>
      <strong>Short fifteen-minute checks</strong>
      <p>
        Hard-zero provider admission renewal runs in a dedicated owner-dispatchable quarter-hour scheduled workflow as a one-shot exact-main check. Deployment does not own scheduled renewal. Access-protected requests inspect current freshness and re-prove billing only when the 30-minute margin requires it. Renewal never redeploys Workers. This is observational only—not runtime readiness, production traffic authority, or traffic authority. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
