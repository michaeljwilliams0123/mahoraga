export function PagesSameOriginSessionCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="pages-same-origin-session">
      <span>Pages session persistence</span>
      <strong>Same-origin gateway handoff</strong>
      <p>
        Derived workspaces attempt one automatic handoff per tab to a validated HTTPS gateway origin. A return to Pages stops automatic navigation; explicit Cloudflare sign-in remains available. Mobile browsers can withhold cookies from cross-site frames. The gateway serves the workspace through a service binding after Access verifies the owner; the runtime bridge also works when its configured origin equals the page origin. API mutations stay same-origin, owner-authenticated, and fail-closed. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card does not grant traffic authority, runtime readiness, or production cutover.
      </p>
    </article>
  );
}
