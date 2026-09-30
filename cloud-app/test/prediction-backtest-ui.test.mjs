import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { simulateCounterfactual } from "../../src/cognitive-world-model.mjs";
import { createPredictionReceipt, scorePredictionOutcome, summarizePredictionCalibration } from "../../src/prediction-calibration.mjs";
import { backtestPredictionCalibration } from "../../src/prediction-backtest.mjs";
import { projectPredictionBacktestSurface } from "../lib/prediction-backtest-surface.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const cards = readFileSync(join(root, "components/cockpit/PredictionBacktestCards.tsx"), "utf8");
const surface = readFileSync(join(root, "lib/prediction-backtest-surface.ts"), "utf8");
const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");

const prediction = simulateCounterfactual({
  observedState: { load: 10 },
  stateUncertainty: 0.1,
  action: { actionId: "hold-load", effects: { load: 0 }, uncertainty: 0.1 },
});
function calibrationCase(minute, load, segment) {
  const observedAt = `2026-09-28T00:${String(minute).padStart(2, "0")}:00.000Z`;
  const receipt = createPredictionReceipt(prediction, { now: () => new Date(`2026-09-28T00:00:${String(minute).padStart(2, "0")}.000Z`) });
  return { segment, outcome: scorePredictionOutcome(receipt, { load }, { observedAt: () => new Date(observedAt) }) };
}

function calibrationCases() {
  return [
    calibrationCase(1, 10, "api"),
    calibrationCase(2, 11, "queue"),
    calibrationCase(3, 10.5, "api"),
    calibrationCase(4, 12, "queue"),
    calibrationCase(5, 10.2, "api"),
    calibrationCase(6, 10.8, "queue"),
    calibrationCase(7, 10.4, "api"),
    calibrationCase(8, 11.2, "queue"),
  ];
}

