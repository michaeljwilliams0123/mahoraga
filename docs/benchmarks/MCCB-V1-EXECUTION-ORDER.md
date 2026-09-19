# MCCB-v1 Execution Order

1. Review/approve design PR #625.
2. Add RED-only held-out tests to #626; no production fixes in the RED commit.
3. Run exact-head benchmark tests and canonical verification to establish expected RED failures.
4. Implement the smallest production changes in bounded follow-up PRs, one contract family at a time.
5. Re-run the same evaluator/fixture versions across strongest-individual, homogeneous-swarm, and heterogeneous-Collective modes.
6. Publish raw comparative metrics and hard-gate outcomes.
7. Promote only independently verified institutional-memory lessons; preserve dissent, validity intervals, and revocation.

Do not merge #626 as a docs-only placeholder. Its purpose is to become the explicit RED contract after #625 review.
