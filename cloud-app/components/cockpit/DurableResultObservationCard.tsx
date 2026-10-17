export function DurableResultObservationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="durable-result-observation">
      <span>Durable result observation</span>
      <strong>Runtime-reported · observational</strong>
      <p>
        After #1144, authenticated tasks read compares the persisted turn's own assistant content ID, conversation ID, role and answer hash to the stored encrypted answer metadata. Bounded statuses only: matched, missing, mismatch, or not-observed. No plaintext, hash, ciphertext or secret leaves the object. Explicitly runtime-reported; not independent execution, replay, authority, routing or source verification. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
