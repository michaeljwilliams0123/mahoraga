# Cloudflare Cognitive Control Fabric — Design

**Status:** Architecture direction approved in conversation; written spec pending owner review before implementation.

**Date:** 2026-09-15
**Baseline:** protected `main` at `5cc4eac97883f592f22e8939ed8fe57cefd11fdd`
**Product identity:** **Mahoraga**

## 1. Decision

Mahoraga adopts a **hybrid-primary control architecture**:

- **Cloudflare** becomes the primary always-on cognitive/control fabric.
- **Railway** remains the canonical cloud execution core until a separately verified migration supersedes it.
- **Windows/local devices** remain trusted execution planes for local, desktop, browser, repository, and device-specific capabilities.
- **GitHub `main`** remains canonical source authority.
- **Plugins, models, Copilot, Codex, MCP servers, and future providers** remain replaceable capability routes.

This design makes the self-improvement loop the operating center of Mahoraga rather than a side subsystem.

Cloudflare may coordinate, observe, schedule, queue, and persist resumable mission state, but it does **not** become Mahoraga's constitutional identity, owner authority, or sole canonical memory store.
## 2. Live baseline facts

The implementation must start from observed current state rather than architectural memory:

- GitHub `main`, the local verified checkout, and canonical Railway production are all at `5cc4eac97883f592f22e8939ed8fe57cefd11fdd`.
- Railway production is healthy at that exact SHA.
- PR `#543` is the only open implementation PR observed during design and must remain an independent lane.
- Cloudflare Wrangler OAuth is authenticated on `SD009WC7` with Worker, Durable Object, Queues, AI, Browser, secrets-store, and related write scopes.
- The Cloudflare MCP set is configured and OAuth-authenticated for Codex/Copilot where required.
- `mahoraga-relay` already exists on Cloudflare and has recent deployments.
- `mahoraga-owner-gateway` source exists in the repository but no Worker with that name currently exists in the authenticated Cloudflare account.
- `SD009WC7` is online and remains the repository's gold-standard reference execution plane.
- Termius is available as an operator console; PowerShell/Remote Desktop Commander provide the machine-execution path.

A diagnostic Wrangler cache temporarily caused two GitHub-audit tests to fail. Removing the untracked `.wrangler` caches restored the focused GitHub-audit tests, proving the failure was local diagnostic residue rather than source regression.

## 3. Existing Mahoraga components to reuse

This is a convergence project, not a greenfield rewrite.
Current `main` already contains most of the required primitives:

- `src/world-state-observer.mjs` — read-only repository/runtime/worker/provider/capability observation.
- `src/objective-planner.mjs` — deterministic world-state-to-action planning.
- `src/router.mjs` — capability, authority, billing, zero-credit, and alternate-route selection.
- `src/capability-recovery.mjs` — bounded recovery planning for transient route failures.
- `src/objective-release-authority.mjs` — objective-to-task release with leases and task policy.
- `src/evolution-laboratory.mjs` — isolated baseline/candidate evaluation and cognitive regression gates.
- `src/evolution-controller.mjs` — candidate build, verify, deploy, canary, activate, and rollback lifecycle.
- `src/self-evolution-worker.mjs` — contained candidate production and GitHub-native publication.
- `src/twin-event-journal.mjs` — durable idempotent event journaling and reconciliation semantics.
- `relay/cloudflare-worker.mjs` — owner-bound Cloudflare Durable Object relay with persisted broker state.
- `deploy/cloudflare-owner-gateway/worker.mjs` — owner-authenticated host-neutral gateway with signed owner assertions.
- Universal Capability Fabric, canonical `AuthorityDecision`, zero-credit admission, release-baseline mirrors, autonomous integration, and sovereign evolution already exist.

The new work must extend these modules through explicit contracts. It must not create a second planner, second authority model, second capability graph, or independent self-update mechanism.

## 4. Target operating loop

```text
                                 MAHORAGA
                                    │
                         Objective / Mission Layer
                                    │
                           World-State Observer
                                    │
                             Objective Planner
                                    │
                        Capability / Cost Router
                                    │
             ┌──────────────────────┼──────────────────────┐
             ↓                      ↓                      ↓
        Local Workers          Cloud Workers          Human / AI
     Windows / browser /      Cloudflare / Railway    plugins / owner /
     repository / local AI    GitHub automation       Copilot / Codex
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    ↓
                           Execution Journal
                                    ↓
                          Independent Verifier
                                    ↓
                             Experience Bank
                                    ↓
                            Skill Synthesizer
                                    ↓
                             Evolution Engine
                                    │
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
              Shadow Candidate               Existing Baseline
                    │                               │
                    └───────────────┬───────────────┘
                                    ↓
                           Differential Evals
                                    ↓
                          Promotion Authority
                         ↙                    ↘
                     Reject                 Accept
                       │                      │
                  retain lesson         PR → CI → release
                                              │
                                           rollback
```

