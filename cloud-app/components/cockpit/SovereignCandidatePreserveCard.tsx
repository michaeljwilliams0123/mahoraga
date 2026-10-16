export function SovereignCandidatePreserveCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="sovereign-candidate-preserve">
      <span>Sovereign candidate production</span>
      <strong>Preserve stale · observational</strong>
      <p>
        Merge #1135 (a79affdc) replaces destructive git push origin --delete on stale feature/sovereign refs with candidate-existing-base-drift refusal. Conflicting remote refs are never mutated. New candidates use deterministic feature/sovereign-<cycle-prefix>-<base-sha-prefix> identities so anchored cycles progress on newer main without colliding with unmerged refs. Exact cycle/base retries reuse the same branch. No remote-branch deletion path remains. Workflow is not execution readiness, cognition readiness, or traffic authority. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
