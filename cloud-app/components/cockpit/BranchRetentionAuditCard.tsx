export function BranchRetentionAuditCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="branch-retention-audit">
      <span>Branch retention audit</span>
      <strong>Read-only exact-ref (observational)</strong>
      <p>
        Merged #1058 consolidates branch cleanup ledger into a reproducible read-only exact-ref audit. Live classification: 333 non-main branches, 953 PR-history records; 145 reconcile, 36 contained cleanup candidates, 152 archive-first (all advisory). Never deletes, pushes, merges, or creates PRs. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card does not grant deletion authority, UI snapshot restoration, or production changes.
      </p>
    </article>
  );
}
