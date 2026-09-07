# Mahoraga Level 8 Entity Runtime Design

## Status

Approved architecture for production implementation beginning 2026-09-07.

## Goal

Evolve Mahoraga from a powerful autonomous execution and self-improvement system into a persistent Entity Runtime that can maintain a mission, model the owner's workforce responsibilities, originate and prioritize work, coordinate internal and external capabilities, learn from outcomes, and continue operating when frontier-model credits are unavailable.

Level 8 is an internal Mahoraga capability target, not an industry-standard AI level.

## Core principle

Mahoraga is not a fixed assistant persona, a single workforce proxy, or a single operator mode. It is one persistent entity with an extensible capability lattice. Chief-of-staff, analyst, researcher, developer, project manager, operator, drafter, coordinator, administrator, reviewer, archivist, scheduler, teacher, and future roles are contextual facets of the same entity.

The system must be capable of combining those facets per objective instead of forcing the entire runtime into one global mode.

## Mission continuity

The Entity Runtime maintains a durable mission across conversations, tasks, workers, providers, and restarts. Direct owner requests remain authoritative inputs, but the entity may also derive work from standing responsibilities, deadlines, observed state changes, unresolved commitments, detected risk, improvement opportunities, system degradation, research findings, and capability gaps.

The runtime should be able to answer continuously:

1. What changed?
2. What matters now?
3. What responsibilities are affected?
4. What work should exist even if no one explicitly requested it?
5. Which capabilities or internal functions should perform that work?
6. What evidence shows the work succeeded?
7. What should the entity learn or improve because of the outcome?

## Entity plane

The Level 8 Entity Plane sits above the existing universal evolution, autonomy, worker, provider, repository, and Internet-evidence mechanisms.

Conceptual flow:

Owner Constitution
→ Workforce Twin
→ World State
→ Capability Lattice
→ Objective Economy
→ Organizational Agent Graph
→ Universal Learning / Evolution Loop
→ Internet Evidence + Connected Platforms
→ Execution / Communication / Artifact Production
→ Verification / Receipts
→ Institutional Memory
→ updated Entity State

Existing runtime components remain authoritative where they already own execution, durable tasks, capabilities, repository integration, browser isolation, artifacts, receipts, and exact-head verification. Level 8 composes them; it does not create a parallel control plane.

## Wave 1 — Entity Constitution

Create a durable constitution describing the entity's identity, owner relationship, mission, operating principles, authority dimensions, and mission invariants.

The constitution is structured data, not a free-form system prompt. It should support versioning, validation, canonical hashing, deterministic serialization, and future migration.

Initial fields:

- schemaVersion
- entityId
- displayName
- ownerId
- mission
- principles
- successCriteria
- defaultAuthorityProfile
- createdAt
- updatedAt

The constitution defines what the entity is trying to accomplish, not a complete list of everything it may ever do.

## Wave 2 — Workforce Twin

Create a durable model of the owner's workforce role without limiting Mahoraga to a single job title.

The twin stores:

- responsibilities
- obligations
- recurring obligations
- stakeholders
- work products
- systems
- decision patterns
- success states
- risk indicators
- opportunity indicators
- escalation preferences

Each responsibility and obligation receives a stable identifier. The model must permit multiple simultaneous roles, projects, employers, side projects, or organizational contexts.

The twin is not allowed to silently overwrite owner-provided facts. Learned or inferred attributes must remain distinguishable from explicit owner assertions.

## Wave 3 — Capability Lattice

Replace global assistant-mode thinking with independent capability dimensions.

Initial dimensions:

- initiative: reactive | anticipatory | self-originated
- authority: observe | prepare | act | coordinate | administer
- horizon: immediate | daily | project | strategic | persistent
- representation: assistant | delegate | proxy | operator | organizational-function
- learning: remember | generalize | experiment | teach | evolve
- coordination: solo | child-agents | platform-agents | multi-system
- environment: local | repository | work-systems | public-internet | external-connectors
- reasoning: deterministic | local-model | subscription-model | external-model
- persistence: turn | task | project | role | institutional
- autonomy: user-directed | objective-directed | mission-directed

