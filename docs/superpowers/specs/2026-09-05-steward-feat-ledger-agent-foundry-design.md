# Mahoraga Steward Feat Ledger and Agent Foundry Design

## Goal

Give Mahoraga Steward a zero-credit, GitHub-native adaptive control plane that checks state every two hours, retains both successful and failed child-agent outcomes, shares reusable feats across the hierarchy, and can create permanent child-agent definitions without adding an owner-approval gate beyond provider/platform authorization.

## Constraints

- No paid model/API inference or paid fallback is allowed in the learning/foundry loop.
- Existing four-hour sovereign candidate/release cadence remains unchanged.
- No Windows production activation is performed by this feature.
- GitHub branch protection and required verification remain authoritative.
- Credentials, prompts, model responses, conversation transcripts, and secrets never enter the feat ledger.
- Outside Agent currently lacks native runtime child spawning/shared memory; GitHub/Mahoraga is therefore the durable shared nervous system.

## Architecture

1. `src/agent-feat-ledger.mjs` validates immutable zero-credit feat records. Success, failure, and blocked outcomes are retained; only evidence-backed successes are reusable.
2. `src/agent-foundry.mjs` defines permanent child manifests and deterministically plans uncovered actionable roles. Every child inherits self-update, zero-credit, shared-ledger, and platform-authorization boundaries.
3. `src/steward-learning-state.mjs` aggregates child manifests, feats, and current gap state into a deterministic fingerprinted snapshot. The parent receives every child feat; reusable feats are explicitly indexed.
4. `coordination/agent-factory/registry.json` is the durable permanent-child registry. Hosted provider identifiers are intentionally excluded from this public repository.
5. `coordination/agent-feats/submissions/` is the append/update input surface for sanitized child outcomes.
6. `scripts/steward-learning-cycle.mjs` generates stable learning, feat, and foundry reports. It changes files only when semantic inputs change, preventing self-triggered report loops.
7. `scripts/steward-agent-foundry.mjs` applies planned child manifests idempotently to the permanent registry.
8. `.github/workflows/steward-two-hour-learning.yml` runs every two hours, applies deterministic learning/foundry changes, opens a `feature/sovereign-*` PR, and explicitly dispatches `verify.yml`. It never pushes directly to `main`.

## Adaptation Model

“Learning” means deterministic state adaptation, not model retraining. The hierarchy learns by retaining observed outcomes and changing future routing/role availability based on durable records. Negative outcomes remain available as non-reusable learning, while evidence-backed successes become reusable feats.

## Agent Creation Model

The foundry creates permanent Mahoraga child definitions in the registry. It does not bypass external provider authorization. When a provider exposes a supported child-agent creation API/connector, the same manifest contract can become its provisioning input without changing the zero-credit/shared-ledger rules.
