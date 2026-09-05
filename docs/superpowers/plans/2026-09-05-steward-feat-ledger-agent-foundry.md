# Mahoraga Steward Feat Ledger and Agent Foundry Implementation Plan

## Objective

Implement a deterministic two-hour learning and permanent-child foundry plane without changing the existing four-hour release/candidate cadence.

## Tasks

1. Add failing tests for feat validation, reusable-feat selection, child inheritance, and gap-driven child planning.
2. Implement `src/agent-feat-ledger.mjs` and `src/agent-foundry.mjs`; verify focused tests pass.
3. Add failing tests for deterministic parent learning state and anti-loop fingerprinting.
4. Implement `src/steward-learning-state.mjs`; verify focused tests pass.
5. Add failing tests for the CLI learning cycle, permanent foundry application, and two-hour workflow zero-credit boundary.
6. Implement `scripts/steward-learning-cycle.mjs`, `scripts/steward-agent-foundry.mjs`, and `.github/workflows/steward-two-hour-learning.yml`.
7. Seed the permanent internal registry with Steward children, excluding hosted provider IDs from the public repository.
8. Add documentation for feat submissions and foundry governance.
9. Run all new focused tests locally.
10. Open an isolated feature-branch PR against current `main`; let canonical GitHub verification and protected-branch policy decide integration.

## Verification

- `node --test test/agent-feat-ledger.test.mjs test/agent-foundry.test.mjs test/steward-learning-state.test.mjs test/steward-learning-cycle.test.mjs test/steward-agent-foundry-script.test.mjs`
- Canonical repository CI: `npm run verify:conversation-plane`, `npm run verify`, `npm run self-upgrade:validate`, `npm run gap:audit`, and unified Vercel workspace verification through `verify.yml`.
