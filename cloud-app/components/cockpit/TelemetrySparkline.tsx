"use client";

import { useEffect, useState } from "react";

type StreamStatus = "CONNECTING" | "LIVE" | "DISCONNECTED";

const UNAVAILABLE = "telemetry unavailable";
const REASON = "telemetry-session-unavailable";

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function TelemetrySparkline() {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("CONNECTING");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Static Cloudflare workspace and github.io presentation must not read a session bearer
    // from localStorage or send one. TELEMETRY_STREAM_TOKEN stays optional and owner-side.
    // Worker contract (#931): 503 telemetry-session-unavailable until a genuine owner-authenticated transport exists.
    setStreamStatus("DISCONNECTED");
    setError("Owner-authenticated telemetry transport is not available in this static workspace.");
  }, []);

  return (
    <section className="cockpit-spark" aria-label="Live runtime telemetry" data-telemetry-session={REASON}>
      <div className="cockpit-sandbox-head">
        <span>SYSTEM_TELEMETRY_ENGINE</span>
        <span className="cockpit-pill steel">{streamStatus}</span>
      </div>
      <article className="eclipse-status-card warn" aria-label="Telemetry session">
        <span>Telemetry</span>
        <strong>{UNAVAILABLE}</strong>
        <p>
          {REASON}. Mahoraga build provenance 7.0.0-alpha.2. Browser credentials are not used.
          No live Railway fallback. Execution readiness, cognition readiness, and traffic authority stay separate and fail closed.
        </p>
      </article>
      <dl className="eclipse-metrics">
        <Metric label="Session" value={REASON} />
        <Metric label="Transport" value="unavailable" />
        <Metric label="CPU" value="not observed" />
        <Metric label="Memory" value="not observed" />
        <Metric label="Railway" value="retired · non-routing" />
      </dl>
      <p className="cockpit-muted">{error ?? "Awaiting authenticated runtime telemetry…"} CPU and memory stay unreported until a genuine owner-authenticated transport exists.</p>
    </section>
  );
}
