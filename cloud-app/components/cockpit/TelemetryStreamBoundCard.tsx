export function TelemetryStreamBoundCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="telemetry-stream-bound">
      <span>Telemetry stream bound</span>
      <strong>45s max lifetime</strong>
      <p>
        Merged #1016 (214179ec5022) bounds telemetry SSE streams to a 45-second max lifetime and clears both timers so an already-open workspace heartbeat cannot pin the canonical execution-v1 Durable Object. The client reconnects immediately on a closed stream. Observational rollover only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not execution readiness, cognition proof, provider fallback, cost change, auth weakening, or production traffic authority.
      </p>
    </article>
  );
}
