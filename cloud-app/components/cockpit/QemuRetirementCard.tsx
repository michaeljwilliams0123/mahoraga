"use client";

export function QemuRetirementCard() {
  return (
    <article className="eclipse-status-card neutral">
      <span>Obsolete QEMU Linux guest</span>
      <strong>Retired as CI blocker</strong>
      <p>No longer a source-level prerequisite for cloud availability. #571 host-recovery not planned/obsolete. Protected Verify uses hosted Ubuntu/Windows; canonical Cloudflare jobs use hosted Ubuntu; remaining self-hosted selectors machine-neutral Windows. Observational only; no host/runner/credential/workflow modification. Pages operator-selected runner-label override retained as caveat. Optional future maintenance requires fresh host evidence.</p>
    </article>
  );
}
