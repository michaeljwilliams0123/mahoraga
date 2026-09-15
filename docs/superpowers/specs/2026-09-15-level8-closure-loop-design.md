# Level 8 Closure Loop Design

## Goal

Close the remaining Level 8 Waves 9-10 gap without creating a parallel control plane. Add an Evolution Laboratory decision layer in front of the existing evolution controller and add a bounded Entity Heartbeat receipt that composes the already-authoritative unattended runtime outputs.

## Constraints

- GitHub `main` remains authoritative; implementation begins from exact fetched head `c40ce6c283014b79f0b87a393c62e8d72b3be8ac`.
- Do not cherry-pick the stale Wave 9-10 branch.
- Do not weaken exact-head verification, repository policy, rollout, canary, activation, rollback, or owner authority.
- Core operation must remain zero-credit: `creditCost: 0`, `paidFallback: false`, `providerRequired: false`.
- No paid provider, new service, public tunnel, or production activation is part of this change.
- Receipts must be bounded, deterministic, content-minimized, and tamper-evident.

## Existing Owners

The existing `evolution-controller.mjs` remains the only owner of candidate build, verify, deploy, canary, activate, and rollback transitions. `growth-compounding-loop.mjs` remains the owner of turning capability gaps into reconciled objectives, institutional memory, organization plans, and promoted skills. `research-assimilation-loop.mjs` remains the owner of research evidence assimilation. `unattended-credit-free-cycle.mjs` remains the persistent zero-credit cycle that composes those owners.
## Evolution Laboratory v2

`src/evolution-laboratory.mjs` is a pure decision/benchmark module upstream of the existing evolution controller. It does not mutate repositories, dispatch providers, deploy artifacts, or activate candidates.

It exposes three functions:

- `createEvolutionExperiment(input, { observedAt })` creates an immutable isolated experiment record with baseline/candidate metrics, hypothesis, verification mechanism, zero-credit boundaries, and a canonical SHA-256 fingerprint.
- `validateEvolutionExperiment(value)` reconstructs the exact canonical record and rejects schema drift, boundary changes, invalid metrics, noncanonical timestamps, or fingerprint tampering.
- `evaluateEvolutionExperiment(experiment, { verificationSatisfied })` returns `reject`, `hold`, or `graduation-ready`. A nonpositive metric delta records a negative result. A positive delta is only `graduation-ready` when the declared verification has been satisfied.

`graduation-ready` means eligible to be submitted to the existing evolution controller; it never means production activation. The evaluation receipt exposes `controllerEligible`, never direct deployment authority.

## Entity Heartbeat v2

`src/entity-heartbeat.mjs` creates and validates a bounded entity-state receipt from the authoritative outputs already produced by the unattended cycle. It does not add another scheduler or execute a second copy of growth, research, or deployment logic.

The receipt projects the Level 8 Wave 10 sequence into evidence fields: world observation, responsibility/obligation state, material delta, reconciled objective state, actual bounded dispatch evidence, research state, capability-gap state, learned-outcome state, institutional-memory state, and Evolution Laboratory decisions. Raw prompts, responses, research content, and memory statements are not embedded in the receipt.
The heartbeat receipt contains only canonical timestamps, counts, status identifiers, fingerprints/digests, and zero-credit policy fields. It carries `worldDigest` and `previousWorldDigest`; `materialDelta` is true when the current world digest differs from the previous receipt. Missing previous state is treated as an initial observation, not a failure.

The receipt is immutable and fingerprinted from its canonical core. Validation rejects extra keys and fingerprint changes. Collection inputs are bounded before counting or hashing so the heartbeat cannot become an unbounded persistence surface.

## Unattended Cycle Integration

`unattended-credit-free-cycle.mjs` will build exactly one Entity Heartbeat receipt after its existing heartbeat, research assimilation, growth compounding, and foundry admission have completed. The new receipt observes those results; it does not re-run them.

The cycle will expose `entityHeartbeat` at the root and in `asHeartbeatCliReceipt(...).unattended.entityHeartbeat`. Existing fields and semantics remain unchanged. A prior entity receipt may be supplied only to establish `previousWorldDigest` and material-delta evidence.

Evolution experiments are optional cycle inputs. If present, the cycle evaluates them through the pure laboratory module and includes only bounded evaluation evidence in the Entity Heartbeat receipt. No experiment can trigger the evolution controller from this change.

## Repair Baseline

Both new production modules must be mirrored under `state/release-baseline/src/` and added to the immutable repair inventory so self-healing cannot silently remove the closure loop. Baseline verification remains equality-based; no hash exceptions or bypasses are permitted.

## Testing and Acceptance

TDD is required. The laboratory tests must first fail because the module is absent, then prove canonical fingerprint round-trip, tamper rejection, negative-result recording, hold-before-verification, and `graduation-ready` only after verification. Entity Heartbeat tests must first fail because the module is absent, then prove bounded content-minimized receipts, material-delta behavior, zero-credit enforcement, and fingerprint tamper rejection.
Integration tests must prove the unattended cycle emits exactly one Entity Heartbeat receipt whose objective/memory/research/dispatch counts correspond to the already-produced cycle outputs and whose zero-credit boundary remains intact.

Focused tests run before the full repository gate. Final acceptance requires the canonical focused suite, release-baseline verification, `git diff --check`, and full `npm run verify` with zero failures before any PR or merge claim.

## Non-Goals

This change does not activate Windows production, alter Railway deployment logic, add provider spend, restore old quota UI, resurrect Destiny-specific control paths, or replace the existing evolution controller. It does not infer or persist new owner facts. It does not automatically submit `graduation-ready` experiments for deployment.

## Success Condition

Mahoraga's existing unattended cycle produces a deterministic Level 8 entity-state receipt that proves the world-to-objective-to-dispatch-to-research/gap-to-learning/memory closure, while isolated experiments can be benchmarked and marked ready for the existing verified evolution pipeline without bypassing any release boundary.