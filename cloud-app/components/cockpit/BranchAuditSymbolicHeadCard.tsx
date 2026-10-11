export function BranchAuditSymbolicHeadCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="branch-audit-symbolic-head">
      <span>Branch retention audit</span>
      <strong>Symbolic origin/HEAD excluded</strong>
      <p>
        Merged #1068: branch retention proof parses full %(refname) and excludes the symbolic refs/remotes/origin/HEAD so a synchronized clone no longer fails closed on the non-branch short name. Local prune remains read-only. Observational copy only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card is not execution readiness, not cognition proof, not production traffic authority, and does not authorize any branch deletion.
      </p>
    </article>
  );
}
