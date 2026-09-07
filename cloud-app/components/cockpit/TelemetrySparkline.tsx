"use client";

type Point = { t: string; v: number };

const DEMO: Point[] = [
  { t: "0s", v: 0.12 },
  { t: "10s", v: 0.18 },
  { t: "20s", v: 0.08 },
  { t: "30s", v: 0.15 },
  { t: "40s", v: 0.11 },
  { t: "50s", v: 0.09 },
];

export function TelemetrySparkline({ points = DEMO }: { points?: Point[] }) {
  const width = 640;
  const height = 160;
  const pad = 12;
  const max = Math.max(...points.map((p) => p.v), 0.01);
  const min = Math.min(...points.map((p) => p.v), 0);
  const span = Math.max(max - min, 0.01);
  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((point.v - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <div className="cockpit-spark" aria-label="Observational entropy sparkline">
      <div className="cockpit-sandbox-head">
        <span>METAMORPHIC_ENTROPY_INDICES</span>
        <span className="cockpit-pill steel">DEMO_OBSERVATIONAL</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
        <polyline fill="none" stroke="#10b981" strokeWidth="3" points={coords.join(" ")} />
      </svg>
      <p className="cockpit-muted">Demo series only — not live L7 mesh telemetry (out of bounds for this lane).</p>
    </div>
  );
}
