export function UnmanagedWorkerInventoryCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="unmanaged-worker-inventory">
      <span>Unmanaged Worker inventory</span>
      <strong>Discovered · standby · non-routable</strong>
      <p>
        Live Cloudflare Worker lively-smoke-02ec recorded as source-unreferenced discovered inventory (logicalId edge.discovered.lively-smoke-02ec). Explicitly non-canonical, non-routable, standby lifecycle. No disable/delete, no route/binding/credential/billing change. Ownership/provenance review pending. Observational only; does not grant traffic, execution, or runtime authority. Product remains Mahoraga; 7.0.0-alpha.2 is provenance only.
      </p>
    </article>
  );
}
