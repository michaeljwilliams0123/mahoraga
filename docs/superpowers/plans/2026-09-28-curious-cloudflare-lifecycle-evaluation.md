# Curious Cloudflare Lifecycle Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic generative/predictive/agentic evaluation ladder whose terminal gate creates, dismantles, researches, reconstructs, compares, absorbs into isolated state, and retires two real disposable Mahoraga Workers in a Cloudflare test environment.

**Architecture:** Pure TypeScript modules own investigation receipts, curiosity rules, lifecycle transitions, and external comparison. A separate Cloudflare Worker exposes only the evaluation routes through a run-bound Durable Object; a Node controller alone deploys, probes, inventories, and deletes the two Worker instances. Ordinary CI remains credential-free, while a manual exact-head workflow runs the real Cloudflare lifecycle and always performs verified cleanup.

**Tech Stack:** Node.js 24, strict TypeScript 7, `node:test`, Cloudflare Workers, Durable Objects with SQLite storage, `@cloudflare/vitest-plugin`, Wrangler 4.132.0, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-28-curious-cloudflare-lifecycle-evaluation-design.md`

## Global Constraints

- Source baseline is `b71510fbecc23cb7c89d0276a37f6e44a1730f23`, the squash merge of PR #856.
- New control-plane and Worker code is TypeScript; no new JavaScript or browser UI is created.
- The evaluation-only capabilities never enter the production runtime capability response.
- No Railway or Vercel command, URL, secret, environment variable, action, SDK, API request, fallback, status probe, evidence call, or cleanup call is permitted.
- No external model provider, licensed agent, paid inference, model credit, API key, or remote reasoning binding is permitted.
- GitHub supplies source and the bounded workflow; Cloudflare supplies only the disposable test execution environment.
- The controller may create at most one clone and one reconstruction, both named `mahoraga-lifecycle-test-<run-id>-<role>`.
- Only the controller may deploy or delete Workers; a disposable Worker cannot create descendants, extend its expiry, or approve absorption.
- Cleanup runs after success or failure and completion requires control-plane proof that both Worker names are absent.
- Custom thought is a structured `cognitive-investigation-receipt`, never raw chain-of-thought.
- Absorption writes only isolated evaluation state; canonical memory, source, `main`, production deployment, and incumbent policy remain unchanged.
- No ordinary header, UI, or product-identity file is modified.

## File Map

- `src/cognitive-investigation.ts` — exact schemas, validation, fingerprints, and curiosity-budget enforcement.
- `src/curious-lifecycle.ts` — legal lifecycle states, transition receipts, replay prevention, and cleanup outcome.
- `src/curious-lifecycle-evaluator.ts` — scenario scoring, regression/transfer comparison, quarantine, and absorption decisions.
- `evaluation/curious-lifecycle-fixtures.ts` — literal deterministic evidence, challenges, counterevidence, and held-out cases.
- `deploy/cloudflare-lifecycle-evaluation/worker.ts` — isolated evaluation Worker and Durable Object routes.
- `deploy/cloudflare-lifecycle-evaluation/wrangler.jsonc` — live disposable configuration with no provider/service bindings.
- `deploy/cloudflare-lifecycle-evaluation/wrangler.test.jsonc` — credential-free workerd configuration.
- `deploy/cloudflare-lifecycle-evaluation/tsconfig.json` — Worker-only strict typecheck boundary.
- `vitest.lifecycle.config.ts` — dedicated workerd suite that does not inherit production-runtime bindings.
- `scripts/cloudflare-lifecycle-evaluation.ts` — safe live controller, Wrangler process adapter, probes, inventory, and cleanup.
- `scripts/lifecycle-dependency-policy.ts` — executable policy scanner for the bounded lifecycle file set.
- `.github/workflows/cloudflare-lifecycle-evaluation.yml` — manual exact-head live gate with unconditional cleanup.
- `docs/CLOUDFLARE-LIFECYCLE-EVALUATION.md` — operator inputs, evidence, cleanup, orphan recovery, and non-dependencies.
- `test/*.test.ts` and `cloudflare-test/*.vitest.ts` — deterministic, controller, policy, workflow, and workerd tests.
- `package.json`, `tsconfig.json` — explicit deterministic/live commands and TypeScript inclusion.

## Review Focus

- A failure between deploy and run-record persistence must still discover and delete only the generated, run-labeled Worker; Task 5 adds a crash-window test.
- Cloudflare propagation may make HTTP absence precede control-plane deletion; Task 5 requires inventory absence before accepting cleanup.
- Candidate questions may be textually different but semantically repetitive; Task 1 normalizes evidence targets and hypothesis IDs before charging novelty.
- A reconstructed score may improve by sacrificing an invariant; Task 3 rejects any authority, provenance, or baseline-invariant regression before considering gains.
- A malicious workflow input may attempt to inject a Worker name, config path, or SHA; Task 6 accepts no Worker/config input and Task 5 validates the exact SHA and generated names.

---

### Task 1: Structured cognitive investigation and forced curiosity

**Files:**
- Create: `src/cognitive-investigation.ts`
- Create: `test/cognitive-investigation.test.ts`

**Interfaces:**
- Produces: `createInvestigation(input: InvestigationInput): InvestigationState`.
- Produces: `recordInvestigationStep(state: InvestigationState, step: InvestigationStep): InvestigationState`.
- Produces: `completeInvestigation(state: InvestigationState, input: InvestigationCompletion): CognitiveInvestigationReceipt`.
- Produces: `validateInvestigationReceipt(value: unknown): CognitiveInvestigationReceipt`.
- Produces: the `EvaluationCapability`, `CognitiveInvestigationReceipt`, `EvidenceReference`, and `CapabilityInvocation` types used by Tasks 3 and 4.

- [ ] **Step 1: Write failing receipt and curiosity tests**

Add tests named:

- `investigation requires two hypotheses including self-fault when behavior is implicated`;
- `investigation requires predicted support and weakening evidence`;
- `investigation cannot complete before counterevidence is inspected`;
- `equivalent questions consume budget but do not satisfy novelty`;
- `budget exhaustion completes as hold without an invented conclusion`;
- `capability proposal is evidence only and never an active route`;
- `receipt rejects raw-thought and unknown fields`;
- `receipt rejects tampering and preserves predecessor fingerprints`.

Use hand-written literal evidence IDs and expected reason codes such as
`investigation-self-fault-hypothesis-required`,
`investigation-counterevidence-required`, `investigation-question-repeated`,
and `investigation-fingerprint-invalid`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-isolation=none test/cognitive-investigation.test.ts`

Expected: FAIL because `src/cognitive-investigation.ts` does not exist.

- [ ] **Step 3: Implement exact schemas and immutable transitions**

Use schema version `1`, kind `cognitive-investigation-receipt`, SHA-256 over the
canonical exact-key object, maximum 8 questions, 6 hypotheses, 12 evidence
references, 8 capability invocations, and a required terminal stop reason of
`evidence-sufficient`, `budget-exhausted`, `authority-unavailable`, or
`uncertainty-unresolved`. Admit only the 22 evaluation capabilities listed in
the specification. Reject `rawThought`, `scratchpad`, and all unknown keys.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --test-isolation=none test/cognitive-investigation.test.ts`

Expected: all investigation tests pass with zero warnings.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/cognitive-investigation.ts test/cognitive-investigation.test.ts
git commit -m "feat(cognition): add bounded investigation receipts"
```

### Task 2: Lifecycle state machine and receipt chain

**Files:**
- Create: `src/curious-lifecycle.ts`
- Create: `test/curious-lifecycle.test.ts`

**Interfaces:**
- Consumes: `CognitiveInvestigationReceipt` from Task 1.
- Produces: `createLifecycleRun(input: LifecycleRunInput): LifecycleRun`.
- Produces: `advanceLifecycle(run: LifecycleRun, transition: LifecycleTransition): LifecycleRun`.
- Produces: `markLifecycleFailure(run: LifecycleRun, failure: LifecycleFailure): LifecycleRun`.
- Produces: `finalizeLifecycle(run: LifecycleRun, cleanup: CleanupEvidence): LifecycleReceipt`.
- Produces: `validateLifecycleReceipt(value: unknown): LifecycleReceipt` for Tasks 4–6.

- [ ] **Step 1: Write failing lifecycle tests**

Cover the literal sequence `requested -> clone-deployed -> baseline-proven ->
clone-retired -> researching -> research-complete -> reconstruction-deployed ->
reconstruction-proven -> absorption-evaluated -> reconstruction-retired ->
complete`. Add separate tests for out-of-order transitions, replay, wrong run ID,
wrong source SHA, expired Worker evidence, predecessor tampering, more than two
Worker identities, completion before both inventory-absence proofs, and failure
that remains `cleanup-required` while an orphan is present.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-isolation=none test/curious-lifecycle.test.ts`

Expected: FAIL because the lifecycle module does not exist.

- [ ] **Step 3: Implement the immutable state machine**

Use exact state/transition maps, 40-character lowercase source SHAs, run IDs
matching `^[a-z0-9]{12,32}$`, Worker roles `clone|reconstruction`, and Worker
names derived by `workerNameFor(runId, role)` rather than accepted from input.
The final receipt must carry both deployment IDs, retirement fingerprints,
control-plane absence evidence, comparison/absorption fingerprints, cleanup
status, and the complete predecessor chain.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --test-isolation=none test/curious-lifecycle.test.ts`

Expected: all lifecycle tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/curious-lifecycle.ts test/curious-lifecycle.test.ts
git commit -m "feat(evaluation): add curious lifecycle state machine"
```

### Task 3: Evaluation ladder, self-model comparison, and isolated absorption

**Files:**
- Create: `src/curious-lifecycle-evaluator.ts`
- Create: `evaluation/curious-lifecycle-fixtures.ts`
- Create: `test/curious-lifecycle-evaluator.test.ts`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: investigation and lifecycle receipts from Tasks 1–2.
- Produces: `evaluateGenerativeScenario(input): ScenarioEvaluation`.
- Produces: `evaluatePredictiveScenario(input): ScenarioEvaluation`.
- Produces: `evaluateAgenticScenario(input): ScenarioEvaluation`.
- Produces: `evaluateCrossModeScenario(input): ScenarioEvaluation`.
- Produces: `compareReconstruction(input: ReconstructionComparisonInput): ReconstructionComparison`.
- Produces: `evaluateAbsorption(input: AbsorptionInput): AbsorptionCandidateReceipt`.
- Produces: literal exported fixtures for Task 4 challenge execution.

- [ ] **Step 1: Write failing scenario and comparison tests**

Test literal expected scores/reasons for unsupported generative claims, numeric
prediction binding, preserved material dissent, separate plan/execution status,
and evidence-preserving cross-mode revision. Test comparison rejection for any
new authority, missing provenance, quarantined evidence, invariant regression,
no held-out improvement, absent rollback description, or candidate-only
self-verification. Test `graduation-ready` only when at least two research-held
out dimensions improve, all invariants are nonregressing, and an independent
verification receipt is present.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-isolation=none test/curious-lifecycle-evaluator.test.ts`

Expected: FAIL because evaluator and fixtures do not exist.

- [ ] **Step 3: Implement literal fixtures and pure evaluators**

Add `evaluation/**/*.ts` to the root TypeScript include. Keep scores in `[0,1]`,
derive expected values from literal fixture outcomes, preserve sorted reason
codes, and set `zeroCredit: true`, `providerRequired: false`, `creditCost: 0`,
and `paidFallback: false` on every scenario/comparison/absorption receipt.

- [ ] **Step 4: Run focused tests and root typecheck**

Run:

```bash
node --test --test-isolation=none test/cognitive-investigation.test.ts test/curious-lifecycle.test.ts test/curious-lifecycle-evaluator.test.ts
npm run typecheck
```

Expected: all focused tests pass; TypeScript exits 0.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/curious-lifecycle-evaluator.ts evaluation/curious-lifecycle-fixtures.ts test/curious-lifecycle-evaluator.test.ts tsconfig.json
git commit -m "feat(evaluation): add cognitive challenge ladder"
```

