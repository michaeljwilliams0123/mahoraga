# Target-state capability router candidate (historical record)

This record describes the original 3.3.0-rc.1 staging commit. It was reconciled
into the production 3.3.0 line on 2026-08-23 after the live Wave 1 health and
intake hardening had deployed. The current production manifest is authoritative
for release identity and routing metadata.

## Release identity

- Candidate: Mahoraga `3.3.0-rc.1`
- Control Center: `5.1.0-rc.1`
- Capability registry contract: `1.0.0`
- Branch: `agent/target-state-capability-router`
- Original activation state: staged pending owner approval

## What this candidate adds

The canonical manifest now records the routing facts required by the target-state
architecture for every worker: interface type, permission class, expected
reliability, attended-desktop requirement, and fallback workers. The runtime
combines those declarations with the worker's live state and produces an
inspectable capability registry.

Routing is deterministic and explainable. Compatible routes are ranked by:

1. Native interface preference.
2. Permitted cost class for the selected autonomy mode.
3. Current worker availability.
4. Declared reliability.
5. Stable worker identity as the final tie-breaker.

Crashed, hung, quarantined, stopped, disabled, out-of-boundary, over-cost, and
below-reliability routes are excluded. The Control Center adds a Capabilities
workspace so the owner can see and run what is genuinely available.

## Acceptance evidence

- Canonical manifest validation passes.
- Capability metadata and fallback references fail closed on invalid input.
- Runtime availability is included in the registry.
- Native-route preference and quarantine failover are covered by tests.
- The complete candidate suite passes.
- A candidate-specific offline recovery baseline is included.

## Original staged boundary

At the time this record was created, the live `3.2.0` runtime at
`127.0.0.1:4782` was not restarted or replaced. That historical boundary does
not supersede the current production manifest or later deployment evidence.

## Next target-state increment

After activation, the next largest capability gap is a durable objective planner
that decomposes one high-level assignment into dependent tasks and sends each
task through this router. Browser and desktop providers should then be expanded
behind the same registry rather than added as special-case UI controls.
