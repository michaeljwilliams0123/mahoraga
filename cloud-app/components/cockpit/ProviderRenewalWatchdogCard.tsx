export function ProviderRenewalWatchdogCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="provider-renewal-watchdog">
      <span>Provider renewal watchdog</span>
      <strong>Replace stale scheduled runs</strong>
      <p>
        Scheduled renewal runs replace stale in-progress or rerun renewal runs so one shared lane cannot starve later five-minute opportunities. Deployment publication stays serialized and non-cancelling. The 30-minute freshness margin, exact-main verification, billing re-proof, Access checks, and renewal-without-deployment contract are unchanged. Merge #970 (9fdb1b8) is observational CI continuity only and is not traffic authority, runtime readiness, or production cutover. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
