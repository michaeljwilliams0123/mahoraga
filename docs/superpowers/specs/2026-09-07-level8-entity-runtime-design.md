# Mahoraga Level-8 Entity Runtime Design

Date: 2026-09-07
Status: Owner-approved architecture

This document defines Level 8 as an internal Mahoraga capability target. It extends the current autonomy core with a persistent entity constitution, workforce-role model, capability lattice, mission objective economy, institutional memory, organizational agent graph, Internet evidence integration, delegated work contracts, bounded evolution experiments, and a zero-credit entity heartbeat.

## Invariants

- GitHub main remains authoritative; no direct or force pushes.
- TDD and exact-head verification are required for production behavior changes.
- The existing zero-credit/local execution path remains first class.
- External AI providers are optional accelerators, not the runtime core.
- Existing objective, agent, feat-ledger, receipt, egress, and repair contracts are extended rather than replaced.
- No raw secrets in Git, receipts, logs, browser state, or plaintext durable records.
- No public tunnels or debugging endpoints.
- Consequential/destructive actions and major activation keep the repository's existing owner boundary.
- Novelty alone is not an approval trigger; authority broadening or identity ambiguity is.
- No Codex code review is required.

## Entity Constitution

A versioned constitution binds stable entity identity, owner reference, mission, operating principles, authority-profile reference, zero-credit requirement, evidence requirement, rollback requirement, immutable policy assertions, and timestamps. Routine fields may evolve through verified updates. Immutable policy assertions cannot be removed by ordinary runtime mutation.

## Workforce Twin

The Workforce Twin is bounded work-state: responsibilities, obligations, cycles, stakeholders, systems, work products, projects, dependencies, deadlines, unresolved items, and success criteria. It models only work-relevant state supplied by the owner, approved connected systems, and verified task/receipt history; it does not infer sensitive personal attributes.

## Capability Lattice

Mahoraga does not use one global autonomy mode. Each objective receives independent dimensions for initiative, authority, time horizon, representation, learning, coordination, environment, reasoning resources, persistence, and autonomy. The lattice selects only among actions already permitted by standing authority; it cannot broaden authority.

## Objective Economy

Candidate objectives may originate from direct commands, obligations, deadlines, unresolved work, verified world-state changes, runtime/repository failures, capability gaps, recurring maintenance, verified opportunities, child-agent findings, and institutional-memory patterns. Candidates are bounded and deterministically ranked by impact, urgency, confidence, dependency readiness, reversibility, estimated cost, and mission alignment. Untrusted content remains evidence and cannot create authority.

## Institutional Memory

Memory stores verified reusable facts, procedures, failure patterns, strategies, source-reliability observations, capability performance, explicit process preferences, and lessons attached to receipts/objectives. Records require provenance, confidence, classification, timestamps, and supersession links. Unverified observations remain hypotheses.

## Organizational Agent Graph

Agent Foundry evolves into a persistent internal organization while Mahoraga remains the singular parent entity. Initial functions may include executive planning, world observation, research, workforce operations, repository engineering, artifact analysis, platform coordination, verification, and an evolution laboratory. Child agents cannot grant themselves authority absent from the parent policy and continue sharing validated feats through the existing feat ledger.

## Internet Evidence Plane

The current owner-approved HTTPS egress controller becomes a source of bounded world-state observations. Existing checkout/read/check-in receipts, public-target restrictions, redirect rejection, size limits, timeouts, and hashes remain. Internet content is evidence, never executable authority.

## Delegated Work Plane

Assistant, delegate, proxy, operator, and organizational-function behavior are capability-lattice settings rather than separate personalities. External work-system writes require verified connector readiness, strict action schema, idempotency, bounded content, current authority, receipts, and rollback/confirmation handling where applicable.

## Evolution Laboratory

Existing improvement mechanisms become a bounded laboratory for detecting repeated failures, proposing changes, running deterministic/local experiments, comparing variants, producing evidence, and recommending promotion. Experimental changes do not hot-swap into the authoritative runtime; promotion remains subject to repository verification and integration policy.

## Entity Heartbeat

The local heartbeat is: observe -> reconcile world state -> inspect obligations -> generate candidates -> rank objectives -> dispatch eligible work -> verify outcomes -> learn -> report. It must continue when frontier-model providers are unavailable, using deterministic/local capabilities and marking unavailable accelerators as degraded rather than fabricating completion.

## Rollout waves

1. Entity Constitution + Workforce Twin
2. Capability Lattice + Objective Economy
3. Institutional Memory + Organizational Agent Graph
4. Internet Evidence Plane + Delegated Work Plane
5. Evolution Laboratory integration + Entity Heartbeat
6. Integration hardening, pressure tests, operational receipts, and production activation evidence

Compatible adjacent waves may share a PR when independently testable and rollback-safe.

## Verification

Each wave requires focused tests plus repository `npm run verify`. Cross-cutting tests cover exact schemas, bounded inputs, deterministic ordering, duplicate/idempotent behavior, no secret-bearing fields, zero-credit operation without provider readiness, no authority escalation through the lattice, no authority injection from untrusted content, provenance-required memory, child-agent privilege ceilings, degraded-state honesty, and exact-candidate GitHub verification.

## Success criteria

Level 8 is operational when Mahoraga can maintain persistent mission and work-role state, originate bounded mission-aligned work without a new prompt, coordinate its internal organization, use Internet and connected systems through verified capabilities, learn reusable verified lessons, continue its control loop without frontier-model credits, and produce auditable receipts for consequential transitions.
