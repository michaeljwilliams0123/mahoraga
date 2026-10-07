export function ExactMainConvergenceDiagnosticCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="exact-main-convergence-diagnostic">
      <span>Exact-main convergence</span>
      <strong>Bounded diagnostic only</strong>
      <p>
        Merged #1027 (b18c2ef6c5f9) keeps exact /api/live, /api/ready, source SHA, SQLite durability, retry, and Access gates unchanged. A timeout now returns only a bounded category such as live-http-302-ready-http-503, ready-sha-mismatch, ready-durable-state-mismatch, or transport-or-payload-invalid. Response bodies, credentials, external error text, and tokens stay unprinted. Observational diagnosis only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not execution readiness, admission change, gate bypass, or production traffic authority. executionAuthorityGranted stays false until a separate exact-SHA acceptance receipt.
      </p>
    </article>
  );
}
