import { projectDoShaQuiescence } from "@/lib/do-sha-quiescence";

export function DoShaQuiescenceCard({ reasonCode }: { reasonCode?: string | null }) {
  const projection = projectDoShaQuiescence(reasonCode);
  return (
    <article className={`eclipse-status-card ${projection.tone}`}>
      <span>Durable Object SHA quiescence · 7.0.0-alpha.2</span>
      <strong>{projection.statusLabel}</strong>
      <p>{projection.detail}</p>
    </article>
  );
}
