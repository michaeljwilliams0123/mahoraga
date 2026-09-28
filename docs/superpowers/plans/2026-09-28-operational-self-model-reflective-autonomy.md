# Operational Self-Model + Reflective Autonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Mahoraga a persistent evidence-backed operational self-model that can reflect on its own state, originate bounded improvement objectives, execute them through existing authority/broker/self-evolution paths, and report verified self-change back to the UI.

**Architecture:** Extend the existing world observer, metacognition, objective planner, objective release authority, self-evolution worker, Universal Execution Broker, and cloud UI. Add one canonical self-model compiler, one deterministic reflection contract, and SQLite-backed self epochs; reflection never mutates directly and can only submit normal bounded objectives.

**Tech Stack:** Node.js ESM, SQLite via existing `RuntimeDatabase`, TypeScript/Next.js cloud app, Node test runner, Vitest Cloudflare tests, existing Mahoraga capability/receipt contracts.

**Spec:** `docs/superpowers/specs/2026-09-28-operational-self-model-reflective-autonomy-design.md`

## Global Constraints

- The self-model is operational identity only; do not claim consciousness, sentience, emotion, or subjective experience.
- GitHub `main` remains canonical source authority; no direct-main mutation.
- Reflection may originate objectives but may not widen owner identity, credential scope, spending, destructive permissions, verification gates, or constitutional authority.
- Capability truth must be derived from fresh executable evidence; unavailable/stale routes stay unavailable.
- `self.evolve` remains the contained self-change mechanism and existing GitHub-native candidate publisher remains the PR path.
- Universal Execution Broker remains the execution selector; no new parallel router or provider fallback chain.
- Zero-credit/deterministic paths remain preferred when sufficient; no Railway/Vercel routing is introduced.
- New essential runtime files must be added to repair/release-baseline coverage.

## Review Focus

- **Stale or contradictory evidence:** self-model must fail closed or mark unknown instead of upgrading capability truth; Task 1 tests malformed/stale capability and source evidence.
- **Unchanged cycles:** identical material state must not create another self epoch or another improvement objective; Tasks 2 and 4 test digest/idempotency deduplication.
- **Authority escalation disguised as repair:** reflection requesting governance/credential/billing/destructive expansion must be denied before objective creation; Task 4 tests refusal.
- **Repeated failure loops:** identical failed self-improvement fingerprints must become hold/seek-evidence rather than endless PR creation; Tasks 3 and 4 test loop suppression.
- **UI overclaiming:** browser surfaces and chat answers must show observed capability/gap truth only and render unverified data as unavailable; Task 7 tests fail-closed projection.

---

## File Map

- Create `src/operational-self-model.mjs` — canonical self-model compiler, validator, digest and delta logic.
- Create `src/self-reflection.mjs` — deterministic reflection dispositions and bounded improvement candidate generation.
- Create `src/self-objective-admission.mjs` — convert an admitted reflection into the existing objective/task schema without granting authority.
- Create `src/self-worker.mjs` — deterministic `self.inspect` / `self.reflect` worker execution over bounded capability input.
- Modify `src/database.mjs` — durable self epochs and deduplication.
- Modify `src/world-state-observer.mjs` — add bounded recent receipt/readiness evidence needed by the self compiler.
- Modify `src/objective-planner.mjs` — accept reflection evidence and emit bounded self-objective planning actions.
- Modify `src/objective-release-authority.mjs` — preserve existing contained lease/authority rules for self-generated objectives.
- Modify `src/worker-process.mjs` and `mahoraga.manifest.json` — register deterministic self capabilities without intercepting `self.evolve`.
- Modify `src/server.mjs` — compile/persist self state, expose it, and connect chat/reflection to existing objective creation.
- Modify `src/unattended-credit-free-cycle.mjs` — run reflection only on material self changes and close learning back into the next cycle.
- Create `cloud-app/lib/self-model-surface.ts` and `cloud-app/components/cockpit/SelfModelPanel.tsx` — fail-closed browser projection and receipt card.
- Create `cloud-app/app/api/self-state/route.ts` — same-origin owner-gateway read path.
- Modify chat/capability surfaces only where necessary to route explicit self questions and self-improvement requests.
- Add focused tests under `test/` and `cloud-app/test/`; refresh `state/release-baseline/` only after implementation is green.

