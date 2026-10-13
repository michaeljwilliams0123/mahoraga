export function WindowsWorktreeGuardCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="windows-worktree-guard">
      <span>Windows convergence installer guard</span>
      <strong>Stale/dirty worktree preserved (observational)</strong>
      <p>
        Merged #1079 fails closed before worktree removal, sparse-checkout disable, or hard reset unless the existing controller directory is a clean, detached Git worktree at the exact controller root. Unconditional force removal and recursive deletion removed. Questionable paths preserved with stable refusal reasons. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. No Windows upgrade, scheduler start, state migration, or public listener. Not execution readiness, not cognition proof, and not production traffic authority.
      </p>
    </article>
  );
}
