/** Architecture facts only: neither configuration nor UI copy proves a live broker. */
export function ExecutionBrokerCard() {
  return (
    <article className="eclipse-status-card" aria-label="Universal execution broker" data-testid="execution-broker-card" data-build="7.0.0-alpha.2">
      <span>Universal execution broker</span>
      <strong>Live selection unobserved</strong>
      <p>
        MAHORAGA_EXECUTION_BROKER is the canonical private binding. Legacy connector binding applies only when the canonical binding is absent. Worker selection requires compatible capability, fresh attestation, narrowed authority, and zero-credit eligibility. A receipt-preserving handoff retains chainId and handoffs; codex.execute and self.evolve remain contained claims, not grants. Execution readiness, cognition readiness, and traffic authority are separate. No Railway or Vercel fallback. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only and is not activated on Windows.
      </p>
    </article>
  );
}
