"use client";

export function GovernanceObservationCard() {
  return (
    <article className="eclipse-status-card neutral">
      <span>Governance observation</span>
      <strong>Diagnostic only</strong>
      <p>
        Live ruleset 22502690 (2026-10-11 snapshot): 2 bypass actors (RepositoryRole pull_request mode, Integration always mode); 0 required approvals; no code-owner review. Omitted fields report unknown, never zero. Observational evidence only — does not grant authorization, does not treat bypass presence as approval, and distinguishes observed GitHub settings from independent owner approval. Green Verify is not independent approval.
      </p>
    </article>
  );
}
