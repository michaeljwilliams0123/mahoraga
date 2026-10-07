export function StaleDisconnectSelfHealCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="stale-disconnect-self-heal">
      <span>Stale execution disconnect</span>
      <strong>One bounded 5s reconnect</strong>
      <p>
        Merged #1014 (2a2e5e4245b1) self-heals a visible disconnected workspace tab with one bounded 5-second reconnect. Retry stays suppressed while owner PIN authentication is required. Only the stale assistant-route error clears when fresh capability evidence shows assistant.respond routable. Observational workspace recovery only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not execution readiness, cognition proof, provider fallback, cost change, or production traffic authority.
      </p>
    </article>
  );
}
