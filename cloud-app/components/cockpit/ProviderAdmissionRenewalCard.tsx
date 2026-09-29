import { projectProviderAdmissionLiveness } from "@/lib/provider-admission-liveness";
import type { Health } from "../workspace/workspace-types";

export function ProviderAdmissionRenewalCard({ health }: { health: Health | null }) {
  const admissionLiveness = projectProviderAdmissionLiveness(health);
  return (
    <article className={`eclipse-status-card ${admissionLiveness.tone}`}>
      <span>Provider admission renewal</span>
      <strong>{admissionLiveness.statusLabel}</strong>
      <p>{admissionLiveness.detail}</p>
    </article>
  );
}
