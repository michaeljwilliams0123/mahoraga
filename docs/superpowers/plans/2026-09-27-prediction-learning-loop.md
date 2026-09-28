# Prediction Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Mahoraga's native prediction→outcome→calibration→institutional-learning→planner-feedback loop so empirical prediction quality changes later planning decisions.

**Architecture:** Reuse existing prediction, cognitive-loop, institutional-memory, learning-bridge, and Objective Planner modules. Add only connective receipts and bounded calibration inputs; preserve current authority and zero-credit boundaries.

**Tech Stack:** Node.js ESM, `node:test`, SHA-256 receipts, existing GitHub Actions verification.

**Spec:** `docs/superpowers/specs/2026-09-27-prediction-learning-loop-design.md`

## Global Constraints

- GitHub `main` remains source and merge authority.
- Cloudflare remains canonical runtime/control edge.
- Railway remains legacy evidence only: zero-route, zero-influence, zero-fallback, zero-authority.
- No new secrets, paid-provider dependency, metered fallback, external audience, or owner-authority bypass.
- Reuse existing primitives; do not create a parallel planner, Experience Bank, calibration engine, or memory subsystem.
- New receipts are deterministic, bounded, frozen, fingerprinted, and fail closed.
- Production code follows RED→GREEN TDD.

## Review Focus

- Duplicate outcome receipts must fail closed rather than overweight repeated evidence.
- Insufficient samples must not alter planner ranking.
- Malformed calibration profiles must fail closed rather than silently downgrade trust.
- Prediction-learning verification fingerprints must match the exact outcome receipt.
- Calibration feedback must never grant mutation authority or provider access.

---

### Task 1: Bind prediction receipts into cognitive cycles

**Files:**
- Modify: `test/cognitive-loop.test.mjs`
- Modify: `src/cognitive-loop.mjs`
- Modify after GREEN: `state/release-baseline/src/cognitive-loop.mjs`

**Interfaces:**
- Consumes: `createPredictionReceipt(counterfactual, { now })` from `src/prediction-calibration.mjs`.
- Produces: `cognitive-loop-receipt.predictionReceipt` bound to the cycle's existing `prediction`.

- [ ] Write a failing test asserting `predictionReceipt.kind === 'prediction-receipt'`, its `predictionFingerprint === prediction.fingerprint`, and the receipt fingerprint is included in cycle identity.
- [ ] Run focused CI and verify RED because `predictionReceipt` is absent.
- [ ] Import `createPredictionReceipt` and create the receipt from the existing counterfactual prediction without changing admission policy.
- [ ] Mirror source into release baseline after GREEN.
- [ ] Run focused and full verification; require PASS.

### Task 2: Add deterministic calibration summaries

**Files:**
- Modify: `test/prediction-calibration.test.mjs`
- Modify: `src/prediction-calibration.mjs`
- Modify after GREEN: `state/release-baseline/src/prediction-calibration.mjs`

**Interfaces:**
- Produces: `summarizePredictionCalibration(outcomes, { minimumSamples = 3, maximumSamples = 256 })` returning a frozen `prediction-calibration-summary` with `sampleCount`, `meanObservedAccuracy`, `meanPredictedConfidence`, `meanCalibrationGap`, `meanNormalizedError`, `plannerTrust`, `evidenceSufficient`, `sourceFingerprints`, and `fingerprint`.

- [ ] Write failing tests for deterministic summary math, duplicate rejection, bounded sample validation, and insufficient-evidence behavior.
- [ ] Run focused CI and verify RED because `summarizePredictionCalibration` is absent.
- [ ] Implement validation, deterministic ordering, means, and `plannerTrust = clamp(meanObservedAccuracy * (1 - meanCalibrationGap), 0, 1)`.
- [ ] Mirror source into release baseline after GREEN.
- [ ] Run focused and full verification; require PASS.

### Task 3: Promote verified prediction learning into institutional memory

**Files:**
- Modify: `test/cognitive-learning-bridge.test.mjs`
- Modify: `src/cognitive-learning-bridge.mjs`
- Modify after GREEN: `state/release-baseline/src/cognitive-learning-bridge.mjs`

**Interfaces:**
- Consumes: one valid `prediction-outcome-receipt` and verification evidence.
- Produces: `promoteVerifiedPredictionLearning({ outcome, verification, objectiveIds, observedAt })` returning held or promotable institutional-memory result.

- [ ] Write failing tests for strong outcome→`outcome`, poor/miscalibrated→`negative-memory`, intermediate→`system-pattern`, verification mismatch rejection, and unverified hold.
- [ ] Run focused CI and verify RED because the function is absent.
- [ ] Implement promotion using existing `createInstitutionalMemoryRecord`; set memory confidence to empirical `observedAccuracy`, capability `prediction-calibration`, and include prediction/outcome/verification fingerprints in evidence refs.
- [ ] Mirror source into release baseline after GREEN.
- [ ] Run focused and full verification; require PASS.

### Task 4: Feed empirical trust back into Objective Planner and prove closed-loop behavior

**Files:**
- Modify: `test/objective-planner.test.mjs`
- Modify: `test/prediction-calibration.test.mjs` or add focused integration assertions to existing tests
- Modify: `src/objective-planner.mjs`
- Modify after GREEN: `state/release-baseline/src/objective-planner.mjs`

**Interfaces:**
- Consumes: optional `calibrationProfile` matching Task 2 summary fields.
- Produces: experience-adjusted alternative ranking and evidence fields `calibrationPenalty`, `experienceAdjustedValue`, and calibration summary fingerprint when evidence is sufficient.

- [ ] Write failing tests proving insufficient evidence leaves current ranking unchanged, malformed profiles fail closed, low-trust evidence can switch the choice to a safer alternative, and high-trust evidence preserves the stronger alternative.
- [ ] Write a closed-loop test constructing prediction outcomes→summary→planner input and asserting empirical miscalibration changes the next otherwise-identical planning decision.
- [ ] Run focused CI and verify RED.
- [ ] Extend planner options with `calibrationProfile`; validate strictly; apply `calibrationPenalty = risk * (1 - plannerTrust)` only with sufficient evidence; include profile in plan identity.
- [ ] Mirror source into release baseline after GREEN.
- [ ] Run focused and full verification; require PASS on Ubuntu and Windows.

### Task 5: Exact-head integration and canonical deployment evidence

**Files:**
- No new production subsystem files.
- Update PR evidence/coordination records only.

**Interfaces:**
- Consumes: exact PR head after Tasks 1–4.
- Produces: merge-ready evidence chain.

- [ ] Confirm branch base still equals authoritative `main`; update without force if necessary.
- [ ] Require exact-head `Verify Mahoraga` Ubuntu PASS and Windows PASS.
- [ ] Require release-baseline drift checks PASS.
- [ ] Require Cloudflare exact-head preview/build PASS.
- [ ] Record capability-map change in #786 and mark stale prediction-calibration isolation findings superseded.
- [ ] Squash-merge with expected-head protection only after all gates are green.
- [ ] Verify merged SHA becomes `main`, Cloudflare builds exact merged SHA, and Railway remains zero-route/zero-influence/zero-fallback/zero-authority.
