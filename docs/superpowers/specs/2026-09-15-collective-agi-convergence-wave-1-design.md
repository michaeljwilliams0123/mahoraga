# Collective AGI Convergence Wave 1 Design

**Status:** implementation authority granted by owner on 2026-09-15.

## Goal

Converge Mahoraga on one cloud-primary production topology, remove retired/ambiguous authorities, and add the first auditable Collective-AGI cognitive substrate without creating a second scheduler, database, router, or hidden authority plane.

## Topology truth

- GitHub repository `michaeljwilliams0123/mahoraga` is source and merge authority.
- GitHub exact-head Ubuntu + Windows Verify remains the primary CI gate.
- Railway project `e644391a-9698-4026-b5e1-a28e07cfaf82`, production service `0498b161-a6b7-4750-8c54-8c99e0167fa7`, is the sole production runtime.
- Cloudflare owner gateway remains the authenticated owner edge.
- GitLab project `85885826` is independent assurance/repair, not source or merge authority.
- Windows/local devices are optional bootstrap, rollback, attended-action, and local-model edges; normal operation must not depend on them.
- Vercel deployments/projects are retired and must not produce authority, routing, health, or merge signals.

## Authority and naming

Human-readable names are labels, never authority. Every managed platform surface receives a stable logical resource ID and immutable provider identifiers. A display-name change must not alter canonicality. Retired resources are fail-closed and may not become fallback routes.
## Cognitive individuality

A cognitive individual is bound to an existing canonical `agentId`, but owns a separate cognitive profile. The profile contains stable identity/personality traits, perspective tags, epistemic posture, private episodic-memory references, and explicit share policy. Personality affects deliberative perspective only; it never grants capabilities, credentials, authority scopes, data access, or mutation rights.

Private autobiographical memory is distinct from shared institutional memory. Information enters institutional memory only through an explicit promoted lesson/evidence record. This prevents the Collective from flattening every individual into one shared context.

## Collective cognition

Collective deliberation selects complementary individuals using capability fit plus perspective diversity. Each participant emits a bounded position receipt: conclusion, confidence, evidence refs, assumptions, unknowns, and dissent tags. Hidden chain-of-thought is never persisted. Synthesis must preserve material dissent and must not equate majority vote with truth.

## Metacognition and world model

Metacognition is operational calibration, not a claim of consciousness. Mahoraga records evidence coverage, known unknowns, uncertainty, conflict, and whether the decision should proceed, seek evidence, simulate, or hold.

The world model begins as a deterministic transition/counterfactual contract over `world-state-observer` snapshots. Learned latent models remain optional future providers. No placeholder neural score is treated as intelligence evidence.

## Transfer and generalization

Transfer claims require domain-tagged empirical trials. A skill is promotable only when it improves held-out performance across more than one domain without unacceptable regression in the source domain. No fixed AGI score or hard-coded evaluator qualifies as proof.

## Evolution

Cognitive changes graduate through the existing Evolution Laboratory. Promotion must preserve authority, memory separation, individual diversity, evidence retention, zero-credit boundaries where requested, and exact-head verification. Candidate code cannot modify its own judge or silently drop material dissent.

## 2026-09-20 metacognitive dissent-to-planning hardening

The unified cognitive loop now treats Collective deliberation as evidence for the final metacognitive assessment rather than trusting caller-supplied conflict fields in isolation.

- Collective `unknowns` are unioned with caller-reported known unknowns before final metacognitive assessment. The standalone caller contract remains capped at 32 items; the internal Collective aggregate is separately bounded at 416 items (32 caller + 12 positions x 32 unknowns).
- `materialConflictCount` cannot be lower than the number of material-dissent positions observed by the Collective.
- The public lifecycle receipt reflects `deliberate -> assess -> plan`, matching the final assessment dependency.
- Material dissent remains the explicit decision-gate provenance only when material dissent records actually exist; metacognitive and ordinary Collective holds retain distinct provenance.
- Planner diagnostic actions remain visible, but `automaticMutationAllowed` is forced false whenever final metacognition does not proceed or material dissent is present.
- No planner action gains authority, no router/provider contract changes, and no hidden reasoning is persisted.

This hardening preserves owner authority, cognitive-individual identity, private/institutional memory separation, zero-credit defaults, and existing exact-head promotion controls.
## 2026-09-20 evidence-qualified bounded dissent resolution

Material dissent remains preserved, but the cognitive loop now distinguishes dissent that must block execution from dissent that must remain visible without becoming an unbounded veto.

- A current, valid, unsuperseded dissent evidence reference remains blocking regardless of majority size or confidence.
- Missing or merely aging dissent evidence fails closed and requests re-observation; omission cannot grant mutation authority.
- Stale, historical, invalid, refuted, or superseded dissent becomes nonblocking only when a single alternative conclusion is supported by at least two participants and at least two current, valid, independent evidence lineages.
- Correlated evidence is counted by lineage roots rather than votes, so duplicated or shared evidence cannot manufacture independence.
- An unchanged current-valid dissent claim that survives three unresolved cycles after a discriminating observation favors the alternative remains blocking but changes gate provenance to `dissent-escalation`; Mahoraga does not silently override it.
- The bounded dissent receipt retains participant identity, evidence refs, validity/freshness/lineage metadata, dissent tags, pre/post evidence-qualified confidence, unresolved-cycle count, prior observation state, and the next re-observe/escalate action.
- Planner mutation remains governed by the existing planner/router authority. `automaticMutationAllowed` is suppressed whenever evidence-qualified blocking dissent remains; no new lease, provider, credential, memory plane, or supervisor is created.
- Existing `storedLesson.promotable` remains the institutional-memory promotion gate, so held or escalated decisions are not promoted.

Review hardening: when multiple alternative conclusions exist, alternatives satisfying both independence thresholds are ranked before any unqualified group, so one participant with many evidence roots cannot suppress a genuinely qualified alternative. Dissent-cycle continuity is claim-specific: participant identity, conclusion, dissent tags, and evidence references must all match before unresolved-cycle history can carry forward.
