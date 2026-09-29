"use client";

import { projectPredictionBacktestSurface } from "@/lib/prediction-backtest-surface";

function StatusCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "good" | "warn" | "neutral" }) {
  return (
    <article className={`eclipse-status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

const short = (value: string | null) => value ? value.slice(0, 12) : "unverified";
const num = (value: number | null) => value === null ? "unverified" : String(value);

export function PredictionBacktestCards({ snapshot }: { snapshot: unknown }) {
  const backtest = projectPredictionBacktestSurface(snapshot);
  const tone = backtest.status === "observed" ? (backtest.evidenceSufficient ? "good" : "warn") : backtest.status === "hold" ? "warn" : "neutral";
  const windowDetail = backtest.trainRange && backtest.heldOutRange
    ? `train ${backtest.trainRange.from} → ${backtest.trainRange.to} · held-out ${backtest.heldOutRange.from} → ${backtest.heldOutRange.to}`
    : "chronological train vs held-out windows unverified";
  const segmentDetail = backtest.segments.length
    ? backtest.segments.map((segment) => `${segment.segment} ${segment.withheld ? "withheld-sparse" : "sufficient"}`).join(" · ")
    : "no segment evidence";

  return (
    <>
      <StatusCard
        label="Held-out prediction calibration"
        value={backtest.status === "observed" ? "Observational backtest" : backtest.status === "hold" ? "Fail closed" : "Unobserved"}
        detail={`${backtest.reason} · chronological train vs held-out · fail-closed on duplicate outcomes and overlapping timestamps · empirical evidence only · no generalizes / promotion / traffic-authority inference · Merge #877 is not live traffic authority`}
        tone={tone}
      />
      <StatusCard
        label="Train vs held-out deltas"
        value={backtest.status === "observed" ? `plannerTrust Δ ${num(backtest.trustDelta)}` : "Withheld"}
        detail={`${windowDetail} · plannerTrust train ${num(backtest.trainPlannerTrust)} / held-out ${num(backtest.heldOutPlannerTrust)} · calibration-gap Δ ${num(backtest.calibrationGapDelta)} · normalized-error Δ ${num(backtest.normalizedErrorDelta)} · summarizePredictionCalibration reused · no hidden generalizes threshold`}
        tone={tone}
      />
      <StatusCard
        label="Backtest receipt"
        value={short(backtest.fingerprint)}
        detail={`frozen prediction-calibration-backtest · ${segmentDetail} · source fingerprints ${backtest.sourceFingerprints.length} · withheld sufficiency when either side is sparse · github.io presentation only · execution readiness, cognition readiness, and traffic authority remain separate fail-closed claims`}
        tone="neutral"
      />
    </>
  );
}