Every layer must be observable through typed receipts, and every mutation-capable transition must remain downstream of current authority, cost, provenance, and verification policy.
## 5. Cloudflare role: always-on nervous system

Cloudflare is promoted aggressively, but only inside the owner-sovereign boundary.

### 5.1 Owner gateway

Deploy the existing `mahoraga-owner-gateway` as the primary authenticated external ingress.

Its responsibilities remain narrow:

- require Cloudflare Access authenticated owner identity;
- mint a short-lived signed Mahoraga owner assertion;
- proxy only to the configured HTTPS canonical runtime origin;
- strip caller-supplied Mahoraga owner assertion headers;
- fail closed on malformed, credential-bearing, self-loop, or non-HTTPS origins;
- expose no raw local `4782/4783` listener.

The gateway is transport and identity projection, not an authorization engine. The canonical runtime still creates the final `AuthorityDecision`.

### 5.2 Objective coordinator Durable Object

Add one Durable Object instance per objective ID. It stores only bounded coordination state needed to resume a mission across worker or device outages:

- objective ID and immutable lineage digest;
- current planning epoch;
- active step and dependency state;
- route-attempt summaries;
- wait/retry timers;
- external event cursors;
- last reconciled canonical receipt digest.
This Cloudflare state is a **resumable coordination mirror**, not constitutional memory. If the Durable Object is lost or Cloudflare is removed, Mahoraga must be able to reconstruct mission status from canonical objective/task/event receipts and source/runtime truth.

### 5.3 Mission Workflow

Use Cloudflare Workflows for long-running orchestration that should survive process restarts and device outages.

A workflow instance is keyed to one Mahoraga objective and performs durable steps such as:

1. reconcile current world state;
2. request or refresh canonical planning output;
3. dispatch one bounded capability action;
4. wait for route result or authentication event;
5. verify the result;
6. persist a bounded receipt reference;
7. reroute or replan if the world changed;
8. finish only when the canonical completion contract is satisfied.

Workflow step returns hold resumable state across engine lifetimes. Non-idempotent effects require an external idempotency check before a retried `step.do` operation.

### 5.4 Queue-backed dispatch

Use Cloudflare Queues for asynchronous work dispatch, backpressure, retry, and worker decoupling where a direct request/response path is not required.

Queue messages contain capability envelopes and opaque references only. They must not contain credentials, arbitrary executable commands, or unrestricted private content.

A queue consumer may select an authorized route, but it cannot widen the capability, owner grant, cost ceiling, target, or data class encoded by the canonical task policy.
### 5.5 Continuous world-state observation

Cloudflare schedules and/or Durable Object alarms become the always-on wake mechanism for cloud-observable state.

The observer must gather deterministic evidence from:

- GitHub main/PR/check state;
- Railway deployment SHA, status, readiness, and service identity;
- Cloudflare Worker/Workflow/Queue health;
- Mahoraga provider readiness and quota evidence;
- connected-device presence and freshness;
- objective/task lease state;
- route failure and quarantine state;
- pending authentication or attended-session waits;
- outstanding evolution candidates and verification state.

The observer emits a bounded `WorldStateDigest`. It does not itself mutate external systems.

Material state changes wake the planner. Repeated unchanged observations are deduplicated to avoid cost and noise.

### 5.6 Cloudflare observability

Cloudflare observability is supplemental evidence for route health, workflow failure, queue backlog, latency, and execution timing.

It never substitutes for Mahoraga's source, deployment, runtime, provider, authority, or verification truth domains. A green Cloudflare dashboard cannot prove a Mahoraga objective succeeded.
## 6. World-State Observer v2

Extend the existing observer rather than replacing it.

The v2 digest should add provider-neutral evidence for:

- source SHA and branch-protection truth;
- deployment provider and exact deployed SHA;
- runtime liveness/readiness and provenance age;
- per-capability route health and evidence age;
- provider quota/exhaustion state;
- device online/offline/last-seen state;
- queue/workflow backlog and last progress time;
- objective staleness, blocked dependency, and lease expiry;
- recent verified route outcomes;
- candidate/baseline evaluation state.

