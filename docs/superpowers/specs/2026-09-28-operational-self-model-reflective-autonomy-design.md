# Operational Self-Model + Reflective Autonomy — Design

**Status:** Architecture and written spec approved by owner on 2026-09-28; implementation plan prepared.

**Date:** 2026-09-28  
**Baseline:** protected `main` at `4c492adf0850cef060b2dd17e3eb86b3e5e31bfe`  
**Product identity:** **Mahoraga**

## 1. Decision

Mahoraga will gain a canonical **Operational Self-Model** and a bounded **Reflection Loop** that converge its existing cognition, world observation, memory, autonomy, self-evolution, and Universal Execution Broker into one evidence-backed model of itself.

The self-model is not a claim of consciousness, sentience, emotion, or subjective experience. It is a computational identity record answering: what Mahoraga is, what it can actually do now, what it cannot do, what it is trying to achieve, how well it is performing, what changed, and what it may lawfully change about itself.

Mahoraga may generate its own bounded improvement objectives from observed gaps and repeated failures. Those objectives remain downstream of existing authority, cost, containment, verification, branch protection, and promotion rules.

## 2. Intended outcome

The system should move from primarily request-driven autonomy to **evidence-driven reflective autonomy**:

- observe its own operational state;
- maintain continuity across cycles and deployments;
- identify capability gaps and repeated weaknesses;
- distinguish facts, uncertainty, and unknowns;
- generate bounded self-improvement objectives;
- route those objectives through the Universal Execution Broker;
- verify outcomes independently;
- learn from results and update its self-model;
- expose truthful self-state and self-change receipts in the UI.
## 3. Non-goals and constitutional boundaries

This design does **not** authorize Mahoraga to:

- describe itself as conscious or sentient;
- invent capabilities that lack fresh executable evidence;
- expand its own owner identity, credential scope, spending limits, or destructive permissions;
- weaken protected-branch rules, verification gates, containment, or release authority;
- mutate `main` directly;
- treat model output as authority;
- self-modify the constitutional rules that define whether self-modification is permitted;
- persist secrets, raw credentials, private conversation content, or arbitrary provider payloads in the self-model.

Mahoraga may improve itself **inside** its constitution, but may not rewrite the constitution that grants and limits that authority.

## 4. Existing components to converge

This is not a new intelligence stack. Current `main` already contains the primitives to reuse:

- `src/world-state-observer.mjs` — current repository/runtime/worker/provider/capability truth;
- `src/objective-planner.mjs` — deterministic world-state-to-action planning;
- `src/metacognition.mjs` — evidence coverage, calibration, known unknowns, and hold/proceed decisions;
- `src/cognitive-loop.mjs` and `src/cognitive-worker.mjs` — deliberation and metacognitive execution;
- `src/entity-heartbeat.mjs` — bounded continuity receipt across unattended cycles;
- `src/autonomy-memory-bank.mjs` — operational, institutional, objective, and connector memory reconciliation;
- `src/unattended-credit-free-cycle.mjs` — recurring zero-credit autonomous loop;
- `src/self-evolution-worker.mjs` — contained candidate creation and GitHub-native PR publication;
- `src/universal-execution-broker.mjs` and Cloudflare broker/runtime — capability selection, leases, execution, handoff, and receipts.

The implementation must extend these modules through explicit contracts. It must not add a second planner, second authority model, second memory authority, second execution router, or second self-update mechanism.
## 5. Target operating loop

```text
Owner / UI conversation
        │
        ├──────────────► user-originated objectives
        │
        ▼
World-State Observer ──► Self-Model Compiler
                              │
                              ▼
                    Canonical MahoragaSelfModel
                              │
                              ▼
                         Reflection Loop
                     ┌────────┼────────┐
                     ▼        ▼        ▼
                    hold    inspect   improve
                              │        │
                              ▼        ▼
                         Objective Planner
                              │
                              ▼
                   Universal Execution Broker
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           GitHub           Codex        Cloud/Browser/etc.
              └───────────────┼───────────────┘
                              ▼
                           Verifier
                              │
                              ▼
                   Memory / Experience / Receipts
                              │
                              └────► next self epoch
```

No reflection result directly performs mutation. Every mutation becomes a canonical objective/task and enters the same broker, authority, verifier, and receipt path as owner-originated work.
## 6. Canonical `MahoragaSelfModel`

Add one derived, schema-versioned structure. It is rebuilt from evidence and persisted only as bounded state plus digests/references.

