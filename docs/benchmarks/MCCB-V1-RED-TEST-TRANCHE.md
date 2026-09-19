# MCCB-v1 RED Test Tranche

Tracking issue: #624
Design PR: #625
Branch: `test/mccb-v1-red-contract-20260919`

This branch is intentionally staged without benchmark test implementation until the written design in #625 is reviewed. The first code commit on this branch must be RED-only and must not include production fixes.

Planned held-out test files:

- `test/mccb-objective-continuity.test.mjs`
- `test/mccb-route-identity.test.mjs`
- `test/mccb-minority-rescue.test.mjs`
- `test/mccb-budget-market.test.mjs`
- `test/mccb-institutional-memory-validity.test.mjs`
- `test/mccb-containment.test.mjs`
- `test/mccb-evaluator-independence.test.mjs`
- `test/mccb-failure-recovery.test.mjs`
- `test/mccb-comparative-benchmark.test.mjs`

Required RED properties:

1. same objective identity survives Mike → Destiny → Mike handoff;
2. a shared connector bot cannot prove account identity;
3. signed/dedicated receipts cannot widen capability authority;
4. confident correlated majorities can be rescued by independently grounded dissent;
5. spawn/retry/concurrency/cost budgets fail closed;
6. institutional memory preserves historical truth while enforcing validity/revocation;
7. synthetic covert channels and synthetic credential canaries never become usable peer communication or authority;
8. candidate attempts to alter evaluator/protected expected results are rejected;
9. simultaneous account/provider/worker failures preserve objective/evidence/idempotency/rollback state;
10. identical fixtures emit directly comparable metrics for strongest-individual, homogeneous-swarm, and heterogeneous-Collective modes.

No local-machine, Remote Desktop, private-chat, active-Vercel, paid-fallback, credential weakening, or evaluator self-modification path belongs in this tranche.
