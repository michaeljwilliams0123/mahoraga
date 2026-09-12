# PR Salvage Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover every still-valid improvement from closed, unmerged Mahoraga PRs while preserving current architecture, exact-head verification, and explicit retirement decisions.

**Architecture:** Treat historical PRs as evidence, not authority. Classify each PR, compare its behavior against current `main`, reopen only coherent current-architecture deltas, and rebuild stale-but-valid requirements from current `main` with focused regression tests.

**Tech Stack:** GitHub PR/Actions, Node 24 ESM, node:test, TypeScript/Next.js cloud workspace, PowerShell Windows convergence scripts.

**Spec:** `docs/superpowers/specs/2026-09-12-pr-salvage-audit-design.md`

## Global Constraints
- Follow `AGENTS.md` and `docs/ECOSYSTEM-LOCK.md`.
- Public product identity stays `Mahoraga`; version strings are provenance only.
- Windows production rollback line remains `3.6.0`.
- Do not request Codex code review or create automated PR/review/comment/reaction traffic.
- Required integration authority is exact-head `Verify Mahoraga` on Ubuntu and Windows.
- Preserve fail-closed provider, billing, credential, routing, and mutation boundaries.

---

### Task 1: Classify closed-unmerged PR lineages

**Files:**
- Modify: `docs/superpowers/plans/2026-09-12-pr-salvage-audit.md`

**Interfaces:**
- Consumes: GitHub PR metadata, diffs, current-main code search.
- Produces: disposition for every closed-unmerged PR reviewed: `merged-equivalent`, `duplicate-or-empty`, `disproved`, `reopenable`, `salvage-to-current-main`, or `retired-by-policy`.

- [ ] **Step 1:** Enumerate closed, unmerged PRs, newest first.
- [ ] **Step 2:** Resolve explicit lineage replacements before inspecting code, e.g. `#419 -> #418/#407`, `#399 -> #398`, `#393 -> #389`.
- [ ] **Step 3:** Record zero-file WIPs and diagnostic-only PRs as non-reopenable.
- [ ] **Step 4:** For non-empty candidates, inspect changed paths/patch and compare intended behavior with current `main`.
- [ ] **Step 5:** Keep only candidates with unique missing behavior.

### Task 2: Recover current cloud/workspace provenance and accessibility gaps

**Files:**
- Inspect/possibly modify: `cloud-app/app/api/health/route.ts`
- Inspect/possibly modify: `cloud-app/components/cockpit/CockpitView.tsx`
- Inspect/possibly modify: `cloud-app/components/workspace/workspace-types.ts`
- Test: `cloud-app/test/cockpit-contract.test.mjs`

**Interfaces:**
- Consumes: current paired-core/runtime health contract.
- Produces: bounded observational convergence/provenance data only when backed by authenticated/current evidence; accessible paired/published/fail-closed status presentation.

- [ ] **Step 1:** Compare #360/#365/#366 requirements against current main.
- [ ] **Step 2:** If missing behavior exists, add a regression test that fails only for that missing contract.
- [ ] **Step 3:** Verify RED with focused cloud-app tests.
- [ ] **Step 4:** Implement the smallest current-main-compatible projection/UI change; never infer runtime provenance from deployment SHAs.
- [ ] **Step 5:** Verify focused tests/typecheck/build as applicable.

### Task 3: Recover security and status-projection gaps

**Files:**
- Inspect current server/runtime status projection files identified by code search.
- Test current public-status security contracts.

**Interfaces:**
- Consumes: authenticated internal status plus public liveness projection.
- Produces: content-minimized public status with no tenant/environment/relay identifiers.

- [ ] **Step 1:** Compare #309 behavior with current main.
- [ ] **Step 2:** If tenant/environment identity can still reach public status, write a failing regression.
- [ ] **Step 3:** Implement minimum redaction at projection boundary.
- [ ] **Step 4:** Run focused security/runtime tests.

### Task 4: Recover runtime/reliability improvements

**Files:**
- Inspect current equivalents of #363, #398, #414, #150, and #174 changed paths.
- Modify only current-main files where unique behavior remains missing.

**Interfaces:**
- Consumes: runtime convergence, encrypted relay continuity, local-reasoner readiness, workspace operations state.
- Produces: only bounded, evidence-backed reliability deltas.

- [ ] **Step 1:** Confirm #398 is merged-equivalent via #399 and #414 is disproved.
- [ ] **Step 2:** Compare #363 relay continuity requirements with current relay/session implementation.
- [ ] **Step 3:** Compare #150 redundant local-reasoner probing with current heartbeat implementation.
- [ ] **Step 4:** Compare #174 Operations/fleet-status intent with current workspace and reject its accidental stylesheet truncation.
- [ ] **Step 5:** For each true gap, create one focused RED test and minimal GREEN implementation.

### Task 5: Recover autonomy/delegation candidates

**Files:**
- Inspect current equivalents of #184, #229, #199/#197, and older autonomy branches.

**Interfaces:**
- Consumes: current UCF, objective planner, capability graph, provider admission, and owner-authority contracts.
- Produces: no duplicate subsystem; only missing current-architecture behavior.

- [ ] **Step 1:** Map each older candidate to current UCF/Level-8/main behavior.
- [ ] **Step 2:** Mark superseded architecture closed.
- [ ] **Step 3:** Reopen only a coherent branch whose delta remains current and unique; otherwise rebuild the missing behavior from current main.
- [ ] **Step 4:** Require focused RED/GREEN evidence for every new implementation.

### Task 6: Exact-head integration discipline

**Files:**
- No source file is modified solely to satisfy this task.

**Interfaces:**
- Consumes: candidate PR exact head.
- Produces: merge decision grounded only in current exact-head GitHub verification.

- [ ] **Step 1:** Confirm PR head SHA immediately before verification/merge.
- [ ] **Step 2:** Require completed-success Ubuntu and Windows `Verify Mahoraga` jobs on that exact SHA.
- [ ] **Step 3:** If a required job fails, inspect logs and fix only a genuine code/test/build defect.
- [ ] **Step 4:** If cancelled/infrastructure-only, rerun without source changes.
- [ ] **Step 5:** Merge through the normal PR path only after exact-head success.
