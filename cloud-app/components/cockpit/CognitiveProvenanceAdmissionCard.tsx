function Card({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "good" | "warn" | "neutral" }) {
  return (
    <article className={`eclipse-status-card ${tone}`} aria-label={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function CognitiveProvenanceAdmissionCard() {
  return (
    <Card
      label="Cognitive provenance admission"
      value="Fixtures supply valid expectedSourceCommit"
      detail="Observational only: runtime fixtures now supply valid expectedSourceCommit provenance (40-hex SHA, state 'current') for cognitive admission to avoid invalid provenance rejection in predictive simulation tests. Production remains fail-closed. Does not grant traffic authority or change production admission logic. Execution readiness, cognition readiness, and traffic authority remain separate. Product is Mahoraga; 7.0.0-alpha.2 is build provenance metadata only."
      tone="neutral"
    />
  );
}