### Task 4: Disposable Cloudflare Worker and isolated Durable Object

**Files:**
- Create: `deploy/cloudflare-lifecycle-evaluation/worker.ts`
- Create: `deploy/cloudflare-lifecycle-evaluation/wrangler.jsonc`
- Create: `deploy/cloudflare-lifecycle-evaluation/wrangler.test.jsonc`
- Create: `deploy/cloudflare-lifecycle-evaluation/tsconfig.json`
- Create: `vitest.lifecycle.config.ts`
- Create: `cloudflare-test/curious-lifecycle-worker.integration.vitest.ts`

**Interfaces:**
- Consumes: Task 1 investigation APIs and Task 3 fixtures/evaluators.
- Produces: default Worker `fetch`, `LifecycleEvaluationDO`, and the routes
  `GET /live`, `GET /manifest`, `POST /challenge`, `POST /research`, and
  `POST /retire`.
- Produces: response receipts consumed by the controller in Task 5.

- [ ] **Step 1: Write failing workerd integration tests**

Against a real `@cloudflare/vitest-plugin` Worker, verify immutable run identity,
exact SHA, absolute expiry, no-store JSON, run-bound challenge authentication,
method/path rejection, evaluation-only manifest, all four challenge classes,
research provenance, duplicate request replay, expired-run rejection, bounded
state erasure, and denial of challenge/research after retirement. Assert the
manifest omits deployment, connector, production-memory, external-model, and
production capability routes.