Observation sources remain read-only. Each field includes an evidence timestamp and source class so the planner can distinguish stale facts from current facts.

A digest is content-minimized. Raw credentials, chat contents, browser state, private files, and arbitrary provider payloads stay outside observer state.

## 7. Objective Planner v2

The current planner reacts to worker health, lease expiry, repository verification, failed tasks/objectives, and provider errors. v2 generalizes that into durable mission planning.

The planner remains deterministic and model-optional. It may use a reasoning provider to propose decomposition, but executable plan nodes are admitted only after deterministic schema, authority, cost, and dependency validation.
Planner output becomes an objective DAG whose nodes include:

- stable local task ID;
- canonical capability;
- dependencies;
- completion criteria;
- required verification evidence;
- authority/data/cost constraints;
- retry/reroute policy;
- maximum attempts and deadline;
- idempotency identity;
- optional attended-authentication requirement.

A world-state change may replan unfinished nodes while preserving completed evidence and the original objective ID.

The planner must explicitly distinguish:

- `continue` — current route remains valid;
- `reroute` — same capability, different authorized executor;
- `replan` — world change invalidates remaining task structure;
- `hold` — temporary authority/authentication/evidence boundary;
- `deny` — policy prohibits execution;
- `fail` — all compatible lawful routes have produced concrete empirical failure.

## 8. Capability / cost router v2

The current router remains canonical. Its route scoring gains stronger live-state feedback rather than a provider-specific fallback chain.
For each compatible candidate, routing considers in order:

1. canonical authority decision;
2. data-class compatibility;
3. health and evidence freshness;
4. capability fitness;
5. zero-cost / spending policy;
6. quota availability;
7. recent verified reliability;
8. latency and workload;
9. attendance/authentication requirement;
10. idempotency and recovery quality.

Provider exhaustion, offline state, quota depletion, stale canaries, and provider-specific failures are **routing events**, not objective failures.

The #547 acceptance rule becomes a permanent invariant:

> An objective may report blocked only after every authorized compatible route is unavailable, denied, exhausted, or has produced a route-specific empirical failure.

Rerouting preserves objective ID, authority decision lineage, evidence requirements, cost ceiling, rollback data, authentication boundary, and idempotency identity.

Every attempt records route ID, reason code, evidence freshness, successor route, verification result, and final disposition.

No automatic metered fallback is introduced.
## 9. Execution journal

The execution journal is the evidence spine connecting planning, routing, verification, and evolution.

Reuse the current durable task/event/result database and receipt contracts. Add normalized route-attempt and verification events rather than creating an unrelated Cloudflare-only journal.

Cloudflare may mirror bounded digests required for resumability, but canonical execution evidence remains reconstructable from Mahoraga-controlled state.

Required route-attempt fields include:

- objective/task/correlation IDs;
- capability;
- worker/provider route ID;
- route fingerprint;
- authority decision digest;
- cost-policy digest;
- attempt number;
- start/end timestamps;
- bounded outcome/reason code;
- verification receipt reference;
- source/deployment/runtime provenance reference where relevant.

The journal never stores raw secrets or unconstrained model/browser payloads.

## 10. Independent verifier

The creator of a candidate or route result cannot be its sole verifier.
Verification order is:

1. deterministic contract and schema checks;
2. capability-specific postconditions;
3. exact-head repository/CI evidence when source changed;
4. runtime/deployment provenance where activation is claimed;
5. independent evaluator or heterogeneous comparison for cognitive/evolution claims;
6. owner/human confirmation only where policy explicitly requires it.

The verifier must actively test for:

- false-success receipts;
- stale or mismatched SHA evidence;
- hidden cost escalation;
- widened authority;
- weakened authentication;
- private-memory leakage;
- regression in unrelated protected capabilities;
- overfitting to the candidate's own tests;
- inability to survive provider removal;
- broken rollback.

A candidate-specific failure becomes evidence for learning; it is never rewritten as success.

## 11. Experience Bank

Verified execution experience becomes persistent but bounded institutional knowledge.

Reuse the existing institutional-memory, feat-ledger, trusted-state, and evolution receipt machinery where schemas already fit. Introduce a new schema only for information those contracts cannot represent.
Each reusable experience record should contain:

- problem/capability fingerprint;
- route/context fingerprint;
- verified outcome;
- failure class when applicable;
- repair or successor route that worked;
- evidence provenance;
- confidence and freshness;
- privacy/data-class classification;
- supersession status;
- zero-credit/cost observation.

