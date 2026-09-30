"use client";

import { useEffect, useMemo, useState } from "react";

type StreamStatus = "CONNECTING" | "LIVE" | "DISCONNECTED";
type TelemetryPayload = {
  schemaVersion: 1;
  observedAt: string;
  patch_sha: string;
  component_target: string | null;
  line_changes: number | null;
  verification_status: string;
  live_cpu_usage_ms: number | null;
  live_memory_usage_mb: number | null;
  providerId?: string;
  providerReasonCode?: string | null;
};

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function TelemetrySparkline() {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("CONNECTING");
  const [metrics] = useState<TelemetryPayload[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStreamStatus("DISCONNECTED");
    setError("Owner-authenticated telemetry transport is not available in this static workspace.");
  }, []);

  const latest = metrics[0] ?? null;
  const points = useMemo(() => metrics
    .filter((entry) => typeof entry.live_cpu_usage_ms === "number")
    .slice().reverse(), [metrics]);
  const width = 640;
  const height = 120;
  const pad = 12;
  const max = Math.max(...points.map((point) => point.live_cpu_usage_ms ?? 0), 1);
  const coordinates = points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((point.live_cpu_usage_ms ?? 0) / max) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <section className="cockpit-spark" aria-label="Live runtime telemetry">
      <div className="cockpit-sandbox-head">
        <span>SYSTEM_TELEMETRY_ENGINE</span>
        <span className={`cockpit-pill ${streamStatus === "LIVE" ? "green" : "steel"}`}>{streamStatus}</span>
      </div>
      {latest ? (
        <>
          <dl className="eclipse-metrics">
            <Metric label="Active SHA" value={latest.patch_sha.slice(0, 12)} />
            <Metric label="Verification" value={latest.verification_status} />
            <Metric label="CPU" value={latest.live_cpu_usage_ms === null ? "not observed" : `${latest.live_cpu_usage_ms.toFixed(1)} ms`} />
            <Metric label="Memory" value={latest.live_memory_usage_mb === null ? "not observed" : `${latest.live_memory_usage_mb.toFixed(1)} MB`} />
            <Metric label="Observed" value={new Date(latest.observedAt).toLocaleString()} />
            <Metric label="Provider" value={latest.providerId ?? "unavailable"} />
          </dl>
          {coordinates.length > 1 ? (
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Observed CPU time trend">
              <polyline fill="none" stroke="#10b981" strokeWidth="3" points={coordinates.join(" ")} />
            </svg>
          ) : (
            <p className="cockpit-muted">CPU and memory stay unreported until the runtime supplies measured values.</p>
          )}
        </>
      ) : (
        <p className="cockpit-muted">{error ?? "Awaiting authenticated runtime telemetry…"}</p>
      )}
    </section>
  );
}
