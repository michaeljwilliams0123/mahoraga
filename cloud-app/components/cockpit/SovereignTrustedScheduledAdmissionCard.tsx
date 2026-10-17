export function SovereignTrustedScheduledAdmissionCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="sovereign-trusted-scheduled-admission">
      <span>Sovereign trusted scheduled admission</span>
      <strong>Release-evidence · observational</strong>
      <p>
        Merge #1151 (3bfa62bb) removes Copilot-attributed workflow_run from sovereign workflow. Admission now requires completed successful Publish Staged Mahoraga Update (release.yml) run for exact current-main SHA via Actions API. No release evidence holds without job mutation or tag. Hourly schedule and owner workflow_dispatch preserved. Ten-minute release-based cadence and source-scoped smoke retained. Zero-credit boundary, GitHub App PR identity, and Ubuntu/Windows Verify unchanged. Not execution readiness, cognition readiness, or traffic authority. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