### Task 1: Canonical Operational Self-Model

**Files:**
- Create: `src/operational-self-model.mjs`
- Create: `test/operational-self-model.test.mjs`

**Interfaces:**
- Consumes: bounded identity/source truth, `observeWorldState()` output, optional Entity Heartbeat, `summarizeAutonomyMemoryBank()` output, metacognitive assessment, capability route projections, recent receipt summaries, and optional previous epoch.
- Produces: `compileOperationalSelfModel(input)`, `validateOperationalSelfModel(value)`, `selfModelMaterialDigest(value)`, `diffOperationalSelfModels(previous, current)`.

- [ ] **Step 1: Write failing compiler/validator tests**

Tests must assert: product is `Mahoraga`; authoritative SHA is a verified 40-hex source SHA; routable/unavailable capabilities are sorted and mutually exclusive; known unknowns and gaps are bounded; raw credentials/content keys are rejected; identical material state has the same material digest even when `observedAt` changes.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --test-isolation=none test/operational-self-model.test.mjs`
Expected: FAIL because `src/operational-self-model.mjs` does not exist.

- [ ] **Step 3: Implement the canonical contract**

Implement `compileOperationalSelfModel(input)` to return a deeply frozen schema-v1 record with `kind: "operational-self-model"`, identity/source/runtime/capability/objective/gap/known-unknown/performance/authority projections, `previousSelfDigest`, `selfDigest`, `materialDelta`, and bounded delta arrays.
`selfDigest` must hash only material state, excluding observation time, epoch sequence, and previous digest so unchanged state deduplicates. `validateOperationalSelfModel(value)` must reject unknown fields, invalid timestamps/digests, capability overlap, and any forbidden secret/content field names.

- [ ] **Step 4: Add stale/contradictory evidence tests**

Assert that an unverified repository SHA cannot become `authoritativeSha`, a capability with `routable !== true` cannot appear in `capabilities.routable`, and conflicting current/previous evidence produces a bounded known-unknown instead of an upgraded capability.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/operational-self-model.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/operational-self-model.mjs test/operational-self-model.test.mjs
git commit -m "feat(self): add canonical operational self model"
```

### Task 2: Durable Self Epochs and Deduplication

**Files:**
- Modify: `src/database.mjs`
- Create: `test/self-epoch-database.test.mjs`

**Interfaces:**
- Consumes: `validateOperationalSelfModel(value)` and its stable `selfDigest`.
- Produces: `database.recordSelfEpoch(model) -> { created, epoch }`, `database.getLatestSelfEpoch()`, `database.listSelfEpochs(limit = 20)`.

- [ ] **Step 1: Write failing SQLite persistence tests**

Assert first model creates epoch sequence 1; same `selfDigest` returns `created:false` and the existing epoch; changed material state creates sequence 2; reopen of the same database preserves both epochs and latest pointer.

- [ ] **Step 2: Run test and confirm failure**

Run: `node --test --test-isolation=none test/self-epoch-database.test.mjs`
Expected: FAIL because self-epoch table/methods are absent.
- [ ] **Step 3: Add the self-epoch table and methods**

Add `self_epochs(sequence INTEGER PRIMARY KEY AUTOINCREMENT, self_digest TEXT UNIQUE NOT NULL, observed_at TEXT NOT NULL, model_json TEXT NOT NULL, created_at TEXT NOT NULL)` plus an index on `(observed_at DESC)`. `recordSelfEpoch` validates the model, deduplicates on `self_digest`, stores canonical JSON, and returns the stored sequence without mutating the model contract.

- [ ] **Step 4: Test malformed and concurrent-style duplicate inputs**