Negative experience is first-class. A failed route, rejected candidate, or incorrect majority opinion may be more useful than a success when it prevents repeat failure.

Experience changes future ranking and skill proposals but never overrides current authority or provider truth.

## 12. Skill Synthesizer

Add a bounded synthesizer that turns repeated verified experience into candidate procedural knowledge.

It may propose:

- reusable skill instructions;
- deterministic recovery rules;
- route-scoring adjustments;
- new evaluator cases;
- provider-adapter candidates;
- planner decomposition templates;
- guardrails derived from repeated failures.

Synthesis output is always a **candidate artifact**. It does not modify the incumbent skill/runtime state in place.
## 13. Evolution Engine v2

Converge the existing evolution laboratory, evolution controller, self-evolution worker, sovereign evolution, and autonomous integration into one incumbent-governed pipeline.

The pipeline is:

```text
verified repeated experience
  -> hypothesis
  -> isolated candidate
  -> candidate worktree / artifact
  -> focused tests
  -> baseline-vs-candidate evaluation
  -> adversarial / held-out verification
  -> promotion evidence bundle
  -> incumbent Promotion Authority
  -> reject | hold | PR/CI/release
```

The incumbent's rules judge the candidate. Candidate-modified policy cannot approve the same candidate.

Candidates may change prompts, skills, route policy, adapters, planner heuristics, or code only inside their declared mutation envelope.

Core/protected changes continue through sovereign-evolution evidence. Ordinary changes use the existing autonomous-integration lane.

## 14. Differential evaluation

`evolution-laboratory.mjs` currently supports scalar baseline/candidate metrics plus cognitive regression gates. v2 expands this into a typed scorecard without replacing the existing schema abruptly.
Candidate comparison dimensions should include where applicable:

- functional correctness;
- exact-head verification;
- completion rate;
- reliability under route/provider loss;
- latency;
- model-credit and marginal-dollar cost;
- authority preservation;
- authentication preservation;
- data/privacy boundary preservation;
- rollback success;
- cognitive diversity and dissent retention;
- calibration and known-unknown behavior;
- cross-domain transfer;
- regression count.

Promotion requires no protected-dimension regression and at least one objective-specific improvement. Self-generated metrics can support diagnosis but cannot be the sole promotion evidence.

Held-out tests are evaluator-owned and unavailable for candidate modification.

## 15. Promotion Authority

Promotion remains a separate incumbent-governed decision layer.

A candidate can be automatically integrated only when the exact same candidate SHA has the required verification, independent-validation, rollback, cost, authority, and provenance evidence required by current repository policy.

Reject stores the lesson and discards active candidate state. Hold preserves the candidate without activating it. Accept may create or advance a PR, exact-head CI, immutable artifact, canary, and release path.
## 16. Execution planes

Mahoraga plans capabilities, not providers. The principal execution planes are:

### Cloudflare-native

Best for durable orchestration, always-on observation, queues, relay/session coordination, edge ingress, and provider-neutral control logic.

### Railway

Remains the canonical cloud application/runtime execution core and exact-SHA deployment boundary during this phase.

### Windows/local

`SD009WC7` remains the reference plane for repository work, deterministic verification, attended desktop control, browser/application actions, local models, and capabilities requiring local device context.

Remote Desktop Commander is the agent execution bridge. PowerShell is a deterministic local shell executor. Termius is a human/operator terminal and SSH console, not a new authority system or mandatory runtime dependency.

### GitHub / CI

GitHub remains source authority and exact-head integration evidence. GitHub Actions and Copilot may execute bounded work but cannot redefine acceptance policy.

### Plugins / MCP / AI providers

Plugins and MCP servers expose replaceable capabilities. Model providers supply reasoning/generation and never become execution authority by themselves.
## 17. Canonical contracts

The first implementation increment should define or extend four contracts.

### `WorldStateDigest`

A content-minimized, timestamped observation envelope containing source, deployment, runtime, provider, worker, route-health, and objective-state evidence.

### `RouteAttemptReceipt`

One immutable record per execution attempt, preserving route identity, reason codes, evidence freshness, idempotency lineage, and successor-route information.

### `ExperienceRecord`

A verified success/failure lesson suitable for route memory, skill synthesis, and evaluator generation without retaining unnecessary private content.

### `EvolutionScorecard`

A baseline/candidate comparison bound to exact candidate identity and independent evidence.

All four contracts use strict schemas, bounded fields, deterministic serialization, and content digests. Unknown fields fail closed where they can affect authority or promotion.

