export function VerifyWindowsAccelerationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="verify-windows-acceleration">
      <span>Verify Windows acceleration</span>
      <strong>Observational (deduplicated gates)</strong>
      <p>
        Merged #1081 cuts redundant Verify work: removed separate conversation-plane, typecheck, and self-upgrade steps from the matrix. Windows uses verify:windows (pretest + test:windows with concurrency=4, no --test-isolation=none). Ubuntu retains full verify + gap:audit. Shared pretest includes typecheck and other gates. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This is not execution readiness, cognition proof, or production traffic authority. Merge #1081 is not live authority.
      </p>
    </article>
  );
}
