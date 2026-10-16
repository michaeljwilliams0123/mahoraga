"use client";

export function ExecutionSourceShaCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="execution-source-sha-card">
      <span>Execution source SHA</span>
      <strong>Persisted runtime TARGET_SHA (observational)</strong>
      <p>
        Captures the executing runtime's TARGET_SHA when native assistant, cognition and repository turns are stored.
        Nullable SQLite migration; preserved immutably through updates/history/replay. Legacy turns remain unknown.
        Runtime-reported provenance only — not independent source authentication or a complete per-transaction authority/durability receipt chain.
        Owner-visible reconnect/replay acceptance remains pending. Existing authentication and cost boundaries remain enforced.
        Merged #1113 is not live authority. 7.0.0-alpha.2 is provenance only.
      </p>
    </article>
  );
}
