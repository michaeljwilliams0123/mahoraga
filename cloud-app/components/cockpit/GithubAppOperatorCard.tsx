export function GithubAppOperatorCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="github-app-operator">
      <span>Native GitHub App operator</span>
      <strong>Source merged · live authority unclaimed</strong>
      <p>
        Merge #983 replaced the Composio proxy with direct GitHub App installation auth against api.github.com. Short-lived RS256 JWTs and repository-scoped installation tokens stay server-side. Writes require an exact observed main SHA, a mahoraga/* branch, bounded safe paths, and an attended owner session. Draft PRs only; mismatched readback closes the new PR and deletes only its newly created branch. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only. Deployment still needs protected Cloudflare secrets GITHUB_APP_ID, GITHUB_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY, then an attended exact-head draft-PR canary. This card is not live GitHub App authority, execution readiness, cognition readiness, or traffic authority. No Composio route remains the live write path.
      </p>
    </article>
  );
}