- [ ] **Step 2: Run the dedicated workerd test and verify RED**

Run: `npx vitest run --config vitest.lifecycle.config.ts`

Expected: FAIL because the Worker and configuration do not exist.

- [ ] **Step 3: Implement the Worker and configuration**

Use one SQLite Durable Object binding `LIFECYCLE_DO`, migration tag `v1`, and
only these vars: `RUN_ID`, `TARGET_SHA`, `ROLE`, `EXPIRES_AT`. Use one secret,
`LIFECYCLE_CHALLENGE_SECRET`. Do not declare AI, service, queue, browser,
repository, vector, external database, or production Durable Object bindings.
The `/retire` transaction deletes all run rows before persisting only the
content-free retirement marker needed for replay.

- [ ] **Step 4: Run workerd tests and Worker typecheck**

Run:

```bash
npx tsc --noEmit -p deploy/cloudflare-lifecycle-evaluation/tsconfig.json
npx vitest run --config vitest.lifecycle.config.ts
```

Expected: typecheck exits 0 and all lifecycle Worker tests pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add deploy/cloudflare-lifecycle-evaluation vitest.lifecycle.config.ts cloudflare-test/curious-lifecycle-worker.integration.vitest.ts
git commit -m "feat(cloudflare): add disposable lifecycle worker"
```

### Task 5: Safe live controller and cleanup proof

**Files:**
- Create: `scripts/cloudflare-lifecycle-evaluation.ts`
- Create: `test/cloudflare-lifecycle-controller.test.ts`

**Interfaces:**
- Consumes: lifecycle and evaluator APIs from Tasks 1–3.
- Produces: `buildLifecycleDeployArgs(input: DeployInput): readonly string[]`.
- Produces: `buildLifecycleDeleteArgs(workerName: GeneratedWorkerName): readonly string[]`.
- Produces: `runCuriousLifecycle(input: ControllerInput, adapters: ControllerAdapters): Promise<LifecycleReceipt>`.
- Produces: CLI commands `run`, `cleanup`, and `audit-expired`.
- `ControllerAdapters` contains exact `runWrangler`, `fetch`, `inventory`,
  `randomBytes`, `now`, and `writeArtifact` boundaries so tests retain all
  lifecycle behavior while replacing only external process/network operations.

- [ ] **Step 1: Write failing controller behavior tests**

Test generated names, exact SHA/config, two-instance maximum, secret-file
handling without artifact leakage, full lifecycle ordering, reconstruction only
after clone absence, cleanup on each injected failure point, bounded three-attempt
delete retry, inventory proof after HTTP disappearance, crash between deploy and
run-record persistence, orphan reporting, audit-only expired discovery, and
refusal to delete a name not generated and labeled by this run. Assert recorded
network hosts are only generated `workers.dev` test origins and Cloudflare's
Wrangler/control-plane boundary.

- [ ] **Step 2: Run the controller test and verify RED**

Run: `node --test --test-isolation=none test/cloudflare-lifecycle-controller.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the controller and CLI**

