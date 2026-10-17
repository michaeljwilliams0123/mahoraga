export function AutonomousExactMainCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="autonomous-exact-main">
      <span>Autonomous exact-main</span>
      <strong>Dispatch after Verify · observational</strong>
      <p>
        Merged #1150 dispatches the Cloudflare publication workflow directly after trusted verification matrix succeeds on exact main, refetching the Verify run and signed publication receipt, validating against supplied main SHA and run ID, then following the existing exact-head deployment and acceptance path. Owner recovery and ordinary push paths remain available. Observational CI continuity only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card does not grant traffic authority, runtime readiness, or production cutover.
      </p>
    </article>
  );
}
