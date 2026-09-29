# Mahoraga Native Model Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Mahoraga can train, evaluate, checkpoint, promote, serve, and roll back a deterministic provider-independent seed neural model with auditable provenance.

**Architecture:** Add a dependency-free TypeScript `model-foundry/` subsystem. Exact, fingerprinted contracts govern datasets, runs, artifacts, evaluations, promotions, and registry state; a tiny seeded next-token softmax model supplies real gradient-trained weights; a pure lifecycle and native route enforce incumbent-controlled promotion and provider-independent inference.

**Tech Stack:** Node.js 24, TypeScript 7.0.2, `node:test`, `node:assert/strict`, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-09-29-mahoraga-native-model-seed-design.md`

## Global Constraints

- TypeScript only for all new runtime and test files.
- No runtime dependencies, Python, native code, provider calls, credentials, network access, UI changes, deployment changes, or Windows activation.
- Exact-object validation and SHA-256 fingerprints are mandatory for persisted contracts.
- Training and held-out examples must be disjoint by canonical example fingerprint.
- Candidate weights never mutate the incumbent artifact or registry in place.
- Promotion requires explicit incumbent authority, valid lineage, and strictly lower held-out loss.
- The prior incumbent becomes the rollback target after promotion.
- Exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)` must pass before merge.

## Review Focus

- Non-finite, sparse, or dimensionally inconsistent weight arrays must fail before hashing or inference.
- Canonically equivalent objects with different key insertion order must produce identical fingerprints.
- Duplicate or overlapping examples across train/evaluation splits must fail closed.
- Promotion with a valid-looking but wrong-lineage evaluation receipt must fail closed.
- Native inference must remain functional when environment variables are empty and any attempted `fetch` throws.

---

### Task 1: Canonical primitives and governance contracts

**Files:**
- Create: `test/model-foundry-contracts.test.ts`
- Create: `model-foundry/src/canonical.ts`
- Create: `model-foundry/src/contracts.ts`

**Interfaces:**
- Produces `canonicalJson(value: unknown): string`, `sha256(value: string): string`, `fingerprint(value: unknown): string`, and `deepFreeze<T>(value: T): T`.
- Produces exported types `ModelConstitution`, `DatasetManifest`, `TrainingRunManifest`, `CheckpointArtifact`, `CheckpointManifest`, `EvaluationReceipt`, `PromotionDecision`, and `ModelRegistry`.
- Produces `createModelConstitution`, `createDatasetManifest`, `createTrainingRunManifest`, `createCheckpointManifest`, and one `validate*` function for every exported contract.
- Later tasks consume validated, deeply frozen values and their `fingerprint` fields.

- [ ] **Step 1: Write failing contract tests**

Add tests named:

- `canonical fingerprints ignore object key insertion order`
- `constitution accepts only exact sovereign policy fields`
- `dataset manifest requires explicit allowed rights and disjoint split fingerprints`
- `training run binds source sha seed configuration parent and dataset`
- `checkpoint artifact rejects non-finite and dimensionally invalid weights`
- `checkpoint manifest binds artifact and complete lineage`
- `all validated contracts reject unknown fields and are deeply frozen`

Use exact expected error codes from the design.

- [ ] **Step 2: Run the contract test and observe RED**

Run:

```bash
node --test --test-isolation=none test/model-foundry-contracts.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `model-foundry/src/contracts.ts`.

- [ ] **Step 3: Commit the RED test**

```bash
git add test/model-foundry-contracts.test.ts
git commit -m "test(model-foundry): define sovereign contract behavior"
```

- [ ] **Step 4: Implement canonical helpers and exact contracts**

Implement:

```ts
canonicalJson(value: unknown): string
sha256(value: string): string
fingerprint(value: unknown): string
deepFreeze<T>(value: T): T
createModelConstitution(input, options): ModelConstitution
validateModelConstitution(value: unknown): ModelConstitution
createDatasetManifest(input, options): DatasetManifest
validateDatasetManifest(value: unknown): DatasetManifest
createTrainingRunManifest(input, options): TrainingRunManifest
validateTrainingRunManifest(value: unknown): TrainingRunManifest
validateCheckpointArtifact(value: unknown): CheckpointArtifact
createCheckpointManifest(input, options): CheckpointManifest
validateCheckpointManifest(value: unknown): CheckpointManifest
validateEvaluationReceipt(value: unknown): EvaluationReceipt
validatePromotionDecision(value: unknown): PromotionDecision
validateModelRegistry(value: unknown): ModelRegistry
```

All `create*` functions calculate fingerprints from every field except `fingerprint`. All `validate*` functions recompute and compare them.

- [ ] **Step 5: Run contract tests and typecheck**

```bash
node --test --test-isolation=none test/model-foundry-contracts.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit GREEN**

