export function NativeGithubMergeCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="native-github-merge">
      <span>Native GitHub merge</span>
      <strong>Exact-SHA · fail-closed · observational</strong>
      <p>
        Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Merged #984 adds first-party GitHub App actions for exact-SHA squash merges and exact-SHA non-force direct-main commits on michaeljwilliams0123/mahoraga. Both verify GitHub readback before a receipt and fail closed if main or the PR head has moved. force stays false. Sensitive paths and credential-shaped content are rejected. No Composio dependency. Merge #984 is not live traffic authority, runtime readiness, or production cutover. Receipt 49da2670c239.
      </p>
    </article>
  );
}
