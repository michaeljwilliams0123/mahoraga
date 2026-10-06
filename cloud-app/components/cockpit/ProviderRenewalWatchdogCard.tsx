export function ProviderRenewalWatchdogCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="provider-renewal-watchdog">
      <span>Provider admission renewal</span>
      <strong>Short fifteen-minute checks</strong>
      <p>
        Merged #1006 isolates hard-zero provider admission renewal in a dedicated owner-dispatchable quarter-hour scheduled workflow as a one-shot exact-main check. Deployment does not own scheduled renewal. Access-protected requests inspect current freshness and re-prove billing only when the 30-minute margin requires it. Renewal never redeploys Workers. This is observational only—not runtime readiness or production traffic authority, and grants no traffic authority. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