describe("held-out prediction calibration backtest UI", () => {
  it("keeps product name Mahoraga and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
    assert.match(command, /Mahoraga workspace|Mahoraga cloud cockpit/);
    assert.doesNotMatch(command, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(cards, /<h2>7\.0\.0-alpha\.2/);
  });

  it("surfaces observational StatusCards plus CommandCockpit telemetry", () => {
    assert.match(cockpit, /import \{ PredictionBacktestCards \} from "\.\/PredictionBacktestCards"/);
    assert.match(cockpit, /<PredictionBacktestCards snapshot=\{health\?\.predictionBacktest\} \/>/);
    assert.ok(cockpit.indexOf("<ConnectorRoutingCards") > cockpit.indexOf('label="Predictive scenario route"'));
    assert.ok(cockpit.indexOf("<PredictionBacktestCards") > cockpit.indexOf("<ConnectorRoutingCards"));
    assert.doesNotMatch(cards, /<div className="eclipse-status-grid"/);
    assert.match(cards, /Held-out prediction calibration/);
    assert.match(cards, /Observational backtest/);
    assert.match(cards, /empirical evidence only/);
    assert.match(cards, /no generalizes \/ promotion \/ traffic-authority inference/);
    assert.match(cards, /Merge #877 is not live traffic authority/);
    assert.match(cards, /summarizePredictionCalibration reused/);
    assert.match(cards, /withheld sufficiency when either side is sparse/);
    assert.match(cards, /github.io presentation only/);
    assert.match(command, /HELD_OUT_BACKTEST_OBS/);
    assert.match(command, /NO_GENERALIZES_INFER/);
    assert.match(command, /empirical evidence only/);
    assert.match(command, /summarizePredictionCalibration/);
    assert.match(command, /github.io is presentation only/);
    assert.match(types, /predictionBacktest\?: unknown/);
  });

  it("does not infer generalizes, promotion, or traffic authority from the backtest", () => {
    assert.match(surface, /generalizes: false/);
    assert.match(surface, /promotion: false/);
    assert.match(surface, /trafficAuthority: false/);
    assert.match(surface, /prediction-backtest-authority-claim/);
    assert.match(cards, /no hidden generalizes threshold/);
    assert.doesNotMatch(cards, /grants traffic authority|promotes to live traffic/i);
    assert.doesNotMatch(command, /backtest grants traffic|promotes from held-out/i);
    assert.match(cards, /execution readiness, cognition readiness, and traffic authority remain separate fail-closed claims/);
    assert.match(command, /execution readiness, cognition readiness, and traffic authority stay separate fail-closed claims/i);
  });

  it("does not revive Railway or add Pages authenticated calls", () => {
    assert.doesNotMatch(cards, /Railway rollback|repair Railway|revive Railway|Railway promotion/i);
    assert.doesNotMatch(cards, /fetch\(|XMLHttpRequest|authorization/i);
    assert.match(command, /github.io is presentation only and must not call authenticated APIs/);
    assert.match(cockpit, /zero-route \/ zero-influence \/ zero-fallback \/ zero-authority/);
  });

  it("projects engine receipts without inventing a second calibration engine", () => {
    const cases = calibrationCases();
    const receipt = backtestPredictionCalibration(cases, { splitAt: 4, minimumSamples: 2 });
    const train = [...cases].sort((a, b) => a.outcome.observedAt.localeCompare(b.outcome.observedAt)).slice(0, 4);
    const heldOut = [...cases].sort((a, b) => a.outcome.observedAt.localeCompare(b.outcome.observedAt)).slice(4);
    const trainSummary = summarizePredictionCalibration(train.map(({ outcome }) => outcome), { minimumSamples: 2 });
    const heldOutSummary = summarizePredictionCalibration(heldOut.map(({ outcome }) => outcome), { minimumSamples: 2 });
    const projected = projectPredictionBacktestSurface(receipt);

    assert.equal(projected.status, "observed");
    assert.equal(projected.generalizes, false);
    assert.equal(projected.promotion, false);
    assert.equal(projected.trafficAuthority, false);
    assert.equal(projected.fingerprint, receipt.fingerprint);
    assert.equal(projected.trainPlannerTrust, trainSummary.plannerTrust);
    assert.equal(projected.heldOutPlannerTrust, heldOutSummary.plannerTrust);
    assert.equal(projected.trustDelta, receipt.trustDelta);
    assert.equal(projected.calibrationGapDelta, receipt.calibrationGapDelta);
    assert.equal(projected.normalizedErrorDelta, receipt.normalizedErrorDelta);
    assert.deepEqual(projected.sourceFingerprints, receipt.sourceFingerprints);
    assert.equal(projected.segments.every((segment) => segment.evidenceSufficient), true);
  });

  it("fails closed on duplicate outcomes and overlapping timestamps", () => {
    const duplicate = projectPredictionBacktestSurface({
      schemaVersion: 1,
      kind: "prediction-calibration-backtest",
      fingerprint: "a".repeat(64),
      splitAt: 2,
      trainRange: { from: "2026-09-28T00:01:00.000Z", to: "2026-09-28T00:02:00.000Z" },
      heldOutRange: { from: "2026-09-28T00:03:00.000Z", to: "2026-09-28T00:04:00.000Z" },
      trainSummary: { schemaVersion: 1, kind: "prediction-calibration-summary", fingerprint: "b".repeat(64), sampleCount: 2, plannerTrust: 0.5, meanCalibrationGap: 0.1, meanNormalizedError: 0.2, evidenceSufficient: true },
      heldOutSummary: { schemaVersion: 1, kind: "prediction-calibration-summary", fingerprint: "c".repeat(64), sampleCount: 2, plannerTrust: 0.4, meanCalibrationGap: 0.2, meanNormalizedError: 0.3, evidenceSufficient: true },
      trustDelta: -0.1,
      calibrationGapDelta: 0.1,
      normalizedErrorDelta: 0.1,
      evidenceSufficient: true,
      segments: [],
      sourceFingerprints: ["d".repeat(64), "d".repeat(64)],
    });
    assert.equal(duplicate.status, "hold");
    assert.equal(duplicate.reason, "prediction-backtest-duplicate-outcome");
    assert.equal(duplicate.trafficAuthority, false);

    const leak = projectPredictionBacktestSurface({
      schemaVersion: 1,
      kind: "prediction-calibration-backtest",
      fingerprint: "a".repeat(64),
      splitAt: 2,
      trainRange: { from: "2026-09-28T00:01:00.000Z", to: "2026-09-28T00:03:00.000Z" },
      heldOutRange: { from: "2026-09-28T00:03:00.000Z", to: "2026-09-28T00:04:00.000Z" },
      trainSummary: { schemaVersion: 1, kind: "prediction-calibration-summary", fingerprint: "b".repeat(64), sampleCount: 2, plannerTrust: 0.5, meanCalibrationGap: 0.1, meanNormalizedError: 0.2, evidenceSufficient: true },
      heldOutSummary: { schemaVersion: 1, kind: "prediction-calibration-summary", fingerprint: "c".repeat(64), sampleCount: 2, plannerTrust: 0.4, meanCalibrationGap: 0.2, meanNormalizedError: 0.3, evidenceSufficient: true },
      trustDelta: -0.1,
      calibrationGapDelta: 0.1,
      normalizedErrorDelta: 0.1,
      evidenceSufficient: true,
      segments: [],
      sourceFingerprints: ["d".repeat(64), "e".repeat(64)],
    });
    assert.equal(leak.status, "hold");
    assert.equal(leak.reason, "prediction-backtest-leakage");
  });

  it("withholds sparse segment sufficiency and rejects hidden generalizes claims", () => {
    const cases = calibrationCases();
    cases[7] = calibrationCase(8, 11.2, "rare");
    const receipt = backtestPredictionCalibration(cases, { splitAt: 4, minimumSamples: 2 });
    const projected = projectPredictionBacktestSurface(receipt);
    const rare = projected.segments.find((segment) => segment.segment === "rare");
    assert.equal(rare.withheld, true);
    assert.equal(rare.evidenceSufficient, false);
    assert.equal(projectPredictionBacktestSurface({ ...receipt, generalizes: true }).reason, "prediction-backtest-authority-claim");
    assert.equal(projectPredictionBacktestSurface(null).status, "absent");
  });
});
