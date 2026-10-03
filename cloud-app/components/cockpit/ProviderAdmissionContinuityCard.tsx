export function ProviderAdmissionContinuityCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="provider-admission-continuity">
      <span>Provider admission continuity</span>
      <strong>Observational / fail-closed</strong>
      <p>
        Merged #969 keeps the already-started exact-main renewal job inside a bounded 320-minute watchdog (workflow hard ceiling 330 minutes) and inspects canonical runtime admission every 5 minutes. Cron delivery is not continuous readiness. Re-proves Cloudflare billing only after the existing 30-minute margin. Refreshes admission without redeploying Workers. Fails closed if main advances, provider identity changes, post-renewal freshness is unobserved, or the repository is not public. actions: read only. No Railway, no Vercel, no paid fallback. Not traffic authority. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
