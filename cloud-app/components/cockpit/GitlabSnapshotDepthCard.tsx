export function GitlabSnapshotDepthCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="gitlab-snapshot-depth">
      <span>GitLab snapshot verification</span>
      <strong>GIT_DEPTH=0 full ancestry</strong>
      <p>
        Merged #1085 sets GIT_DEPTH=0 in .gitlab-ci.yml so snapshot runners fetch full history for signed controller handshake ancestry (ancestor 397 commits behind). Observational checkout completeness only. Preserves handshake validation and separate GitLab main assurance. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This change is not execution readiness, cognition proof, or production traffic authority.
      </p>
    </article>
  );
}
