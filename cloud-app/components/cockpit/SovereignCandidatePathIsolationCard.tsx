export function SovereignCandidatePathIsolationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="sovereign-candidate-path-isolation">
      <span>Sovereign candidate path isolation</span>
      <strong>Adversarial regression · observational</strong>
      <p>
        Merge #1156 (29e0c14) adds adversarial regression tests for paths, trust-plane writes, and traversal in sovereign candidate cycle (Refs #1145). Zero-credit, fail-closed isolation only; no production traffic authority, execution readiness, or cognition claims. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