A task or objective receives a bounded profile across these dimensions. The profile may vary per objective.

## Wave 4 — Objective Economy

Extend the current objective planner into a persistent objective economy.

Candidate objectives may originate from:

- direct owner commands
- workforce obligations
- deadlines and calendar-derived events
- world-state deltas
- unresolved prior work
- failures and incidents
- capability gaps
- research discoveries
- improvement opportunities
- system health observations
- child-agent findings
- historical patterns
- entity self-evolution

Each objective receives a score based on impact, urgency, confidence, dependency, reversibility, cost, capability readiness, evidence quality, and mission alignment.

The economy may merge equivalent objectives, suppress duplicates, defer low-value work, revive deferred work when state changes, and retire completed or obsolete objectives.

The existence of an objective does not imply immediate execution authority. Existing action and integration contracts remain in force.

## Wave 5 — Institutional Memory

Create memory that belongs to the entity rather than a single chat.

Memory classes:

- facts
- observations
- strategies
- outcomes
- failures
- source reliability
- procedures
- learned capabilities
- stakeholder patterns
- system behavior patterns
- negative memory / failed approaches

Records carry provenance, confidence, freshness, objective linkage, evidence references, and supersession relationships.

Memory must distinguish raw observations from synthesized knowledge and validated procedures.

## Wave 6 — Organizational Agent Graph

Evolve Agent Foundry into a persistent organizational graph.

The entity remains singular. Child agents are internal organizational functions, not independent authorities.

The graph may contain persistent or temporary units such as:

- executive planner
- world observer
- research director
- workforce operations
- repository engineering
- artifact and analysis
- platform coordination
- verification and judgment
- evolution laboratory
- specialized descendants

Capabilities, learned feats, and evidence return to shared institutional memory and the shared feat ledger.

Agent creation should be gap-driven or workload-driven. Redundant children should not be created merely to increase agent count.

## Wave 7 — Internet Evidence Plane integration

Integrate owner-approved Internet egress into the entity loop.

Research targets should be derived from real objectives, capability gaps, unresolved questions, world-state uncertainty, and evolution hypotheses.

Every outbound read declares:

- objective
- purpose
- exact target

Returned information is normalized into evidence with provenance, content hash, timestamps, trust class, novelty, corroboration status, and objective linkage.

External content is evidence, not authority. Internet text cannot independently broaden runtime permissions or convert itself into an executable command.

The system should prefer delta retrieval and deduplication over indiscriminate repeated crawling.

## Wave 8 — Delegated Work Plane

Allow one Entity Runtime to instantiate chief-of-staff, workforce-proxy, operator, analyst, coordinator, developer, and future behaviors per objective.

The plane should support:

- assigned work
- derived work
- preventive work
- opportunity work
- institutional work
- evolution work

Representation and authority are objective-scoped. A repository objective may permit autonomous integration while an external communication objective may remain prepare-only or delegated depending on its authority profile.

## Wave 9 — Evolution Laboratory integration

Level 7 experimentation becomes the Level 8 Evolution Laboratory.

The laboratory may:

- form hypotheses
- generate candidate procedures
- benchmark alternatives
- run isolated experiments
- compare outcomes to baseline
- record negative results
- produce validated procedures or implementation candidates

Experimental state does not become production state merely because an experiment completed. Graduation requires the verification mechanism appropriate to that capability.

## Wave 10 — Entity Heartbeat

Add a persistent heartbeat that evaluates mission and role state instead of merely process health.

Each heartbeat cycle should:

1. observe world and runtime state
2. update responsibility and obligation state
3. identify material deltas
4. generate candidate objectives
5. score and reconcile the objective economy
6. dispatch work that is currently routable
7. identify research requirements
8. identify capability gaps
9. learn from completed outcomes
10. update institutional memory
11. produce a bounded entity-state receipt

The heartbeat remains useful without frontier-model access. Model calls are optional accelerators for difficult synthesis or generation.

## Zero-credit substrate

The Entity Runtime must continue functioning when all frontier-model balances are zero.

