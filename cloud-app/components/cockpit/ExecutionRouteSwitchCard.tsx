export function ExecutionRouteSwitchCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="execution-route-switch">
      <span>Durable execution route</span>
      <strong>Observational · auto/unset default</strong>
      <p>
        Merged #1071 adds repository-scoped GitHub Actions variable MAHORAGA_EXECUTION_ROUTE (auto | cloud | local | hold). Default/unset auto preserves current Steward/sovereign allocation. Cloud: Steward only on public free hosted Ubuntu (private holds, no private hosted minutes). Local: private repos only via owner CLI with existing MAHORAGA_PRIVATE_STEWARD_LOCAL_ENABLED gate and portable Windows labels (self-hosted, windows, x64, mahoraga, zero-credit); sovereign on those labels. Hold/unknown skips both workflows at job level before runner allocation. Offline local workers queue, never paid fallback. In-progress jobs unaffected. State lives in GitHub, not on any machine. Observational only; does not prove live mode, execution readiness, cognition, traffic authority, or paid entitlement. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
