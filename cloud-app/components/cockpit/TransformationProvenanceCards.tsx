import { projectTransformationProvenanceSurface } from "@/lib/transformation-provenance-surface";

function Card({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="eclipse-status-card neutral" aria-label={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function TransformationProvenanceCards() {
  const surface = projectTransformationProvenanceSurface();
  return (
    <>
      <Card
        label="Transformation kinds"
        value={surface.kinds.join(" · ")}
        detail="Frozen deterministic interaction-transformation-receipt records · observational StatusCards and telemetry only"
      />
      <Card
        label="Source vs derivative"
        value="Distinct fingerprints"
        detail="Original source reference/fingerprint and derivative output reference/fingerprint remain separate facts · derivatives never overwrite source meaning"
      />
    </>
  );
}
