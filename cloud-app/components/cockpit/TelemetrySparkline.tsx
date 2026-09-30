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

const MAX_SAMPLES = 50;
const runtimeUrl = () => (process.env.NEXT_PUBLIC_MAHORAGA_RUNTIME_URL ?? "").replace(/\/$/, "");

function parseEventBlock(block: string): { event: string; data: string } | null {
  if (!block || block.startsWith(":")) return null;
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length ? { event, data: data.join("\n") } : null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function TelemetrySparkline() {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("CONNECTING");
  const [metrics, setMetrics] = useState<TelemetryPayload[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const connect = async (): Promise<void> => {
      const baseUrl = runtimeUrl();
      const token = window.localStorage.getItem("MAHORAGA_SESSION_TOKEN") ?? "";
      if (!baseUrl || !token) {
        setStreamStatus("DISCONNECTED");
        setError(!baseUrl ? "Runtime URL is not configured." : "Owner session token is unavailable.");
        return;
      }
      setStreamStatus(attempts === 0 ? "CONNECTING" : "DISCONNECTED");
      try {
        const response = await fetch(`${baseUrl}/api/stream/telemetry`, {
          method: "GET",
          headers: { accept: "text/event-stream", authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !response.body || !(response.headers.get("content-type") ?? "").startsWith("text/event-stream")) {
          throw new Error(response.status === 401 || response.status === 403 ? "Telemetry authorization failed." : "Telemetry stream unavailable.");
        }
        attempts = 0;
        setError(null);
        setStreamStatus("LIVE");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const parsed = parseEventBlock(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            if (parsed?.event === "telemetry_update") {
              const payload = JSON.parse(parsed.data) as TelemetryPayload;
              if (payload.schemaVersion === 1 && typeof payload.patch_sha === "string" && typeof payload.verification_status === "string") {
                setMetrics((current) => [payload, ...current].slice(0, MAX_SAMPLES));
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
        if (!controller.signal.aborted) throw new Error("Telemetry stream closed.");
      } catch (cause) {
        if (controller.signal.aborted) return;
        attempts += 1;
        setStreamStatus("DISCONNECTED");
        setError(cause instanceof Error ? cause.message : "Telemetry stream unavailable.");
        reconnectTimer = setTimeout(() => { void connect(); }, Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5)));
      }
    };

    void connect();
    return () => {
      controller.abort();
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    };
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