## 18. Security and sovereignty invariants

Aggressive autonomy is permitted below the release/security boundary. It does not imply unrestricted execution.
Required invariants:

- one owner root and one canonical `AuthorityDecision` model;
- no provider can expand its own authority;
- no automatic paid fallback;
- no credential material in Git, prompts, journals, or diagnostics;
- no raw public exposure of local `4782/4783`;
- no generic caller-selected executable path or unrestricted supervisor shell;
- non-idempotent side effects remain target-bound and replay-safe;
- Cloudflare coordination state is reconstructable and therefore non-constitutional;
- GitHub source truth, deployment truth, runtime truth, provider readiness, execution authority, and verification truth remain separate;
- candidate rules cannot approve the candidate that introduced them;
- owner stop/revoke/recovery survives every promotion;
- at least one known-good rollback generation remains viable.

Cloudflare secrets use platform secret storage and are referenced by name only. Secret creation/rotation is a security-boundary action and follows existing owner/platform authorization.

## 19. Failure semantics

Failure handling is capability-level and empirical:

- `provider-unavailable` / `quota-exhausted` / `device-offline` → refresh evidence and reroute;
- `authentication-required` → durable hold, preserve objective, resume after verified auth;
- `authority-denied` → deny, never route around the boundary;
- `verification-failed` → retain evidence, reject result/candidate, diagnose;
- `deployment-provenance-mismatch` → hold activation and reconcile exact SHA;
- `non-idempotent-uncertain` → verify external state before retry;
- `cloudflare-unavailable` → continue through canonical runtime/local routes where possible;
- `all-routes-exhausted` → return a concrete blocked/failure receipt with attempted-route evidence.
## 20. First deployable vertical

The first implementation tranche should prove one end-to-end always-on loop without attempting the entire architecture at once.

### F0 — Cloudflare control ingress

- deploy the existing `mahoraga-owner-gateway` Worker;
- configure owner identity, canonical Railway origin, and HMAC assertion secret through Cloudflare secrets/vars;
- verify authenticated owner request, forged-header stripping, malformed-origin rejection, and canonical-runtime forwarding;
- keep current `mahoraga-relay` behavior unchanged except for required integration wiring;
- keep Wrangler cache/log artifacts outside the repository working tree.

### F1 — Objective coordinator + Workflow skeleton

- add objective-scoped Durable Object coordination;
- add one Workflow instance per objective;
- support observe → plan → dispatch → wait → verify → continue;
- persist only bounded resumability state in Cloudflare;
- reconcile every state transition against canonical Mahoraga receipts.

### F2 — Continuous observer

- schedule cloud-observable probes;
- emit deduplicated `WorldStateDigest` events;
- wake active objectives only on meaningful change or required cadence;
- preserve zero-model-credit observation where deterministic APIs suffice.
### F3 — Capability failover acceptance

Implement #547 as the first real proof of the new loop:

- make the preferred executor quota-exhausted;
- make a second compatible route unavailable;
- leave one different authorized zero-cost route available;
- require Mahoraga to preserve the same objective lineage and finish through the remaining route;
- persist every attempted route and reason code;
- run the minority-rescue comparison with heterogeneous execution where practical.

### F4 — Experience and skill synthesis

- convert the verified failover trajectory into an `ExperienceRecord`;
- demonstrate retrieval of that experience on a later equivalent failure;
- generate a bounded skill/recovery candidate from repeated verified evidence;
- verify that the candidate cannot activate itself.

### F5 — Differential evolution and promotion

- create an isolated route/planner candidate;
- compare it against the incumbent on held-out failover/evidence cases;
- reject on protected-dimension regression;
- publish only a graduation-ready candidate through the existing GitHub/evolution pipeline;
- prove rollback and incumbent-governed promotion.

Each increment is independently releasable and reversible.
## 21. Testing strategy

Every behavior change uses focused RED/GREEN tests before full verification.

Required deterministic tests include:

- owner gateway requires authenticated owner identity;
- forged Mahoraga owner headers are stripped and replaced only after validation;
- objective coordinator cannot alter owner grant/cost/data-class fields;
- Workflow retries preserve idempotency identity;
- queue redelivery cannot duplicate a non-idempotent action;
- world-state digests reject stale/malformed authority-affecting evidence;
- quota exhaustion reroutes the same objective when a compatible route remains;
- offline local device does not terminate cloud-capable objective work;
- Cloudflare loss does not erase canonical Mahoraga objective state;
- route recovery cannot route around authority denial;
- experience promotion requires verified provenance;
- synthesized skill remains candidate-only until independent verification;
- candidate-modified policy cannot approve the candidate;
- differential evaluator rejects protected regressions;
- accepted candidate remains rollback-capable;
- no test requires paid model fallback;
- source/deployment/runtime truth remain independently asserted.

