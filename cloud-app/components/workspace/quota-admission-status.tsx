import type { FreeTierAdmission } from "@/lib/free-tier-admission";

export function QuotaAdmissionStatus({ admission }: { admission: FreeTierAdmission | null }) {
  if (!admission) return null;
  const border = admission.held ? "#fed7aa" : "#bbf7d0";
  const background = admission.held ? "rgba(255,247,237,.97)" : "rgba(240,253,244,.97)";
  const color = admission.held ? "#9a3412" : "#166534";
  return (
    <aside
      aria-live="polite"
      aria-label="Cost route"
      style={{ position: "fixed", zIndex: 60, top: 66, right: 18, width: "min(360px, calc(100vw - 36px))", padding: "10px 12px", border: `1px solid ${border}`, borderRadius: 14, background, color, boxShadow: "0 12px 30px rgba(15,23,42,.12)", fontSize: 12 }}
    >
      <strong style={{ display: "block", fontSize: 13 }}>Cost route · {admission.label}</strong>
      {admission.held && <p style={{ margin: "5px 0 0", lineHeight: 1.4 }}>Routing held to protect zero-cost execution. No metered fallback will be used.</p>}
      {(admission.observedAt || admission.expiresAt) && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: "pointer" }}>Quota evidence</summary>
          {admission.observedAt && <div>Observed {formatTime(admission.observedAt)}</div>}
          {admission.expiresAt && <div>Expires {formatTime(admission.expiresAt)}</div>}
        </details>
      )}
    </aside>
  );
}

function formatTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}