```bash
git add model-foundry/src/canonical.ts model-foundry/src/contracts.ts
git commit -m "feat(model-foundry): add sovereign model contracts"
```

### Task 2: Deterministic seed neural model and checkpoints

**Files:**
- Create: `test/model-foundry-seed.test.ts`
- Create: `model-foundry/src/seed-model.ts`

**Interfaces:**
- Consumes `CheckpointArtifact`, `validateCheckpointArtifact`, and canonical fingerprint helpers from Task 1.
- Produces `TrainingExample = readonly [number, number]`.
- Produces `initializeSeedModel`, `calculateLoss`, `trainSeedModel`, `serializeCheckpoint`, `deserializeCheckpoint`, and `predictNextToken`.

- [ ] **Step 1: Write failing seed-model tests**

Add tests named:

- `same seed and vocabulary reproduce identical random weights`
- `different seeds produce different random weights`
- `training changes a candidate without mutating its parent`
- `gradient training lowers controlled training loss`
- `held-out loss improves without held-out examples in the update set`
- `checkpoint serialization round trips byte for byte`
- `checkpoint deserialization rejects changed weights and digest`
- `prediction returns the highest probability vocabulary token deterministically`

Use the fixed vocabulary `["<bos>", "red", "blue", "<eos>"]`, a fixed seed, explicit train pairs, and disjoint held-out pairs.

- [ ] **Step 2: Run the seed test and observe RED**

```bash
node --test --test-isolation=none test/model-foundry-seed.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `model-foundry/src/seed-model.ts`.

- [ ] **Step 3: Commit the RED test**

```bash
git add test/model-foundry-seed.test.ts
git commit -m "test(model-foundry): define seed learning behavior"
```

- [ ] **Step 4: Implement the seed model**

Implement:

```ts
initializeSeedModel(input: {
  modelId: string;
  architectureVersion: "mahoraga-seed-softmax-v1";
  tokenizerFingerprint: string;
  vocabulary: readonly string[];
  seed: number;
}): CheckpointArtifact

calculateLoss(artifact: CheckpointArtifact, examples: readonly TrainingExample[]): number

trainSeedModel(
  artifact: CheckpointArtifact,
  examples: readonly TrainingExample[],
  configuration: { epochs: number; learningRate: number }
): CheckpointArtifact

serializeCheckpoint(artifact: CheckpointArtifact): string
deserializeCheckpoint(serialized: string): CheckpointArtifact
predictNextToken(artifact: CheckpointArtifact, inputToken: string): {
  token: string;
  tokenId: number;
  probability: number;
}
```

Use a deterministic 32-bit PRNG, stable softmax, fixed iteration order, and finite rounding after updates. Never use `Math.random`.

- [ ] **Step 5: Run seed and contract tests**

```bash
node --test --test-isolation=none test/model-foundry-contracts.test.ts test/model-foundry-seed.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit GREEN**

```bash
git add model-foundry/src/seed-model.ts
git commit -m "feat(model-foundry): train deterministic seed weights"
```

### Task 3: Evaluation, promotion, rollback, and native inference

**Files:**
- Create: `test/model-foundry-lifecycle.test.ts`
- Create: `model-foundry/src/lifecycle.ts`
- Create: `model-foundry/src/native-route.ts`

**Interfaces:**
- Consumes all Task 1 contracts and Task 2 model functions.
- Produces `evaluateCandidate`, `createModelRegistry`, `promoteCandidate`, `rollbackModelRegistry`, `runSeedLifecycle`, and `executeNativeSeedInference`.
- `runSeedLifecycle` returns constitution, dataset manifest, training run, incumbent/candidate artifacts and manifests, evaluation, promotion decision, promoted registry, and loss summary.

- [ ] **Step 1: Write failing lifecycle tests**

Add tests named:

- `seed lifecycle trains evaluates promotes and retains rollback lineage`
- `promotion rejects equal or worse held-out loss`
- `promotion rejects wrong dataset model artifact and evaluation lineage`
- `promotion requires explicit incumbent authority`
- `promotion returns a new frozen registry without mutating the incumbent registry`
- `rollback restores the former incumbent and retains displaced lineage`
- `native route serves the promoted checkpoint with no provider or network dependency`
- `native route rejects artifact manifest and registry mismatches`
- `native receipt contains no provider credential spending lease or traffic authority fields`

Install a temporary `globalThis.fetch` trap that throws and pass an empty environment object; inference must still pass without calling the trap.

- [ ] **Step 2: Run the lifecycle test and observe RED**

