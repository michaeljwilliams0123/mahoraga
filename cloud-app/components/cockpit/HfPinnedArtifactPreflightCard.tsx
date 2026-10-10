export function HfPinnedArtifactPreflightCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="hf-pinned-artifact-preflight">
      <span>Hugging Face pinned artifact preflight</span>
      <strong>Read-only Hub metadata</strong>
      <p>
        Merged #1050 adds a read-only preflight for one explicitly pinned Hugging Face artifact. Returns the Hub-reported LFS SHA-256 and byte count only for a safe .safetensors or .gguf file. Observational only: Hub metadata is not a downloaded, independently verified, admitted, or executable model. Uses public GET with omitted credentials and redirect rejection. Does not download weights, perform local hash or static scan, alter the model-supply-chain ledger, bind a runtime, invoke inference, or use a paid endpoint. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not execution readiness, cognition proof, or production traffic authority.
      </p>
    </article>
  );
}