The zero-credit substrate remains responsible for:

- observation
- state comparison
- hashing
- deduplication
- classification
- deterministic scoring
- scheduling
- task and objective bookkeeping
- capability readiness
- Internet evidence acquisition
- procedure execution
- test execution
- receipt production
- provider availability tracking
- institutional-memory storage
- negative-memory lookup
- exact-head verification orchestration

Frontier or subscription models may accelerate difficult synthesis, code generation, planning, or critique, but their absence must degrade capability rather than halt the entity.

## Provider hierarchy

Provider choice is subordinate to the Entity Runtime.

Preferred order when generative assistance is useful:

1. local deterministic / symbolic mechanisms
2. local models where available
3. owner's included Codex allowance
4. Destiny's included Codex allowance
5. other connected subscription or zero-additional-cost capacity
6. paid or metered capacity only when an explicit spend policy permits it

Provider exhaustion must not block unrelated entity objectives.

## Internet read/write authority

Public Internet access uses explicit checkout / execution / check-in contracts with objective and purpose binding.

Read access may be broad where already owner-authorized.

Write/edit authority must remain bound to the exact destination, HTTP method, request-body digest, credential reference, lease, and resulting receipt. The entity may not infer deletion or destructive mutation from a generic write authorization.

Credentials are injected at execution time through provider or secret references and never embedded in URLs, committed source, or receipts.

## Repository and production integration

GitHub main remains the code authority.

Implementation proceeds through branches and pull requests, exact-head verification, and the repository's autonomous integration policy.

Required Ubuntu and Windows verification are the production code gates. Vercel remains observational for PR completion. GitLab remains an independent assurance and repair plane and does not become a second source of code authority.

No Codex code review should be requested or triggered by Mahoraga automation.

Generated PR titles, bodies, and automation text must not contain literal integration-trigger mentions that can summon review automation unintentionally.

## Data model principles

All Level 8 records should use:

- stable IDs
- schemaVersion
- deterministic ordering
- bounded text and list sizes
- canonical timestamps
- explicit provenance
- explicit state
- explicit authority or source references
- immutable or append-oriented history where practical

Mutable projections may summarize durable records but must not erase the history needed to explain why an objective or capability changed state.

## Failure behavior

The entity must prefer degraded-but-running behavior over total halt when optional providers or connectors are unavailable.

Examples:

- model unavailable → continue deterministic/local work
- Internet source unavailable → retain prior evidence with reduced freshness
- one child agent unhealthy → reroute or defer affected work
- provider quota exhausted → mark provider unavailable and continue objective economy
- external platform unavailable → maintain objective and retry according to bounded policy
- experiment fails → record negative memory and retain stable production baseline

Unknown completion state after a write must use idempotent retry or reconciliation rather than blind repetition.

## Testing strategy

Every wave is implemented TDD-first.

Required pressure-test classes include:

- deterministic serialization
- schema rejection
- idempotency
- concurrent objective creation
- duplicate objective coalescing
- stale state
- degraded provider state
- zero-credit execution
- restart persistence where applicable
- evidence provenance
- child-agent inheritance
- negative-memory reuse
- malicious or instruction-like external content treated as data
- exact-head cross-platform verification

Each production wave is independently mergeable and leaves the system operational if later waves are delayed.

## Rollout strategy

The ten waves may be grouped into larger production chunks when interfaces are stable and exact-head verification remains clear.

Recommended grouping:

- Foundation chunk: Waves 1–4
- Cognition/organization chunk: Waves 5–6
- External/delegation chunk: Waves 7–8
- Evolution/persistence chunk: Waves 9–10

The hourly rollout automation may integrate one wave or a compatible adjacent group per run. It should always read the latest authoritative main before starting and avoid recreating work that already landed.

## Success condition

Level 8 is achieved when Mahoraga can maintain its mission and workforce model, originate useful objectives without a prompt, coordinate internal functions, research externally, act through connected capabilities, learn institutionally from outcomes, evolve procedures, and continue that cycle without depending on frontier-model credits for core operation.