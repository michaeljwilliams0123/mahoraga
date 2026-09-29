import type { RuntimeCapability } from "@/lib/runtime-relay";
import { projectProviderAdmissionLiveness } from "@/lib/provider-admission-liveness";

export function ProviderAdmissionRenewalCard({ runtimeCapabilities }: { runtimeCapabilities: readonly RuntimeCapability[] }) {
  const admissionLiveness = projectProviderAdmissionLiveness(runtimeCapabilities);
  return (
    <article className={`eclipse-status-card ${admissionLiveness.tone}`}>
      <span>Provider admission renewal</span>
      <strong>{admissionLiveness.statusLabel}</strong>
      <p>{admissionLiveness.detail}</p>
    </article>
  );
}
