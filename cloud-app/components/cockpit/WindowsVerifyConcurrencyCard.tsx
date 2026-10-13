export function WindowsVerifyConcurrencyCard() {
  return (
    <article className="eclipse-status-card neutral">
      <span>Windows Verify concurrency</span>
      <strong>2 isolated workers</strong>
      <p>
        Merged #1082 caps the Windows Node test runner at two isolated workers after exact-main exposed a four-worker runtime-state timeout. Local validation: 2,168 tests passed in 168 seconds; focused workflow and release-baseline contracts pass 12/12. This preserves the Verify deduplication from #1081 while reducing Windows contention. Observational source-truth provenance only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card does not prove execution readiness, cognition, or production traffic authority.
      </p>
    </article>
  );
}
