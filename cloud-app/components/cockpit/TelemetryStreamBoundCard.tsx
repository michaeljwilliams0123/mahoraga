export function TelemetryStreamBoundCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="telemetry-stream-bound">
      <span>Telemetry stream bound</span>
      <strong>45s max lifetime</strong>
      <div aria-hidden="true" style={{ display: "grid", gap: 6, marginTop: 8 }}>
        <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #7d8cff, #f0c36a)" }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
          <span>open timer cleared</span>
          <span>close timer cleared</span>
          <span>reconnect immediate</span>
        </div>
      </div>
      <p>
        Merged #1016 (214179ec5022) bounds telemetry SSE streams to a 45-second max lifetime and clears both timers so an already-open workspace heartbeat cannot pin the canonical execution-v1 Durable Object. The client reconnects immediately on a closed stream. Observational rollover only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not execution readiness, cognition proof, provider fallback, cost change, auth weakening, or production traffic authority.
      </p>
    </article>
  );
}
