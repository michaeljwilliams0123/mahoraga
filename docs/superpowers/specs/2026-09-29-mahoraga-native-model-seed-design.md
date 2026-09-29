# Mahoraga Native Model Seed Design

**Date:** 2026-09-29  
**Issue:** #899  
**Status:** Approved for implementation  
**Scope:** First end-to-end sovereignty proof, not frontier capability

## Purpose

Create the first executable `model-foundry/` tranche that proves Mahoraga can initialize, train, evaluate, checkpoint, promote, serve, and roll back its own neural weights without an external model provider.

The deliverable is intentionally research-scale. Success means a deterministic and auditable native-learning lifecycle with measurable held-out improvement. It does not claim broad language competence, AGI, consciousness, production readiness, or frontier performance.

## Outcomes

The tranche must prove all of the following:

1. A model begins from deterministic random initialization.
2. Gradient-based training changes Mahoraga-owned weights.
3. Training loss falls on a controlled dataset.
4. Held-out loss improves on examples excluded from training.
5. Dataset provenance and usage rights are explicit and validated.
6. Training configuration, code SHA, seed, tokenizer, architecture, data manifests, and parent lineage are bound into immutable manifests.
7. Checkpoint serialization is canonical and tamper-evident.
8. A candidate checkpoint cannot replace the incumbent in place.
9. Promotion requires a valid evaluation receipt and measurable improvement.
10. Rollback preserves and restores the prior incumbent.
11. Native inference uses only the promoted checkpoint and remains available with no provider configuration or network route.
12. All contracts fail closed on unknown fields, malformed values, lineage mismatch, data overlap, tampering, or missing authority evidence.

## Non-goals

- Training a useful general-purpose language model.
- Adding Python, native code, GPU dependencies, paid services, or model-provider calls.
- Activating 7.0.0-alpha.2 on Windows.
- Changing Cloudflare, Railway, Vercel, provider credentials, traffic authority, or deployment configuration.
- Wiring this research seed into the existing production answer router.
- Mutating production weights during training.
- Allowing a candidate model or its output to approve its own promotion.
- Treating benchmark improvement as proof of sentience, AGI, or production readiness.

## Approach

Use dependency-free TypeScript under a new `model-foundry/` root. A tiny next-token neural model represents each current token with a learned row of logits for the next token. The model is a single linear softmax layer trained with deterministic stochastic gradient descent and cross-entropy loss.

Although deliberately small, this is a real parameterized neural objective:

```text
P(next_token | current_token) = softmax(W[current_token])
L = -mean(log P(target | input))
W := W - learning_rate * gradient(L)
```

A seeded PRNG initializes `W`. Training examples and held-out examples are separately fingerprinted. The implementation never reads environment credentials, calls `fetch`, or imports existing provider routes.

## Component boundaries

### `model-foundry/src/canonical.ts`

Provides canonical JSON serialization, SHA-256 fingerprints, exact-object validation helpers, deep freezing, timestamp validation, bounded identifiers, and finite-number validation. Canonicalization rejects unsupported values rather than silently dropping them.

### `model-foundry/src/contracts.ts`

Defines and validates exact version-1 contracts:

- `ModelConstitution`
- `DatasetManifest`
- `TrainingRunManifest`
- `CheckpointArtifact`
- `CheckpointManifest`
- `EvaluationReceipt`
- `PromotionDecision`
- `ModelRegistry`

Every record has a deterministic fingerprint. Checkpoint manifests bind the artifact digest, architecture, tokenizer, training run, dataset, parent checkpoint, code SHA, parameter count, and evaluation status. Dataset manifests bind rights, source class, split fingerprints, and disjointness evidence.

Allowed data rights are `public-domain`, `permissive-license`, `user-owned-explicit`, and `synthetic-owned`. Missing or unsupported rights fail closed.

### `model-foundry/src/seed-model.ts`

Implements:

- deterministic seeded initialization;
- stable softmax and cross-entropy;
- deterministic gradient descent;
- training and evaluation loss;
- canonical checkpoint serialization/deserialization;
- next-token inference from a validated checkpoint.

The vocabulary is supplied explicitly as bounded unique tokens. Training examples are integer token pairs. Input arrays are copied and frozen; caller-owned values are not mutated.

### `model-foundry/src/lifecycle.ts`

Orchestrates the pure lifecycle:

```text
constitution + dataset + configuration
→ random candidate
→ train
→ candidate checkpoint
→ held-out evaluation
→ promotion decision
→ immutable registry update
→ native inference
→ rollback
```

The lifecycle accepts the current Git source SHA as input; it does not discover or infer source truth. Promotion requires:

