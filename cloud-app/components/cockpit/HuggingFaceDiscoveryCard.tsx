export function HuggingFaceDiscoveryCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="hf-discovery-surface">
      <span>Hugging Face discovery</span>
      <strong>Bounded read-only</strong>
      <p>
        Merged #1038 (e92992c) adds bounded verified Hugging Face read-only discovery (models/papers metadata) and offline benchmark preflight scoring. Observational surface only. No hosted inference, no model admission, no runtime capability, no production activation, no authority claims. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Fail-closed: upstream or local probes hold without paid fallback or execution.
      </p>
    </article>
  );
}
