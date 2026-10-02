import type { RuntimeCapability } from "@/lib/runtime-relay";
import { projectProviderAdmissionLiveness } from "@/lib/provider-admission-liveness";

export function ProviderAdmissionRenewalCard({ runtimeCapabilities }: { runtimeCapabilities: readonly RuntimeCapability[] }) {
  const admissionLiveness = projectProviderAdmissionLiveness(runtimeCapabilities);
  return (
    <article className={`eclipse-status-card ${admissionLiveness.tone}`}>
      <span>Provider admission freshness</span>
      <strong>{admissionLiveness.statusLabel}</strong>
      <p>{admissionLiveness.detail}</p>
      <p>7.0.0-alpha.2 is build provenance only. Product name stays Mahoraga. Merge #952 is not live continuity or traffic authority.</p>
    </article>
  );
}
