/** Observational StatusCard for broker-owned handoff identity and hop limits (merged #1093). Product remains Mahoraga; 7.0.0-alpha.2 is provenance only. Fail-closed: no traffic authority or capability activation. */
export function HandoffHopLimitsCard() {
  return (
    <article className="eclipse-status-card neutral" aria-label="Broker-owned handoff identity and hop limits" role="status">
      <span>Broker-owned handoff identity &amp; hop limits</span>
      <strong>Observed contract (fail-closed)</strong>
      <p>
        Hop budget validated as positive safe-integer before any provider interaction.
        Each successor bound to the leased worker; hop count must match the broker-owned chain counter.
        Original maximum enforced before another dispatch. Rejected-chain selection receipts and valid five-worker continuity preserved.
        Observational only · no traffic/domain authority · no new provider or routing capability · contributes to #547 continuity without claiming live multi-provider exhaustion complete.
        Product: Mahoraga · build provenance 7.0.0-alpha.2 only.
      </p>
    </article>
  );
}