```bash
node --test --test-isolation=none test/model-foundry-lifecycle.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `model-foundry/src/lifecycle.ts`.

- [ ] **Step 3: Commit the RED test**

```bash
git add test/model-foundry-lifecycle.test.ts
git commit -m "test(model-foundry): define promotion and native route"
```

- [ ] **Step 4: Implement evaluation and registry lifecycle**

Implement:

```ts
evaluateCandidate(input): EvaluationReceipt
createModelRegistry(input): ModelRegistry
promoteCandidate(input: {
  registry: ModelRegistry;
  candidateManifest: CheckpointManifest;
  evaluation: EvaluationReceipt;
  incumbentAuthority: { decision: "allow"; incumbentCheckpointId: string };
  decidedAt: string;
}): { decision: PromotionDecision; registry: ModelRegistry }
rollbackModelRegistry(input): ModelRegistry
runSeedLifecycle(input): SeedLifecycleResult
```

A promotion is approved only when the evaluation is valid, bound to both artifacts and the held-out dataset, and `candidateLoss < incumbentLoss`.

- [ ] **Step 5: Implement the native route**

Implement:

```ts
executeNativeSeedInference(input: {
  registry: ModelRegistry;
  checkpointManifest: CheckpointManifest;
  checkpointArtifact: CheckpointArtifact;
  inputToken: string;
}): NativeInferenceReceipt
```

The receipt schema is exact and fingerprinted. It contains only `schemaVersion`, `kind`, `checkpointId`, `artifactFingerprint`, `inputToken`, `outputToken`, `probability`, and `fingerprint`.

- [ ] **Step 6: Run all focused tests and typecheck**

```bash
node --test --test-isolation=none test/model-foundry-contracts.test.ts test/model-foundry-seed.test.ts test/model-foundry-lifecycle.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 7: Commit GREEN**

```bash
git add model-foundry/src/lifecycle.ts model-foundry/src/native-route.ts
git commit -m "feat(model-foundry): govern seed promotion and inference"
```

### Task 4: Repository integration and documentation

**Files:**
- Create: `model-foundry/README.md`
- Modify: `tsconfig.json`

**Interfaces:**
- No new runtime behavior.
- Makes `model-foundry/**/*.ts` part of the strict root typecheck.
- Documents commands, boundaries, and the non-frontier acceptance claim.

- [ ] **Step 1: Extend the TypeScript contract test**

Modify `test/model-foundry-contracts.test.ts` to assert that `tsconfig.json` includes `model-foundry/**/*.ts` and that `model-foundry/README.md` states the provider-independent, research-scale boundary.

- [ ] **Step 2: Run the integration assertion and observe RED**

```bash
node --test --test-isolation=none test/model-foundry-contracts.test.ts
```

Expected: FAIL because the root is not yet in `tsconfig.json` and the README does not exist.

- [ ] **Step 3: Commit the RED integration test**

```bash
git add test/model-foundry-contracts.test.ts
git commit -m "test(model-foundry): require repository integration"
```

- [ ] **Step 4: Add README and tsconfig inclusion**

Add `"model-foundry/**/*.ts"` to `tsconfig.json#include`. Document the lifecycle, commands, invariants, non-goals, and exact acceptance boundary.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
node --test --test-isolation=none test/model-foundry-contracts.test.ts test/model-foundry-seed.test.ts test/model-foundry-lifecycle.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit integration**

```bash
git add model-foundry/README.md tsconfig.json
git commit -m "docs(model-foundry): document native seed boundary"
```

### Task 5: Full verification, PR, and merge

**Files:**
- Review all branch changes; no additional behavior is planned.

**Interfaces:**
- Produces exact-head verification evidence and the merge result.

- [ ] **Step 1: Run formatting and focused verification**

```bash
git diff --check origin/main...HEAD
node --test --test-isolation=none test/model-foundry-contracts.test.ts test/model-foundry-seed.test.ts test/model-foundry-lifecycle.test.ts
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Run the complete repository suites**

```bash
npm test
npm run verify
```

Expected: exit 0 with zero failed tests. If any unrelated failure occurs, report it by name and do not claim a green suite.

- [ ] **Step 3: Review the exact diff against the specification**

Confirm every acceptance requirement has a corresponding passing test, no authority-bearing fields or provider calls were introduced, and no existing runtime/deployment file changed outside `tsconfig.json`.

- [ ] **Step 4: Create the PR**

Title:

```text
feat(model-foundry): prove native seed model lifecycle
```

The body must link #899, explicitly state that #899 remains open, list RED/GREEN evidence, list local commands and results, and declare the non-frontier boundary.

- [ ] **Step 5: Wait for required exact-head checks**

Require successful:

- `Verify (ubuntu-latest)`
- `Verify (windows-latest)`

Do not merge a stale head, failed head, or merely pending head.

- [ ] **Step 6: Merge and verify main**

Squash merge with the reviewed expected head SHA. Confirm:

- PR state is merged;
- the merge commit is an ancestor of current `main`;
- `model-foundry/src/lifecycle.ts` and focused tests are present on `main`;
- the post-merge `Verify Mahoraga` run for the exact main SHA succeeds.