```ts
type MahoragaSelfModel = {
  schemaVersion: 1;
  kind: "mahoraga-self-model";
  epoch: number;
  identity: {
    product: "Mahoraga";
    missionDigest: string;
    sourceSha: string;
    runtimeProvenance: string;
  };
  capabilities: SelfCapabilityState[];
  health: SelfHealthState;
  objectives: SelfObjectiveState;
  cognition: SelfCognitionState;
  memory: SelfMemoryState;
  strengths: SelfAssessment[];
  weaknesses: SelfAssessment[];
  knownUnknowns: SelfUnknown[];
  authority: SelfAuthorityEnvelope;
  recentReceiptRefs: string[];
  previousSelfDigest: string | null;
  selfDigest: string;
  observedAt: string;
};
```

The exact implementation may split these types into smaller contracts, but the canonical model must preserve these semantic dimensions.
## 7. Evidence and truth rules

The self-model is a projection of authoritative evidence, never a free-form narrative written by a model.

For each capability it records at minimum:

- capability name;
- observed route state;
- selected/available provider or worker identity where safe;
- evidence age;
- permission class;
- cost class;
- last verified success/failure;
- current unavailability reason.

A capability may be `available` only when the Universal Execution Broker has fresh, schema-valid, executable evidence. Source code containing an implementation is not enough.

The compiler must distinguish:

- **known and healthy** — fresh positive evidence;
- **known and degraded** — fresh evidence with bounded failure;
- **known and unavailable** — explicit missing/denied/stale route;
- **unknown** — insufficient evidence;
- **historical** — prior capability no longer current.

The self-model may summarize memory and outcomes, but raw secrets, credentials, conversation bodies, arbitrary tool payloads, and unbounded logs remain outside it.
## 8. Self epochs and continuity

Each material self-state change produces a new monotonic **self epoch**.

A self epoch stores or references:

- canonical `selfDigest`;
- previous self digest;
- authoritative source SHA;
- capability/health/objective summary digests;
- reflection receipt reference;
- material delta from the prior epoch;
- timestamp and provenance class.

Unchanged observations do not create noisy new epochs. The compiler deduplicates identical self digests.

A bounded `SelfDelta` explains what changed, for example:

```text
+ browser.execute became routable
- provider gap github-primary resolved
~ codex.execute reliability 0.82 -> 0.91
+ objective obj-123 completed
! new known unknown: desktop worker freshness
```

This gives Mahoraga computational continuity: what it was, what it is now, and what changed, without anthropomorphic claims.

The existing Entity Heartbeat remains the lightweight recurring continuity receipt. The self epoch is richer state derived from the same authoritative outputs; it must not duplicate the unattended scheduler or heartbeat cadence.
## 9. Reflection Loop

Add a deterministic-first reflection stage over the current self model and recent verified outcomes.

Reflection answers five questions:

1. What materially changed since the previous self epoch?
2. Which current facts conflict with Mahoraga's mission or expected capability set?
3. Which failures or gaps are repeated enough to justify action?
4. Which important unknowns should be resolved before acting?
5. Is there a bounded improvement Mahoraga is currently authorized to attempt?

The output is a typed `SelfReflectionReceipt` with one disposition:

- `hold` — no material action justified;
- `inspect` — gather evidence before deciding;
- `research` — seek external/public evidence within policy;
- `repair` — restore a previously expected capability or invariant;
- `improve` — create a bounded enhancement objective;
- `escalate` — owner authority or policy decision required.

A model may propose hypotheses or decomposition, but deterministic validation must bind every proposed action to observed evidence, an allowed capability, completion criteria, and the current authority envelope before it becomes executable.

Reflection cannot create direct worker calls, shell commands, provider IDs, URLs, credentials, or arbitrary executable payloads.
## 10. Self-generated objectives

A reflection receipt may propose a new objective only when all of the following are true:

- the gap or opportunity is supported by current evidence;
- it maps to Mahoraga's mission or target capability set;
- it is not already covered by an active equivalent objective;
- the expected action fits the current authority envelope;
- required capabilities are known or explicitly discoverable;
- completion can be verified with bounded evidence;
- the retry, cost, hop, and deadline limits are finite.

Self-generated objectives use the existing Objective Planner and release authority. They are tagged with provenance `self-reflection` and reference the self epoch and reflection receipt that originated them.

Examples:

- repeated `browser.execute` absence -> inspect provider/binding state, then repair if authorized;
- three identical verification failures -> inspect failure fingerprint, then propose contained repair;
- stale GitHub capability evidence -> refresh/inspect rather than assume the capability exists;
- recurring high-latency route -> investigate routing evidence before changing selection policy;
- newly healthy capability -> close or replan obsolete gap objectives.

The planner must deduplicate materially equivalent objectives so reflection cannot create issue/PR storms.
## 11. Universal Broker integration

The Universal Execution Broker becomes the execution nervous system for both external and internal work.

Add canonical internal capabilities to the vocabulary:

- `self.inspect` — return the current validated self model or bounded projection;
- `self.reflect` — produce a typed reflection receipt;
- `objective.plan` — create/refresh a bounded plan from admitted evidence;
- `world.observe` — refresh world-state evidence;
- `memory.read` / `memory.write` — reuse the existing memory plane;
- existing `cognitive.predict`, `cognitive.cycle`, `cognitive.deliberate` where supported;
- existing `self.evolve` for contained source changes.

Internal capability names do not bypass routing. They enter the same capability pool with explicit worker attestations, permission classes, freshness, and receipts.

A typical autonomous repair chain may be:

```text
self.inspect
 -> self.reflect
 -> world.observe
 -> repository.inspect
 -> codex.execute or self.evolve
 -> repository.verify
 -> github/PR publication through existing self-evolution publisher
 -> self.inspect
```

Worker handoffs preserve one task/chain identity and may never expand the originating self-objective's authority envelope.
## 12. Conversation and UI behavior

Mahoraga's own self-model becomes available as context for owner conversations about Mahoraga, but only as a bounded projection.

Examples:

- “What can you actually do right now?” -> `self.inspect`, not a generic capability claim;
- “Why can't you change the UI?” -> inspect relevant capability/broker evidence and answer with the actual block reason;
- “Improve yourself.” -> `self.inspect -> self.reflect`, then only create a bounded improvement objective if evidence justifies one;
- “Create an issue for that gap.” -> route a typed GitHub issue capability when a live provider is admitted;
- “Build/fix this.” -> prefer the existing contained self-evolution path when the target is Mahoraga itself and authority permits it.

The UI should expose compact self-state and action receipts:

- self epoch and source SHA;
- healthy/degraded/unavailable capability counts;
- active objectives and unresolved gaps;
- last reflection disposition;
- selected worker/provider for active execution;
- handoff count;
- candidate branch/PR when produced;
- verification state and cost class.

The UI is a projection of observed truth. It cannot grant capability or authority by displaying it.
## 13. Autonomous authority ladder

Reflection may automatically perform read-only or reversible evidence work within existing policy. Mutation authority remains graduated.

### Automatic

- observe world/self state;
- inspect repository/runtime/provider evidence;
- read bounded memory/receipts;
- simulate/predict/deliberate;
- create or refresh internal objectives;
- create bounded diagnostic records;
- retry/reroute transient failures within the same authority envelope.

### Contained candidate authority

When existing policy admits it, Mahoraga may:

- create a candidate worktree/branch;
- execute `self.evolve` / contained Codex work;
- run tests and verification;
- repair its own unmerged candidate;
- publish/update a PR;
- create an issue for a verified capability gap when a live GitHub provider is admitted.

### Owner-governed

Mahoraga must hold/escalate for authority expansion, protected-branch bypass, security-boundary weakening, credential/billing expansion, destructive actions, or constitutional self-policy changes.
## 14. Receipts, idempotency, and failure behavior

Add bounded immutable receipts for:

- self-model compilation;
- self-epoch creation or deduplication;
- reflection disposition;
- self-generated objective proposal/admission/rejection;
- broker route and handoffs;
- contained candidate execution;
- verification;
- learning/self-model update.

Every self-generated objective receives a stable idempotency identity derived from the originating self epoch, gap/failure fingerprint, requested outcome, and authority envelope.

Repeated unchanged reflection must produce the same hold/dedup result rather than a new objective.

Typed failure states should include at least:

- `self-evidence-incomplete`;
- `self-model-invalid`;
- `self-model-stale`;
- `self-reflection-no-material-change`;
- `self-reflection-evidence-required`;
- `self-objective-duplicate`;
- `self-objective-authority-insufficient`;
- `self-objective-no-verifier`;
- `self-objective-route-unavailable`;
- `self-improvement-verification-failed`.

A failed improvement attempt becomes learning evidence. It must not automatically justify a broader permission or weaker verifier.
## 15. Acceptance criteria