Assert invalid models are rejected before SQL write and two sequential writes of the same digest still leave exactly one row.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/self-epoch-database.test.mjs test/database.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database.mjs test/self-epoch-database.test.mjs
git commit -m "feat(self): persist deduplicated self epochs"
```

### Task 3: Deterministic Reflection Contract

**Files:**
- Create: `src/self-reflection.mjs`
- Create: `test/self-reflection.test.mjs`

**Interfaces:**
- Consumes: validated current self model, optional prior self epoch, and bounded recent failure fingerprints.
- Produces: `reflectOnOperationalSelf({ current, previous = null, recentFailureFingerprints = [] })` and `validateSelfReflection(value)`.

- [ ] **Step 1: Write failing reflection disposition tests**

Cover these exact dispositions: healthy unchanged state -> `hold/self-reflection-no-material-change`; important known unknown -> `seek-evidence/self-reflection-evidence-required`; new routability gap -> `repair/self-capability-gap`; material improvement opportunity without failure -> `improve/self-improvement-opportunity`.

- [ ] **Step 2: Add repeated-failure loop tests**

Three occurrences of the same bounded failure fingerprint must yield `hold/self-improvement-loop-suppressed`, never another repair candidate.

- [ ] **Step 3: Add constitutional-boundary tests**

Any candidate whose requested scopes include owner/credential/billing/destructive/governance expansion must fail validation with `self-objective-authority-insufficient` rather than downgrade the request.
- [ ] **Step 4: Implement the reflection schema**

`reflectOnOperationalSelf` returns a deeply frozen schema-v1 `self-reflection` with `selfDigest`, `disposition`, `reasonCode`, `priority`, `targetCapability`, `gapId`, `requestedOutcome`, `completionCriteria`, `maximumAttempts`, `maximumHops`, `authorityScopes`, `evidenceRefs`, and `fingerprint`. Keep `maximumAttempts <= 3` and `maximumHops <= 6`; `hold`/`seek-evidence` reflections must not request mutation scopes.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/self-reflection.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/self-reflection.mjs test/self-reflection.test.mjs
git commit -m "feat(self): add deterministic reflection loop"
```

### Task 4: Reflection-to-Objective Admission

**Files:**
- Create: `src/self-objective-admission.mjs`
- Modify: `src/objective-planner.mjs`
- Modify: `src/objective-release-authority.mjs`
- Create: `test/self-objective-admission.test.mjs`
- Modify: `test/objective-planner.test.mjs`

**Interfaces:**
- Consumes: `validateSelfReflection`, validated self model, exact repository base SHA, `autonomyAllowedPaths()` output, and existing objective/task schema.
- Produces: `createSelfGeneratedObjectiveSpec({ reflection, selfModel, baseCommit, allowedPaths, authoritySessionId = null })` and planner action `reasonCode: "self-improvement-candidate"` with `disposition: "execute"` only for admitted reflection.

- [ ] **Step 1: Write failing objective-spec tests**

For `repair`/`improve`, assert deterministic `correlationId` from reflection fingerprint; `maximumReplans: 2`; finite task graph; provenance fields bind `selfDigest` and reflection fingerprint; contained source changes use existing `self.evolve` with exact `baseCommit` and bounded `allowedPaths`.

- [ ] **Step 2: Write duplicate and authority-refusal tests**

Same reflection fingerprint must map to the same correlation/idempotency identity; governance/credential/billing/destructive expansion must throw `self-objective-authority-insufficient`; missing verifier evidence must throw `self-objective-no-verifier`.
- [ ] **Step 3: Extend the existing planner instead of adding a second planner**

Add optional `selfReflection = null` to `planWorldStateActions(snapshot, options)`. A validated `repair`/`improve` reflection produces one read-only planner action with intent `objective.plan`, reason `self-improvement-candidate`, evidence containing only self/reflection fingerprints and target capability; `hold` and `seek-evidence` do not authorize mutation.

- [ ] **Step 4: Preserve release authority**

