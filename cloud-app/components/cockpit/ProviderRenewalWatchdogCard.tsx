export function ProviderRenewalWatchdogCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="provider-renewal-watchdog">
      <span>Provider admission renewal</span>
      <strong>Gateway-owned one-minute checks</strong>
      <p>
        Hard-zero provider admission renewal runs through the gateway-owned one-minute cron. Verified main deployment preserves renewal continuity. Sensitive values are never displayed. The Access-protected owner workflow is break-glass only. Deployment does not own scheduled renewal. Renewal re-proves billing only when the 30-minute margin requires it and never redeploys Workers. This is observational only—not runtime readiness or production traffic authority, and grants no traffic authority. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
