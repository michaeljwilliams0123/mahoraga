export type PredictionBacktestSegment = {
  segment: string;
  trainSamples: number;
  heldOutSamples: number;
  evidenceSufficient: boolean;
  withheld: boolean;
};

export type PredictionBacktestSurface = {
  status: "observed" | "hold" | "absent";
  reason: string;
  fingerprint: string | null;
  splitAt: number | null;
  trainRange: { from: string; to: string } | null;
  heldOutRange: { from: string; to: string } | null;
  trainPlannerTrust: number | null;
  heldOutPlannerTrust: number | null;
  trainCalibrationGap: number | null;
  heldOutCalibrationGap: number | null;
  trainNormalizedError: number | null;
  heldOutNormalizedError: number | null;
  trustDelta: number | null;
  calibrationGapDelta: number | null;
  normalizedErrorDelta: number | null;
  evidenceSufficient: boolean;
  segments: PredictionBacktestSegment[];
  sourceFingerprints: string[];
  generalizes: false;
  promotion: false;
  trafficAuthority: false;
};

const SHA256 = /^[a-f0-9]{64}$/;
const SEGMENT = /^[a-z0-9][a-z0-9-]{0,63}$/;

const obj = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const hash = (value: unknown): string | null => typeof value === "string" && SHA256.test(value) ? value : null;
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const count = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) return null;
  return value;
}

function range(value: unknown): { from: string; to: string } | null {
  const record = obj(value);
  const from = canonicalTimestamp(record?.from);
  const to = canonicalTimestamp(record?.to);
  if (!from || !to) return null;
  return { from, to };
}

function empty(status: PredictionBacktestSurface["status"], reason: string): PredictionBacktestSurface {
  return {
    status,
    reason,
    fingerprint: null,
    splitAt: null,
    trainRange: null,
    heldOutRange: null,
    trainPlannerTrust: null,
    heldOutPlannerTrust: null,
    trainCalibrationGap: null,
    heldOutCalibrationGap: null,
    trainNormalizedError: null,
    heldOutNormalizedError: null,
    trustDelta: null,
    calibrationGapDelta: null,
    normalizedErrorDelta: null,
    evidenceSufficient: false,
    segments: [],
    sourceFingerprints: [],
    generalizes: false,
    promotion: false,
    trafficAuthority: false,
  };
}

function summaryFields(value: unknown): {
  plannerTrust: number;
  meanCalibrationGap: number;
  meanNormalizedError: number;
  evidenceSufficient: boolean;
} | null {
  const record = obj(value);
  if (!record || record.kind !== "prediction-calibration-summary" || record.schemaVersion !== 1) return null;
  if (!hash(record.fingerprint)) return null;
  const plannerTrust = finite(record.plannerTrust);
  const meanCalibrationGap = finite(record.meanCalibrationGap);
  const meanNormalizedError = finite(record.meanNormalizedError);
  if (plannerTrust === null || meanCalibrationGap === null || meanNormalizedError === null) return null;
  if (typeof record.evidenceSufficient !== "boolean") return null;
  if (count(record.sampleCount) === null) return null;
  return {
    plannerTrust,
    meanCalibrationGap,
    meanNormalizedError,
    evidenceSufficient: record.evidenceSufficient,
  };
}

function projectSegments(value: unknown): PredictionBacktestSegment[] | null {
  if (!Array.isArray(value) || value.length > 256) return null;
  const segments: PredictionBacktestSegment[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = obj(item);
    if (!record || typeof record.segment !== "string" || !SEGMENT.test(record.segment)) return null;
    if (seen.has(record.segment)) return null;
    seen.add(record.segment);
    const trainSamples = count(record.trainSamples);
    const heldOutSamples = count(record.heldOutSamples);
    if (trainSamples === null || heldOutSamples === null) return null;
    const sufficient = record.evidenceSufficient === true;
    if (sufficient) {
      if (!summaryFields(record.trainSummary) || !summaryFields(record.heldOutSummary)) return null;
    } else if (record.trainSummary != null && !summaryFields(record.trainSummary)) {
      return null;
    } else if (record.heldOutSummary != null && !summaryFields(record.heldOutSummary)) {
      return null;
    }
    segments.push({
      segment: record.segment,
      trainSamples,
      heldOutSamples,
      evidenceSufficient: sufficient,
      withheld: !sufficient,
    });
  }
  return segments.sort((left, right) => left.segment.localeCompare(right.segment));
}

export function projectPredictionBacktestSurface(value: unknown): PredictionBacktestSurface {
  const root = obj(value);
  if (!root) return empty("absent", "prediction-backtest-unobserved");
  if (root.kind !== "prediction-calibration-backtest" || root.schemaVersion !== 1) {
    return empty("hold", "prediction-backtest-invalid");
  }
  if (root.generalizes === true || root.promotion === true || root.trafficAuthority === true) {
    return empty("hold", "prediction-backtest-authority-claim");
  }

  const fingerprint = hash(root.fingerprint);
  const splitAt = Number.isSafeInteger(root.splitAt) ? Number(root.splitAt) : null;
  const trainRange = range(root.trainRange);
  const heldOutRange = range(root.heldOutRange);
  const trainSummary = summaryFields(root.trainSummary);
  const heldOutSummary = summaryFields(root.heldOutSummary);
  const trustDelta = finite(root.trustDelta);
  const calibrationGapDelta = finite(root.calibrationGapDelta);
  const normalizedErrorDelta = finite(root.normalizedErrorDelta);
  const sourceFingerprints = Array.isArray(root.sourceFingerprints)
    ? root.sourceFingerprints.filter((item): item is string => typeof item === "string")
    : null;
  const segments = projectSegments(root.segments);

  if (!fingerprint || splitAt === null || splitAt < 1 || !trainRange || !heldOutRange) {
    return empty("hold", "prediction-backtest-invalid");
  }
  if (!trainSummary || !heldOutSummary || trustDelta === null || calibrationGapDelta === null || normalizedErrorDelta === null) {
    return empty("hold", "prediction-backtest-invalid");
  }
  if (!sourceFingerprints || sourceFingerprints.length < 2 || sourceFingerprints.length > 256) {
    return empty("hold", "prediction-backtest-invalid");
  }
  if (sourceFingerprints.some((item) => !SHA256.test(item))) return empty("hold", "prediction-backtest-invalid");
  if (new Set(sourceFingerprints).size !== sourceFingerprints.length) {
    return empty("hold", "prediction-backtest-duplicate-outcome");
  }
  if (trainRange.to >= heldOutRange.from) return empty("hold", "prediction-backtest-leakage");
  if (!segments) return empty("hold", "prediction-backtest-invalid");

  return {
    status: "observed",
    reason: root.evidenceSufficient === true
      ? "observational-held-out-backtest"
      : "prediction-backtest-evidence-insufficient",
    fingerprint,
    splitAt,
    trainRange,
    heldOutRange,
    trainPlannerTrust: trainSummary.plannerTrust,
    heldOutPlannerTrust: heldOutSummary.plannerTrust,
    trainCalibrationGap: trainSummary.meanCalibrationGap,
    heldOutCalibrationGap: heldOutSummary.meanCalibrationGap,
    trainNormalizedError: trainSummary.meanNormalizedError,
    heldOutNormalizedError: heldOutSummary.meanNormalizedError,
    trustDelta,
    calibrationGapDelta,
    normalizedErrorDelta,
    evidenceSufficient: trainSummary.evidenceSufficient && heldOutSummary.evidenceSufficient && root.evidenceSufficient === true,
    segments,
    sourceFingerprints,
    generalizes: false,
    promotion: false,
    trafficAuthority: false,
  };
}
