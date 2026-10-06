export function PagesSameOriginSessionCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="pages-same-origin-session">
      <span>Pages session persistence</span>
      <strong>Same-origin gateway handoff</strong>
      <p>
        Merged #998 stops embedding the Access-protected owner gateway as a cross-site iframe. Mobile browsers can withhold the Cloudflare session cookie from that frame, so a successful auth tab could still return execution to Degraded. Derived static workspaces hand off once to the configured gateway; the gateway serves the workspace through a service binding after Access verifies the owner. The runtime bridge also works when its configured origin equals the page origin. API mutations stay same-origin, owner-authenticated, and fail-closed. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card does not grant traffic authority, runtime readiness, or production cutover.
      </p>
    </article>
  );
}
