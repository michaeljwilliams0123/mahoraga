export function WindowsHealthyCandidateCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="windows-healthy-candidate">
      <span>Windows convergence health gate</span>
      <strong>Rejects unhealthy exact-SHA candidates</strong>
      <p>
        Merged #1096 (1d1592f114ea) requires runtime.healthy === true before accepting exact-SHA candidates for Windows bootstrap and promotion. Observational source contract only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not live Windows controller activation, execution readiness, cognition proof, or production traffic authority. Installed convergence controller remains disabled.
      </p>
    </article>
  );
}
