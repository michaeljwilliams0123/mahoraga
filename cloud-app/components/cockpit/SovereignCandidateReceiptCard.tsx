export function SovereignCandidateReceiptCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="sovereign-candidate-receipt">
      <span>Sovereign candidate receipt</span>
      <strong>Zero-credit · observational</strong>
      <p>
        After #1143 (55703bd5): producer-smoke is source-SHA-scoped (sovereign-producer-smoke-v2-<prefix>). Global v1 tag no longer suppresses later releases. Stale checkout against freshly fetched protected main is rejected before admission. Bounded 7-day sanitized outcome artifacts record dispositions (not-run, held, no-candidate, incomplete, unverified-candidate, candidate-ready, job-not-successful, failed). GitHub Actions success is separate from verified candidate/PR receipt retention; never claim candidate creation on skipped steps or non-candidate-ready disposition. candidateProven=true only with validated producer result + successful artifact retention. Does not prove merge, exact-head Verify, runtime, or traffic authority. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
