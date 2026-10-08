# Native action-conditioned world-model experiment (issue #1032)

This is a bounded, **offline native parameter-learning** experiment. It does not replace the canonical supplied-effect simulator (`src/cognitive-world-model.mjs`), serve an owner request, deploy a model, create autonomous intent, or assert consciousness/sentience.

## What is trained

`src/native-world-model.ts` learns action-conditioned *linear residual* parameters (bias plus per-state coefficients) using actual SGD updates from owner-authorized numeric state/action/next-state examples:

`predicted_next_state = observed_state + learned_action_bias + learned_action_matrix × observed_state`

The model is a candidate with a reproducible seed, exact configuration, bounded compute/data, source-code SHA, explicit training/evaluation/data-rights manifest digests and integrity-checked checkpoint. Features and actions are fixed at training time; unknown features/actions fail closed. It is intentionally a tiny and interpretable baseline, **not** a general neural world model or a proven autonomous reasoning system.

## Run

With the repository's Node.js 24+ environment:

```bash
node --test --test-isolation=none test/native-world-model.test.ts
npm run typecheck
npm run verify
```

The tests construct an owner-authorized synthetic task with two actions, sample unseen state values only in the held-out evaluation set, compare initial and trained mean-squared prediction error, replay a seeded run and serialized checkpoint, and reject malformed episodes, overlap, untrained actions, tampering and production authority claims.

## What the result can prove

- The **model weights change by gradient descent** and held-out state transition prediction can improve on this simple synthetic task.
- The fixed seed/config/dataset reproduce the candidate checkpoint and prediction.
- Model predictions remain `native-world-offline-prediction` with `executionAuthorityGranted:false`.
- Reproducible *offline* synthetic evaluation does **not** establish independent evaluator qualification, safe action execution, actual environment learning, broad generalization, or evidence of consciousness.

## Follow-up acceptance gates

1. Collect **independently observed, consented and rights-proven** state/action/outcome transitions, without synthetic evidence leaking into a live success metric.
2. Freeze multiple unseen task families and an external state-diff verifier. Measure normalized MSE, action coverage, calibration and novel transition generalization; compare against a no-learning and caller-supplied-effects baseline.
3. Require source/checkpoint/dataset digests, fairness/leakage checks, retention benchmarks, negative evidence, opt-out/deletion and immutable model lineage.
4. Permit promotion only through incumbent external governance, separate rollback and shadow/canary verification. No weights or grant can self-authorize.
5. Keep `cloud-app/`, exact-main Cloudflare acceptance, hard-zero provider admission, protected GitHub checks, Windows rollback and GitHub/Cloudflare authority boundaries unchanged.

References: [Native intelligence program #899](https://github.com/michaeljwilliams0123/mahoraga/issues/899) and [experiment #1032](https://github.com/michaeljwilliams0123/mahoraga/issues/1032).
