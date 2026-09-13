import type { FreeTierAdmission } from "@/lib/free-tier-admission";

export function QuotaAdmissionStatus({ admission }: { admission: FreeTierAdmission | null }) {
  if (!admission) return null;
  return (
    <aside className={admission.held ? "quota-admission quota-admission-held" : "quota-admission"} aria-live="polite" aria-label="Cost route">
      <strong>Cost route · {admission.label}</strong>
      {admission.held && <p>Routing held to protect zero-cost execution.</p>}
      {(admission.observedAt || admission.expiresAt) && <details><summary>Quota evidence</summary>{admission.observedAt && <div>Observed {admission.observedAt}</div>}{admission.expiresAt && <div>Expires {admission.expiresAt}</div>}</details>}
    </aside>
  );
}
