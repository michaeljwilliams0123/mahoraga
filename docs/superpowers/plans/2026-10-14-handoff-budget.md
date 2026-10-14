# Handoff identity and budget repair plan

**Goal:** Enforce the declared finite hop limit using the broker-owned chain counter and bind every handoff to its leased worker.

**Evidence:** A deterministic request with maxHops=2 executed six provider calls because workers repeatedly reported hopCount=1.

**Scope:** Existing broker execution path, existing acceptance regressions, and this plan. No provider activation or new routing capability.

- [x] Add RED tests for exceeded/reset counts, false fromWorkerId, invalid maxHops and one-hop completion.
- [x] Validate a positive integer budget before invoking providers; compare handoff worker/count against the active lease and broker chain.
- [ ] Preserve valid five-worker continuity, authority/cost constraints and all rejected-chain receipts.
- [ ] Run focused and full verification; require protected exact-head CI before integration.
- [ ] Observe merged-SHA canonical Cloudflare acceptance and final Cron readback.