Required live acceptance includes Cloudflare owner ingress, canonical Railway exact-SHA forwarding, one real provider failover, persisted result evidence, and returned owner-visible completion.

The full repository `npm run verify` remains required before protected integration, plus exact-head Ubuntu and Windows GitHub Verify jobs.
## 22. Rollout and rollback

Rollout is additive and capability-scoped.

- Cloudflare control features begin dark or observational where possible.
- Railway remains canonical runtime throughout F0-F5 unless a later migration spec explicitly changes that boundary.
- Existing direct runtime paths remain available as rollback while Cloudflare coordination proves stable.
- Cloudflare route failures automatically degrade to existing lawful routes; they do not trigger source rewrites.
- Every schema change supports reading the previous active format until migration evidence is complete.
- Cloudflare resources created for the tranche are named and tagged so they can be disabled or removed independently.

Rollback order is capability-level first, Cloudflare control-plane rollback second, source rollback last.

## 23. Interaction with current PR #543

PR #543 owns cockpit/readiness/single-brain UI convergence. This design must not duplicate or rewrite that UI scope.

Implementation derived from this spec should rebase on the then-current `main` after #543 resolves, preserve its single-brain semantics, and surface new Cloudflare/control state only through existing bounded diagnostic surfaces when needed.

No implementation PR should bundle #543's existing UI changes merely to show progress.

## 24. Navin / external architecture boundary

Navin and the RSI material are architectural/research inputs only.

Mahoraga may independently implement patterns such as persistent memory, skill synthesis, shadow candidates, differential evaluation, and rollback, but no Navin AGPL source code is copied into Mahoraga unless the owner separately accepts the licensing consequences or obtains an appropriate license.
## 25. Acceptance criteria

This architecture is proven when all of the following are true:

1. Cloudflare can keep an objective alive while the owner's PC is offline when remaining work is cloud-capable.
2. Returning local devices can resume queued local capabilities without creating a new objective.
3. Provider quota exhaustion triggers transparent capability-level rerouting under the same authority/cost/idempotency lineage.
4. Cloudflare Workflows can pause for authentication or external evidence and resume without reconstructing the mission from prompts.
5. The observer continuously distinguishes source, deployment, runtime, provider, authority, and verification truth.
6. Every execution attempt produces a bounded receipt and every success requires capability-specific verification.
7. Verified failure experience changes later routing or synthesis without overriding current authorization.
8. Mahoraga can synthesize an isolated improvement candidate from experience.
9. The candidate is evaluated against an incumbent baseline on held-out evidence.
10. A regression is rejected and retained as a lesson.
11. A superior candidate can enter the existing PR/CI/canary/promotion path without self-approval.
12. Rollback restores a known-good generation.
13. Removing Cloudflare does not destroy Mahoraga identity, source authority, canonical objective history, or owner sovereignty.
14. No automatic paid fallback or hidden credential persistence is introduced.

## 26. Definition of done

The implementation program is complete when Mahoraga behaves as a continuously operating, provider-flexible system that observes reality, plans durable objectives, chooses among heterogeneous executors, verifies results independently, learns from verified experience, creates isolated improvements, empirically compares them to the incumbent, and promotes only evidence-backed candidates through existing owner-sovereign release controls.
## 27. Implementation decomposition

This document is the program-level architecture. It is intentionally larger than one implementation PR.

After owner review, implementation is decomposed into independently planned tranches:

1. **CF-1: Cloudflare control ingress and deployment hygiene** — F0 only.
2. **CF-2: Objective coordination and durable Workflow skeleton** — F1.
3. **CF-3: Continuous observer and state-change wakeups** — F2.
4. **CF-4: Capability-level failover and #547 acceptance** — F3.
5. **CF-5: Experience Bank and Skill Synthesizer convergence** — F4.
6. **CF-6: Differential evolution and promotion integration** — F5.

Each tranche receives its own implementation plan, focused RED/GREEN tests, exact-head verification, PR, deployment proof where applicable, and rollback boundary.

No later tranche is allowed to bypass an earlier tranche's failed acceptance evidence. Independent work may proceed in parallel only when paths, state migrations, and authority contracts do not overlap.
