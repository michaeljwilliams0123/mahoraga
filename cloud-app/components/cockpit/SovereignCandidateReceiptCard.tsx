export function SovereignCandidateReceiptCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="sovereign-candidate-receipt">
      <span>Sovereign candidate receipt</span>
      <strong>Zero-credit · observational</strong>
      <p>
        Merge #1136 (001c8aa8) admits real zero-credit candidate via repository-scoped GitHub App token (contents:write + pull-requests:write only). Content-free 7-day artifact receipt projects cycleId, window, base/head SHA, PR number, branch, changed-files digest, creditCost=0, paidFallback=false. Draft PRs; Verify uses job github.token only. One-shot when test/sovereign-candidate-receipt.test.mjs absent (issue #786). Not execution readiness, cognition readiness, or traffic authority. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