- candidate and incumbent checkpoint validation;
- matching constitution, architecture, tokenizer, dataset, and training lineage;
- held-out evaluation bound to the candidate artifact;
- finite loss values;
- candidate held-out loss strictly lower than incumbent held-out loss;
- rollback target equal to the current incumbent;
- explicit incumbent-controlled promotion authority.

A rejected candidate remains recorded as evaluated evidence but is not made incumbent.

### `model-foundry/src/native-route.ts`

Exposes a small provider-independent inference boundary. It accepts a validated registry, checkpoint artifact, and token input. It returns a frozen native inference receipt with checkpoint ID, input/output tokens, artifact digest, and receipt fingerprint.

It has no provider ID, URL, credential, lease, spending, network, deployment, or traffic-authority fields. Unknown or authority-bearing input fields are rejected by exact contract validation.

## Data design

The tests use a fixed synthetic token corpus owned by the repository. Training and evaluation examples are declared separately. Their canonical example fingerprints must be disjoint.

The seed model uses integer token IDs, while manifests bind the ordered vocabulary through a tokenizer fingerprint. Reordering the vocabulary changes the tokenizer fingerprint and invalidates checkpoint lineage.

No email content, private user data, external-model output, or repository runtime state is training data in this tranche.

## Checkpoint and registry behavior

A checkpoint consists of:

- an artifact containing architecture version, vocabulary, matrix dimensions, and finite weights;
- a manifest containing immutable provenance and the artifact digest.

The artifact digest is recalculated on load. Any changed weight, dimension, vocabulary item, or metadata field causes validation failure.

The registry contains an incumbent checkpoint ID, zero or more candidate records, and a rollback checkpoint ID. Registry updates return new deeply frozen values and never mutate the prior registry.

Promotion creates a new registry with:

- the candidate as incumbent;
- the former incumbent as rollback target;
- a promotion decision fingerprint;
- both checkpoint manifests retained.

Rollback creates another registry state that restores the recorded rollback checkpoint and retains the displaced incumbent as lineage evidence.

## Error model

Contract failures throw `TypeError` with stable codes beginning `model-foundry-`. Expected examples include:

- `model-foundry-contract-invalid`
- `model-foundry-dataset-rights-invalid`
- `model-foundry-dataset-overlap`
- `model-foundry-lineage-invalid`
- `model-foundry-checkpoint-tampered`
- `model-foundry-training-invalid`
- `model-foundry-evaluation-invalid`
- `model-foundry-promotion-denied`
- `model-foundry-rollback-invalid`
- `model-foundry-native-route-invalid`

Failures do not fall back to an external provider or synthesize success.

## Verification strategy

TDD is required. Tests are written and observed failing before production files are added.

Focused tests must prove:

- identical seeds and inputs produce identical initial weights and checkpoints;
- different seeds produce different initial weights;
- training changes weights and lowers training loss;
- held-out loss improves without using held-out examples for updates;
- train/evaluation overlap is rejected;
- unsupported or missing data rights are rejected;
- checkpoint save/load is byte-stable;
- a changed weight or digest is rejected;
- unknown fields and non-finite numeric values are rejected;
- promotion rejects equal/worse held-out loss, wrong lineage, wrong rollback target, or absent incumbent authority;
- successful promotion preserves the old incumbent as rollback;
- rollback restores the previous incumbent;
- native inference works with an empty environment and a `fetch` trap that must never be called;
- native inference receipts contain no external authority or provider fields;
- all returned contracts are deeply frozen.

Verification commands:

```text
node --test --test-isolation=none test/model-foundry-contracts.test.ts test/model-foundry-seed.test.ts test/model-foundry-lifecycle.test.ts
npm run typecheck
npm test
npm run verify
git diff --check
```

GitHub exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)` must pass before merge.

## Files

Create:

- `model-foundry/README.md`
- `model-foundry/src/canonical.ts`
- `model-foundry/src/contracts.ts`
- `model-foundry/src/seed-model.ts`
- `model-foundry/src/lifecycle.ts`
- `model-foundry/src/native-route.ts`
- `test/model-foundry-contracts.test.ts`
- `test/model-foundry-seed.test.ts`
- `test/model-foundry-lifecycle.test.ts`

Modify:

- `tsconfig.json` to include `model-foundry/**/*.ts`.

No existing provider, router, deployment, Windows, UI, or release-baseline file changes are in scope.

## Acceptance criterion

The PR is accepted when exact-head verification demonstrates that Mahoraga can train a deterministic random-initialized next-token model on an explicitly rights-cleared synthetic dataset, improve on disjoint held-out data, serialize and validate a tamper-evident checkpoint, promote it only through incumbent-controlled evaluation, serve inference without an external provider, and roll back to the previous incumbent.

The issue remains open after merge as the umbrella program for larger models, richer architectures, multimodality, continual learning, and frontier qualification.