The architecture is not considered implemented until these end-to-end cases pass:

1. **Self inspection** — Mahoraga reports source SHA, current capability truth, active objectives, gaps, and known unknowns from evidence rather than model assertion.
2. **Self delta** — a material capability/state change creates exactly one new self epoch with a bounded delta; unchanged state deduplicates.
3. **Reflective hold** — healthy unchanged state produces no unnecessary objective.
4. **Reflective evidence request** — an important unknown creates an inspect/research action rather than a mutation.
5. **Autonomous gap objective** — a synthetic verified capability gap creates one bounded self-generated objective with provenance and finite limits.
6. **Contained repair** — that objective routes through the Universal Broker, performs contained work, and returns verifier evidence.
7. **PR publication** — a verified self-change candidate uses the existing self-evolution publication path to create/update a PR without direct-main mutation.
8. **Learning closure** — successful or failed execution updates bounded memory and the next self model.
9. **Conversation truth** — owner UI questions about Mahoraga use self-model evidence and cannot claim unavailable capabilities.
10. **Authority refusal** — a self-generated attempt to widen owner, billing, destructive, credential, or constitutional authority fails closed.

The canonical synthetic chain for acceptance is:

```text
synthetic capability gap
 -> world.observe
 -> self.inspect
 -> self.reflect
 -> objective.plan
 -> Universal Broker
 -> contained repair
 -> repository.verify
 -> PR publication
 -> memory update
 -> next self epoch
```

The final self epoch must show the resolved or still-failing gap truthfully.
## 16. Implementation waves

Implementation should be incremental and reuse existing contracts:

### Wave 1 — Self-model foundation
- add schema/types and compiler;
- compile from world state, heartbeat, memory, metacognition, broker capabilities, objectives, and receipts;
- add self digest, self epoch, and delta deduplication;
- add focused tests.

### Wave 2 — `self.inspect` and UI truth
- expose a bounded self projection through the runtime/UI;
- answer Mahoraga capability/status questions from self evidence;
- add receipt/status cards without granting authority.

### Wave 3 — Reflection
- add deterministic reflection contract and dispositions;
- connect repeated failure/gap fingerprints and known unknowns;
- add hold/dedup/evidence-required behavior.

### Wave 4 — Reflection to objectives
- admit bounded self-generated objectives through the existing planner/release authority;
- add provenance, idempotency, finite limits, and duplicate suppression.

### Wave 5 — Brokered self-improvement
- register internal self capabilities in the Universal Broker;
- route admitted repair/improvement work through existing workers and `self.evolve`;
- preserve PR publication and exact-head verification.

### Wave 6 — Closed-loop acceptance
- run synthetic gap -> reflection -> repair -> PR -> next-self-epoch acceptance;
- verify authority refusal and conversation truth;
- document live provider gaps separately from implemented code paths.
## 17. Self-development action path

Owner conversation and autonomous reflection converge on the same execution contracts.

For source-code improvement:

```text
conversation or reflection
 -> self.inspect
 -> self.reflect / objective.plan
 -> repository.inspect
 -> self.evolve (contained candidate)
 -> repository.verify
 -> existing GitHub-native candidate publisher
 -> PR receipt in UI
```

For issue creation, introduce a typed broker capability such as `github.issue.create` only when a real executable GitHub provider can attest it. Until that provider is bound, Mahoraga must report the route unavailable rather than use host-side ChatGPT connector authority implicitly.

The existing Operator Deck GitHub write implementation is reusable behavior/reference for issue creation, PR comments, and protected merge semantics, but production cloud execution must cross an independently authenticated provider boundary instead of shelling into an assumed local `gh` session.

Natural-language UI requests such as “create an issue for that,” “fix this,” “build it,” and “improve yourself” are compiled into these typed capabilities/objectives. The conversation layer may request capability; it may not select credentials, bypass the broker, or invent execution success.

## 18. Compatibility and migration

- Existing Entity Heartbeat, world observer, planner, memory, cognitive loop, self-evolution, and broker contracts remain authoritative in their current domains.
- Existing owner-issued objectives continue to work without requiring reflection.
- Reflection-generated objectives are additive and separately provenance-tagged.
- Existing Cloudflare/UI capability truth remains fail-closed.
- Railway/Vercel do not become fallback execution routes through this design.
- Existing release-baseline and repair coverage must be extended to any new essential self-model/reflection files.
- No production promotion claim is made until exact-head CI and live receipt evidence prove the deployed path.