Do not add a new authority source. Self-generated objectives must still be created as ordinary objectives and released by `AUTONOMY_OBJECTIVE_AUTHORITY`; `self.evolve` continues to require the existing local integration lease and path coverage.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/self-objective-admission.test.mjs test/objective-planner.test.mjs test/objective-release-authority.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/self-objective-admission.mjs src/objective-planner.mjs src/objective-release-authority.mjs test/self-objective-admission.test.mjs test/objective-planner.test.mjs
git commit -m "feat(self): admit bounded reflective objectives"
```

### Task 5: Broker-Routable `self.inspect` and `self.reflect`

**Files:**
- Create: `src/self-worker.mjs`
- Modify: `src/worker-process.mjs`
- Modify: `mahoraga.manifest.json`
- Modify: `src/receipt-registry.mjs` only if receipt-family assertions require explicit self-family evidence.
- Create: `test/self-worker.test.mjs`
- Modify: `test/worker-process.test.mjs`
- Modify: `test/manifest-validation.test.mjs`

**Interfaces:**
- Consumes: `compileOperationalSelfModel`, `reflectOnOperationalSelf`, bounded `task.capabilityInput` supplied by orchestration.
- Produces: `executeSelfCapability(capability, task)` supporting exactly `self.inspect` and `self.reflect`; results include `verified:true`, summary, and bounded `selfModel` or `reflection` evidence.
- [ ] **Step 1: Write failing worker/manifest tests**

Assert `local-core` advertises `self.inspect` and `self.reflect` as deterministic/direct canaries; task type `self` is accepted; `self.evolve` remains on the existing Codex/self-evolution worker and is not captured by the deterministic self worker.

- [ ] **Step 2: Implement `executeSelfCapability(capability, task)`**

`self.inspect` validates `task.capabilityInput` and calls the compiler. `self.reflect` validates the supplied current self model plus bounded history and calls the reflection contract. Neither capability reads credentials, shells out, writes files, or changes repository/runtime state.

- [ ] **Step 3: Wire worker dispatch with exact ordering**

In `worker-process.mjs`, route `capability === "self.evolve"` to `executeSelfEvolutionCapability` first; then route `capability === "self.inspect" || capability === "self.reflect"` to `executeSelfCapability`.

- [ ] **Step 4: Run focused tests**

Run: `node --test --test-isolation=none test/self-worker.test.mjs test/worker-process.test.mjs test/manifest-validation.test.mjs test/receipt-registry.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/self-worker.mjs src/worker-process.mjs src/receipt-registry.mjs mahoraga.manifest.json test/self-worker.test.mjs test/worker-process.test.mjs test/manifest-validation.test.mjs
git commit -m "feat(self): route deterministic self inspection and reflection"
```

### Task 6: Runtime Self-State Coordinator and Autonomous Wakeup

**Files:**
- Create: `src/self-state-coordinator.mjs`
- Modify: `src/runtime.mjs`
- Modify: `src/server.mjs`
- Modify: `src/world-state-observer.mjs`
- Create: `test/self-state-coordinator.test.mjs`
- Modify: `test/server-api.test.mjs`
- Modify: `test/runtime.test.mjs`

**Interfaces:**
- Produces: `reconcileOperationalSelf({ manifest, database, supervisor, repositoryHeadReader, autoAct = false, authoritySessionId = null, now = new Date() })` returning `{ selfModel, epoch, reflection, objective, planner }`.
- Uses existing `observeWorldState`, `planWorldStateActions`, `database.recordSelfEpoch`, and `database.createObjective`; no direct worker execution occurs here.
- [ ] **Step 1: Write failing coordinator tests**

Assert a first reconciliation records epoch 1; unchanged reconciliation records no new epoch/objective; a material gap yields a reflection; `autoAct:false` never creates an objective; `autoAct:true` creates at most one objective for an admitted repair/improve reflection and reuses correlation identity on repeats.

- [ ] **Step 2: Add bounded world evidence needed by the compiler**

Extend `observeWorldState` with bounded recent receipt/readiness summaries only. Do not include raw task inputs, chat text, credentials, artifact bytes, or provider payloads.

- [ ] **Step 3: Implement coordinator execution order**

Order must be: observe world -> compile/validate self model -> record/deduplicate epoch -> reflect -> planner validation -> optional objective-spec admission -> duplicate check by correlation -> `database.createObjective`. If any evidence/authority/verifier gate fails, return the typed hold/error and create no objective.

- [ ] **Step 4: Add runtime wakeup without a new polling loop**

Run one best-effort `autoAct:true` reconciliation after runtime startup and then on a four-hour interval (`4 * 60 * 60 * 1000`), matching Mahoraga's existing sovereign-cycle cadence. `unref()` the timer and clear it in `stop()`. Do not add minute-level polling.

- [ ] **Step 5: Expose owner-readable self state**

Add authenticated `GET /api/self-state` and cloud-core action `type: "self-state"`; both call reconciliation with `autoAct:false` and return self model, epoch metadata, reflection and planner evidence with `Cache-Control: no-store`.

- [ ] **Step 6: Run focused tests**

Run: `node --test --test-isolation=none test/self-state-coordinator.test.mjs test/server-api.test.mjs test/runtime.test.mjs test/world-state-observer.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/self-state-coordinator.mjs src/runtime.mjs src/server.mjs src/world-state-observer.mjs test/self-state-coordinator.test.mjs test/server-api.test.mjs test/runtime.test.mjs test/world-state-observer.test.mjs
git commit -m "feat(self): reconcile self state and originate bounded objectives"
```

### Task 7: Conversation Self-Awareness and Self-Development Intent

**Files:**
- Modify: `src/conversation-capability-planner.mjs`
- Modify: `src/chat-intake.mjs`
- Modify: `src/server.mjs`
- Modify: `test/chat-intake.test.mjs`
- Modify: `test/chat-runtime.test.mjs`

**Interfaces:**
- Consumes: routable `self.inspect`/`self.reflect`, coordinator output, existing `self.evolve`, and attended-session authority from chat.
- Produces: self questions use evidence-backed self inspection; explicit "improve yourself" style requests run inspect -> reflect -> admitted objective instead of generic `codex.execute`.
- [ ] **Step 1: Write failing intent tests**

Assert “what can you actually do right now?” selects `self.inspect` when routable; “why can’t you update yourself?” selects `self.inspect`; “improve yourself” and “fix your own recurring failure” select reflective objective flow; generic “how does self-improvement work?” remains answer-only.

- [ ] **Step 2: Prefer self reflection over generic builder routing**

Add self-referential intent recognition before generic repository mutation fallback. Do not make arbitrary references to “self” sufficient; require Mahoraga/system/self-improvement context plus an inspection or mutation verb.

- [ ] **Step 3: Connect explicit self-development chat to coordinator**

For admitted self-development intent, call `reconcileOperationalSelf(..., autoAct:true, authoritySessionId:<attended session>)`; return the resulting objective/epoch/reflection in the same chat response. Do not create a second objective if the reflection correlation already exists.

- [ ] **Step 4: Preserve direct explicit capabilities**

Existing `/act self.evolve` remains supported and keeps its contained execution contract; `self.inspect`/`self.reflect` explicit capability calls remain deterministic tasks.

- [ ] **Step 5: Run focused tests**

Run: `node --test --test-isolation=none test/chat-intake.test.mjs test/chat-runtime.test.mjs test/self-state-coordinator.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/conversation-capability-planner.mjs src/chat-intake.mjs src/server.mjs test/chat-intake.test.mjs test/chat-runtime.test.mjs
git commit -m "feat(chat): make self-development evidence driven"
```

### Task 8: Cloud UI Self-State Surface

**Files:**
- Create: `cloud-app/app/api/self-state/route.ts`
- Create: `cloud-app/lib/self-model-surface.ts`
- Create: `cloud-app/components/cockpit/SelfModelPanel.tsx`
- Modify: `cloud-app/components/cockpit/CockpitView.tsx`
- Modify: `cloud-app/components/cockpit/CommandCockpit.tsx`
- Modify: `cloud-app/lib/capability-families.ts`
- Create: `cloud-app/test/self-model-surface.test.mjs`

**Interfaces:**
- Consumes: owner-gateway `self-state` response.
- Produces: `projectSelfModelSurface(value)` and a compact panel showing epoch, source SHA, capability counts, gaps, reflection disposition, active self-generated objective/PR evidence when present.
- [ ] **Step 1: Write fail-closed projection tests**

Assert malformed/missing digests render `unverified`; stale/unroutable capability records never render as available; unknown fields do not appear; valid payload renders source SHA, epoch, material delta, routable count, gap count, and reflection disposition.

- [ ] **Step 2: Implement same-origin API proxy**

`GET /api/self-state` calls `coreRequest("self-state")`, returns `503/self-state-unavailable` on transport failure, and sets `cache-control: no-store`.

- [ ] **Step 3: Implement projection and panel**

The panel is observational only: no mutation button, no implied consciousness language, and no authority claim. Display “Operational self-state” and use verified receipt links/IDs already present in the payload when available.

- [ ] **Step 4: Register capability family truth**

Add `self.inspect` and `self.reflect` to the Execution family beside `self.evolve`; capability family membership is display classification only and must not make a route routable.

- [ ] **Step 5: Run cloud-app tests**

Run: `node --test --test-isolation=none cloud-app/test/self-model-surface.test.mjs cloud-app/test/level-six-capabilities.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cloud-app/app/api/self-state/route.ts cloud-app/lib/self-model-surface.ts cloud-app/components/cockpit/SelfModelPanel.tsx cloud-app/components/cockpit/CockpitView.tsx cloud-app/components/cockpit/CommandCockpit.tsx cloud-app/lib/capability-families.ts cloud-app/test/self-model-surface.test.mjs
git commit -m "feat(ui): expose verified operational self state"
```

### Task 9: Closed-Loop Self-Improvement Acceptance and Release Baseline

**Files:**
- Create: `test/reflective-self-improvement-acceptance.test.mjs`
- Modify: `src/repair.mjs`
- Modify generated mirror under `state/release-baseline/` via baseline refresh.
- Modify: `docs/CLOUDFLARE-WORKERS-CUTOVER.md` only for verified implemented capability/state wording.

**Interfaces:**
- Consumes all prior tasks.
- Produces one synthetic end-to-end proof from self gap to next self epoch, while stubbing external mutation boundaries where live credentials are not part of the test.
- [ ] **Step 1: Write the end-to-end acceptance test**

Build a synthetic verified capability gap, run world/self compilation, reflection, objective admission, broker selection, a stubbed contained `self.evolve` publication receipt, memory/receipt update, and next self compilation. Assert one chain/objective identity, one candidate PR receipt, and that the next epoch either resolves the gap or truthfully leaves it open.

- [ ] **Step 2: Add authority and duplicate acceptance cases**

Assert an attempted governance/credential/billing expansion produces no objective; rerunning the identical gap/reflection creates no duplicate epoch/objective/PR identity; repeated failed improvement fingerprints produce hold.

- [ ] **Step 3: Add essential files to repair coverage**

Add the new canonical runtime modules to `ESSENTIAL_RELATIVE_PATHS` in `src/repair.mjs` so offline repair and release-baseline verification cover them.

- [ ] **Step 4: Refresh and verify the release baseline**

Run: `npm run baseline:refresh && npm run baseline:verify`
Expected: baseline regenerated with the new essential source/tests/config and verification succeeds.

- [ ] **Step 5: Run focused integrated verification**

Run: `node --test --test-isolation=none test/operational-self-model.test.mjs test/self-epoch-database.test.mjs test/self-reflection.test.mjs test/self-objective-admission.test.mjs test/self-worker.test.mjs test/self-state-coordinator.test.mjs test/chat-runtime.test.mjs test/reflective-self-improvement-acceptance.test.mjs`
Expected: all PASS, 0 failures.

- [ ] **Step 6: Run platform/type/cloud verification**

Run: `npm run typecheck && npm run typecheck:cloudflare && npm run typecheck:execution-broker && npm run test:cloudflare`
Expected: all commands exit 0.

- [ ] **Step 7: Run full repository verification**

Run: `npm run verify`
Expected: exit 0; any generated report-only drift is reviewed and reverted unless intentionally part of the feature.

- [ ] **Step 8: Commit acceptance/baseline changes**

```bash
git add src/repair.mjs state/release-baseline test/reflective-self-improvement-acceptance.test.mjs docs/CLOUDFLARE-WORKERS-CUTOVER.md
git commit -m "test(self): verify closed-loop reflective improvement"
```

- [ ] **Step 9: Push branch and open a PR only after exact-head local verification**

The PR body must distinguish implemented synthetic acceptance from live provider proof. Do not claim production self-improvement until exact-head GitHub CI, Cloudflare deployment, and a live receipt prove the deployed path.
