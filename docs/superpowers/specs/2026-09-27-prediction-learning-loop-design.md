# Prediction → Calibration → Institutional Learning Loop Design

## Purpose

Close Mahoraga's existing predictive loop so prediction quality changes future planning behavior rather than ending as an isolated metric. Reuse the existing cognitive world model, prediction calibration module, Objective Planner, cognitive learning bridge, and institutional memory. Do not create a parallel planner, Experience Bank, calibration engine, or memory subsystem.

## Canonical flow

`world state → Objective Planner → counterfactual prediction → prediction receipt → action → observed state → prediction outcome receipt → calibration summary → verified institutional memory → planner calibration profile → next plan / replan receipt`

## Authority and safety constraints

- GitHub `main` remains source and merge authority.
- Cloudflare remains canonical runtime/control edge.
- Railway remains legacy evidence only: zero-route, zero-influence, zero-fallback, zero-authority.
- No new secrets, paid-provider dependency, metered fallback, external audience, or owner-authority bypass.
- Prediction-derived learning may influence ranking/confidence only; it may not grant new mutation authority.
- All new receipts must be deterministic, bounded, deep-frozen, and fingerprinted.
- Empirical learning must fail closed when evidence is malformed, mismatched, stale, or too sparse.

## Existing primitives to reuse

- `src/cognitive-world-model.mjs` produces `counterfactual-transition` receipts.
- `src/prediction-calibration.mjs` already creates `prediction-receipt` and `prediction-outcome-receipt` values and computes observed accuracy/calibration gap.
- `src/cognitive-loop.mjs` already produces counterfactual predictions and calls the Objective Planner.
- `src/objective-planner.mjs` already performs dependency/deadline handling, risk-adjusted alternative selection, deterministic plan receipts, and replan receipts.
- `src/cognitive-learning-bridge.mjs` already promotes verified cognition into institutional memory.
- `src/institutional-memory.mjs` already supports verified `outcome`, `failure`, `system-pattern`, and `negative-memory` records.

## Design

### 1. Bind prediction receipts into cognition

Extend `runCognitiveLoop()` to turn the existing counterfactual transition into a `prediction-receipt` using `createPredictionReceipt()`. Store the receipt in the cognitive-loop receipt alongside the raw prediction so later observed-state closure can bind to an exact prediction fingerprint.

The prediction receipt does not alter the existing admission rule. The current predicted-uncertainty threshold remains the decision gate unless a later task explicitly changes that policy.

### 2. Aggregate verified prediction outcomes

Add `summarizePredictionCalibration(outcomes, options)` to `src/prediction-calibration.mjs`.

The summary must:

- accept only valid `prediction-outcome-receipt` values;
- reject duplicate outcome fingerprints;
- sort deterministically;
- bound sample count;
- compute sample count, mean observed accuracy, mean predicted confidence, mean calibration gap, and mean normalized error;
- expose a bounded `plannerTrust` score in `[0,1]` derived from empirical accuracy and calibration quality;
- expose `evidenceSufficient` only when the configurable minimum sample count is met;
- include source fingerprints and a deterministic SHA-256 fingerprint;
- remain zero-credit and provider-independent.

The initial trust rule is deliberately simple and inspectable:

`plannerTrust = clamp(meanObservedAccuracy * (1 - meanCalibrationGap), 0, 1)`

No recency weighting is introduced in this tranche; timestamps remain available for future temporal calibration work.

### 3. Promote calibration outcomes to institutional memory

Add `promoteVerifiedPredictionLearning()` to `src/cognitive-learning-bridge.mjs`.

Inputs:

- one valid prediction outcome receipt;
- verification object with `verified`, `sourceFingerprint`, and evidence refs;
- optional objective IDs;
- observed timestamp.

Behavior:

- verification fingerprint must match the outcome receipt fingerprint;
- unverified evidence is held, not promoted;
- strong empirical outcomes (`observedAccuracy >= 0.8` and `calibrationGap <= 0.2`) create an `outcome` memory record;
- materially poor outcomes (`observedAccuracy < 0.5` or `calibrationGap > 0.35`) create a `negative-memory` record;
- intermediate outcomes create a `system-pattern` record;
- memory confidence equals empirical observed accuracy, not self-assessed confidence;
- evidence refs include the prediction receipt fingerprint, outcome receipt fingerprint, and verification evidence;
- capability is `prediction-calibration`;
- no content-bearing external payloads are introduced.

### 4. Feed empirical calibration back into the Objective Planner

Extend `planWorldStateActions(snapshot, options)` with optional `calibrationProfile`.

When no profile is supplied, current planner behavior is byte-for-byte equivalent in decision semantics.

A valid profile contains:

- `sampleCount`;
- `plannerTrust` in `[0,1]`;
- `meanCalibrationGap` in `[0,1]`;
- `evidenceSufficient` boolean;
- summary fingerprint.

If `evidenceSufficient` is false, the planner records the profile fingerprint in the plan receipt metadata but applies no penalty.

If evidence is sufficient, alternative ranking becomes:

`adjustedValue = expectedValue - risk - calibrationPenalty`

with:

`calibrationPenalty = risk * (1 - plannerTrust)`

This intentionally penalizes risky alternatives more when empirical predictive trust is weak. Deterministic tie-breaking remains by alternative ID.

The selected action evidence records:

- `selectedAlternativeId`;
- original `riskAdjustedValue`;
- empirical `calibrationPenalty`;
- final `experienceAdjustedValue`;
- calibration summary fingerprint when used.

The plan receipt fingerprint must include the calibration profile because learned evidence that changes ranking must change the plan identity.

### 5. Closed-loop behavioral acceptance

The primary integration test must prove behavior changes across cycles:

1. identical objective has a higher-value/higher-risk alternative and a safer alternative;
2. without sufficient calibration evidence, current risk-adjusted ranking applies;
3. verified overconfident poor predictions generate a low-trust calibration summary;
4. feeding that summary into the same planner input penalizes the risky alternative enough to select the safer alternative;
5. verified accurate/well-calibrated predictions retain the stronger alternative when empirical trust remains high;
6. the learning record is native institutional memory with `providerRequired=false` and `zeroCredit=true`.

## Files expected to change

- `src/cognitive-loop.mjs`
- `src/prediction-calibration.mjs`
- `src/cognitive-learning-bridge.mjs`
- `src/objective-planner.mjs`
- corresponding tests under `test/`
- corresponding `state/release-baseline/src/` mirrors after GREEN implementation

No new runtime subsystem file is required.

## Verification

Required before merge:

- focused RED tests prove the missing connective behaviors;
- focused GREEN tests pass;
- full `Verify Mahoraga` Ubuntu and Windows pass on the exact PR head;
- release-baseline drift check passes;
- Cloudflare exact-head preview/build passes;
- base remains current authoritative `main`;
- no Railway route/influence/fallback/authority appears;
- merge uses squash with expected-head protection.

## Success criteria

Mahoraga demonstrates a complete native empirical learning loop in which a prediction is bound to an observed outcome, calibration error becomes verified institutional knowledge, and that knowledge measurably changes a subsequent Objective Planner decision while preserving all existing authority, security, cost, and deployment boundaries.