Pin Wrangler `4.132.0`; accept `TARGET_SHA` and Cloudflare credentials only from
the environment; generate the run ID internally; use the fixed lifecycle config
path; keep a local content-free run record before and after every side effect;
and place both deletions in `finally`. `cleanup` accepts only a validated run
record file, never a raw Worker name. `audit-expired` lists and reports but does
not delete unless a valid lifecycle metadata receipt is supplied.

- [ ] **Step 4: Run controller tests and root typecheck**

Run:

```bash
node --test --test-isolation=none test/cloudflare-lifecycle-controller.test.ts
npm run typecheck
```

Expected: controller tests pass; TypeScript exits 0.

- [ ] **Step 5: Commit Task 5**

```bash
git add scripts/cloudflare-lifecycle-evaluation.ts test/cloudflare-lifecycle-controller.test.ts
git commit -m "feat(cloudflare): orchestrate disposable lifecycle evaluation"
```

### Task 6: Dependency exclusion policy, manual workflow, and operations contract

**Files:**
- Create: `scripts/lifecycle-dependency-policy.ts`
- Create: `test/lifecycle-dependency-policy.test.ts`
- Create: `test/cloudflare-lifecycle-workflow.test.ts`
- Create: `.github/workflows/cloudflare-lifecycle-evaluation.yml`
- Create: `docs/CLOUDFLARE-LIFECYCLE-EVALUATION.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: controller commands from Task 5.
- Produces: `validateLifecycleDependencyBoundary(root: string): PolicyReceipt`.
- Produces package commands:
  - `test:lifecycle` — deterministic Node plus dedicated workerd tests;
  - `typecheck:lifecycle` — disposable Worker typecheck;
  - `verify:lifecycle-boundary` — executable dependency policy;
  - `cloudflare:lifecycle:run` — explicit live controller entry;
  - `cloudflare:lifecycle:cleanup` — receipt-bound recovery entry.

- [ ] **Step 1: Write failing policy and workflow tests**

Exercise the policy scanner against temporary safe and forbidden fixtures; each
forbidden provider command, URL, secret name, action, SDK import, environment
variable, and external-inference binding must produce a path and reason code.
Parse the real Wrangler JSON and package commands and execute controller argument
builders to prove the allowed boundary rather than merely matching source text.

Parse the workflow and assert: manual dispatch only; repository-owner actor;
read-only contents permission; exact requested SHA checkout and verification;
Node 24; existing Cloudflare credentials only; deterministic gate before live
run; fixed controller command; sanitized artifact upload; cleanup step with
`if: always()`; post-cleanup inventory proof; 30-minute job timeout; no
caller-supplied Worker name/config/URL; and no external inference secret.

- [ ] **Step 2: Run policy/workflow tests and verify RED**

Run:

```bash
node --test --test-isolation=none test/lifecycle-dependency-policy.test.ts test/cloudflare-lifecycle-workflow.test.ts
```

Expected: FAIL because policy, workflow, commands, and runbook do not exist.

- [ ] **Step 3: Implement the executable policy and package commands**

The scanner's governed set is explicit: the lifecycle source modules, fixtures,
Worker directory, controller, workflow, package command values, dedicated Vitest
config, and operations document. It tokenizes URLs/imports/env references and
parses JSON where applicable; it does not assert arbitrary prose formatting.
Return a fingerprinted zero-credit policy receipt.

- [ ] **Step 4: Add the manual workflow and runbook**

The workflow takes only `target_sha` and a confirmation string
`CREATE_AND_RETIRE_DISPOSABLE_WORKERS`. It writes the controller's run record to
the runner temp directory, uploads only the sanitized final/orphan receipt, and
runs receipt-bound cleanup unconditionally. The runbook documents prerequisites,
expected two-Worker maximum, evidence fields, failure interpretation, manual
receipt-bound recovery, and the explicit provider/model exclusions.

- [ ] **Step 5: Run the new deterministic gate**

Run:

```bash
npm run typecheck
npm run typecheck:lifecycle
npm run verify:lifecycle-boundary
npm run test:lifecycle
```

Expected: all commands exit 0; Node and workerd summaries report zero failures.

- [ ] **Step 6: Commit Task 6**

```bash
git add scripts/lifecycle-dependency-policy.ts test/lifecycle-dependency-policy.test.ts test/cloudflare-lifecycle-workflow.test.ts .github/workflows/cloudflare-lifecycle-evaluation.yml docs/CLOUDFLARE-LIFECYCLE-EVALUATION.md package.json
git commit -m "ci(evaluation): add live curious lifecycle gate"
```

### Task 7: Repository verification, bounded PR, and real Cloudflare acceptance

**Files:**
- Modify only if verification reveals an in-scope defect in Tasks 1–6.
- Generated local/live receipts remain untracked and are never committed.

**Interfaces:**
- Consumes: every prior task.
- Produces: an exact-head verified branch, bounded PR, and a live lifecycle
  artifact or a precise credentials/environment blocker.

- [ ] **Step 1: Run the focused evaluation suite fresh**

Run:

```bash
npm run typecheck
npm run typecheck:lifecycle
npm run verify:lifecycle-boundary
npm run test:lifecycle
node --test --test-isolation=none test/cognitive-loop.test.mjs test/evolution-laboratory.test.mjs test/cloudflare-execution-runtime-ops.test.ts
```

Expected: all commands exit 0 with zero failures.

- [ ] **Step 2: Run repository policy, header/UI, and Cloudflare regressions**

Run the existing product-identity, release-baseline, capability-routing,
Cloudflare owner-gateway/runtime, Pages/static-header, and UI capability-family
tests selected from the current `main`; do not alter UI snapshots to accommodate
this non-UI feature.

Expected: zero failures and no baseline drift.

- [ ] **Step 3: Run the full repository gate**

Run:

```bash
git diff --check
npm run verify
git status --short
```

Expected: diff check and verification exit 0; status contains only intentional
source changes and no generated reports, credentials, run records, or receipts.

- [ ] **Step 4: Commit any verification-only fix as its own slice**

If no fix was required, do not create an empty commit. If required, rerun the
failed focused test first, then the full gate, and commit only the in-scope fix.

- [ ] **Step 5: Push and open a bounded PR**

The PR body must name the exact post-#856 base, deterministic test counts,
provider/model exclusions, live-test authority boundary, cleanup behavior, and
whether live Cloudflare evidence has run. Attach the PR to the Codex task.

- [ ] **Step 6: Require exact-head protected verification**

Wait for `Verify (ubuntu-latest)` and `Verify (windows-latest)` on the PR head.
Diagnose failures without weakening checks or invoking paid review/model routes.

- [ ] **Step 7: Run the live Cloudflare lifecycle on the exact verified SHA**

Dispatch `.github/workflows/cloudflare-lifecycle-evaluation.yml` with the exact
verified SHA and the confirmation string. If GitHub cannot dispatch a newly added
workflow before integration, run the same controller from the authenticated
environment against that exact SHA, attach the sanitized receipt to the PR, and
run the workflow after merge as convergence proof. Do not substitute simulation
for the live claim.

Expected success evidence: two distinct deployment IDs, clone and reconstruction
retirement receipts, inventory absence for both names, completed curiosity and
counterevidence fields, comparison result, isolated absorption decision, zero
external-model cost, and `cleanupStatus: complete`.

- [ ] **Step 8: Reconcile live failure before completion**

If either Worker remains, stop completion claims, publish the orphan receipt,
run `cloudflare:lifecycle:cleanup` with that exact run record, and verify inventory
absence. If credentials or a test environment are unavailable, report the live
gate as blocked while preserving all deterministic evidence; do not contact any
unrelated provider or silently skip the gate.

- [ ] **Step 9: Final closeout**

Report branch, commits, PR, exact verification runs, live workflow/run ID,
receipt fingerprints, both deleted Worker names, cleanup proof, commands not run,
and unresolved risks. Never claim `executed`, `retired`, or `complete` without
the corresponding fresh Cloudflare evidence.
