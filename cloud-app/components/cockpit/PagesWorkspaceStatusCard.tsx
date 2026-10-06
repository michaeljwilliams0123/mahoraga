export function PagesWorkspaceStatusCard({
  coreReady,
  bridgeOrigin,
}: {
  coreReady: boolean;
  bridgeOrigin: string;
}) {
  return (
    <article className="eclipse-status-card neutral" data-testid="pages-workspace-status">
      <span>GitHub Pages workspace</span>
      <strong>Online · dynamic runtime client</strong>
      <p>
        The github.io workspace stays online independently of execution connectivity. The runtime connection supplies live capability and task observations through the owner-authenticated gateway. Pages publishes the canonical UI assets; execution runs in the connected runtime.
        Mahoraga remains the product; 7.0.0-alpha.2 is build provenance only.
      </p>
      <p>
        Execution connection: {coreReady ? "Paired · readiness remains separate" : "Disconnected / offline"}.
        Execution readiness, cognition readiness, and traffic authority remain separate; no production traffic authority is inferred.
      </p>
      <p>
        Pages bridge origin (NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN from MAHORAGA_PAGES_BRIDGE_ORIGIN):{" "}
        {bridgeOrigin
          ? <>configured as <code>{bridgeOrigin}</code>; configuration alone does not establish a live Cloudflare connection.</>
          : "not configured; no live Cloudflare connection is claimed."}
      </p>
      <p>
        Execution remains fail-closed. Authentication and recovery pairing boundaries are unchanged.
        Cloudflare connector controls appear only when their origin is configured.
      </p>
    </article>
  );
}
