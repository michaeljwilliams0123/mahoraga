"use client";

export function GitHubReceiptValidationCard() {
  return (
    <article className="eclipse-status-card good">
      <span>GitHub receipt validation</span>
      <strong>Strengthened</strong>
      <p>Rejects impossible action results (merge without SHAs, dispatch as success, misclassified mutations, comments without ID) at persistence and UI projection boundaries. Valid native actions retain history/reconnect behavior. Invalid optional receipts do not discard saved answers or other task metadata. Observational only · related to #1148 · not traffic authority.</p>
    </article>
  );
}
