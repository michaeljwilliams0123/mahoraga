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
node --test --test-isolation=none test/native-world-experiment.test.ts
node scripts/native-world-experiment.ts
npm run typecheck
npm run verify
```

The tests construct an owner-authorized synthetic task with two actions, sample unseen state values only in the held-out evaluation set, compare initial and trained mean-squared prediction error, replay a seeded run and serialized checkpoint, and reject malformed episodes, overlap, untrained actions, tampering and production authority claims.

## Third-split assessment (issue #899 follow-up)

`assessNativeWorldHoldout` evaluates a fixed checkpoint on a third dataset. Callers supply the original training and development-evaluation episodes; their normalized digests must match the checkpoint manifest. The holdout must cover every trained action, carry rights evidence, and share neither episode IDs nor action/state pairs with either reference split. Changing an outcome label cannot disguise a repeated intervention. Repeated interventions within the holdout are rejected too. Training now applies the same action/state separation to its development split.

The assessment returns overall and per-action prediction MSE, a persistence baseline (predict that the state stays unchanged), dataset/rights digests and the exact checkpoint fingerprint. It does not train, select or promote weights. These checks establish dataset separation within the supplied evidence; they cannot establish that a developer has never seen the holdout.

`scripts/native-world-experiment.ts` reuses the existing architecture with **12 parameters**, two state features and two actions. Each of seeds `7`, `42` and `1337` trains for 150 epochs at learning rate `0.03` on 50 transitions, uses 32 development transitions and assesses 50 distinct holdout interventions. Both synthetic tasks use fixed, hand-authored coordinate grids; the affine task couples both state features in each action. The nonlinear stress replaces those residuals with signed quadratic effects, which the current linear architecture cannot express exactly.

The fixed assessment policy requires MSE at most `0.001`, both overall and for each action, and each action's MSE below 10% of persistence MSE. Results observed with this implementation:

| Task | Third-split MSE, all three seeds | Persistence MSE | Assessment |
| --- | --- | --- | --- |
| Coupled affine transitions | approximately `4e-32` | `0.05266075` | qualified offline experiment |
| Quadratic stress | `0.05209746` | `0.12217050` | **HOLD** |

Near-zero affine error reflects an exactly representable noiseless generating rule, not broad generalization. The stress improves on persistence but still fails both fixed criteria. Its HOLD remains in the report. The command exits successfully when the affine experiment and checkpoint immutability/reload checks pass; this does not mean every reported task passed. The runner never retries seeds or changes thresholds based on results.

Run the CLI from a clean committed checkout: it stamps `HEAD` as the source SHA and rejects tracked source changes or an untracked implementation. The report includes all three split digests and per-action errors; reports/checkpoints are not automatically written into the repository. Function-level tests exercise the same experiment without needing a committed fixture SHA.

This remains **developer-authored, same-process synthetic research**, with development-selected tasks/configuration. A third split is not an independent hidden evaluator. There is no live-experience ingestion, rollout evaluation, uncertainty calibration, new architecture, native serving route, production activation or authority grant. Independent hidden-task collection and evaluation remain required follow-ups.

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
