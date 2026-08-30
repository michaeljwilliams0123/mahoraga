# Phase E King-Admin Break-Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `primary-local-codex` as a dormant, audited, last-resort repair lane without making Codex a dependency of normal Mahoraga operation.

**Architecture:** A strict activation policy issues one immutable incident lease only after normal-provider exhaustion and integrity checks. Existing Codex execution runs inside an isolated candidate and the same project/checkpoint firewall. Every terminal outcome revokes the lease and records exceptional consumption separately.

**Tech Stack:** Node.js 24 ESM, existing Codex builder worker, SQLite audit data, authenticated loopback API, and `node:test`.

**Spec:** Sovereign reasoning design and zero-credit autonomy addendum dated 2026-08-29.

## Global Constraints

- Do not begin this phase until Phases A-D and the zero-credit real-task gate pass.
- `primary-local-codex` is the sole holder; maximum duration 30 minutes, maximum attempts one, maximum concurrent leases one.
- Normal routing cannot select Codex, regardless of health or availability.
- Break-glass cannot override owner-reserved, privacy, data-plane, credentials, public exposure, OS authorization, destructive, billing, tenant, or irreversible-action boundaries.
- Exceptional provider usage is isolated from normal zero-credit receipts.

### Task 1: Immutable Lease and Activation Policy

**Files:**
- Create: `src/king-admin-lease.mjs`
- Create: `src/king-admin-policy.mjs`
- Create: `test/king-admin-policy.test.mjs`
- Modify: `src/database.mjs`

**Interfaces:** `issueKingAdminLease(request, integrity, clock): KingAdminLease`; `evaluateKingAdminActivation(input): ActivationDecision`.

- [ ] Write tests for explicit owner incident activation and automatic activation only after bounded normal-provider exhaustion inside a preauthorized local project.
- [ ] Test rejection for unhealthy policy, audit, authentication, release baseline, checkpoint, rollback, data-plane, or normal provider; test duration, holder, attempt, project-root, capability, incident, delegation, widening, renewal, reuse, and concurrency constraints.
- [ ] Run the focused test and confirm missing modules.
- [ ] Implement immutable lease normalization, atomic single-lease storage, activation evidence, expiry, revocation, and content-free audit events.
- [ ] Run focused tests plus `node --test test/database.test.mjs test/controller-authority.test.mjs`; commit with `git commit -m "feat: add king-admin activation contract"`.

### Task 2: Isolated Codex Repair Execution

**Files:**
- Modify: `src/codex-builder-worker.mjs`
- Modify: `src/worker-process.mjs`
- Modify: `src/supervisor.mjs`
- Modify: `mahoraga.manifest.json`
- Create: `src/king-admin-execution.mjs`
- Create: `test/king-admin-execution.test.mjs`

**Interfaces:** `executeKingAdminRepair({ lease, incident, candidate }, dependencies): Promise<BreakGlassReceipt>`.

- [ ] Write tests proving exact authorized project/path/capability matching, isolated candidate creation, checkpoint before mutation, deterministic verification, one attempt, expiry revalidation at dispatch and activation, and no access to credentials or unrelated files.
- [ ] Write rollback tests for patch, verification, audit-write, and activation failures; assert lease revocation after every terminal outcome.
- [ ] Run the focused test and confirm the new execution adapter is missing.
- [ ] Route the Codex worker only through the active lease and project action boundary. Never accept a caller-selected executable, root, role, or capability.
- [ ] Run focused tests plus `node --test test/codex-builder-worker.test.mjs test/executable-boundary.test.mjs`; commit with `git commit -m "feat: execute isolated king-admin repairs"`.

### Task 3: Exceptional Receipts and Owner Surface

**Files:**
- Modify: `src/runtime.mjs`
- Modify: `src/server.mjs`
- Modify: `web/index.html`
- Modify: `web/app.js`
- Create: `test/king-admin-runtime.test.mjs`

**Interfaces:** Authenticated owner-only endpoints to request, approve when required, inspect, and revoke a lease; status exposes incident ID, bounded scope, expiry, attempt, rollback state, and exceptional usage totals.

- [ ] Write tests for owner authentication, automatic-policy evidence, redaction, revocation, expiry, one active lease, and separation of normal zero-credit and exceptional credit receipts.
- [ ] Run the focused test and confirm routes are absent.
- [ ] Add a Control Center card labeled `Dormant last resort` or `Active incident recovery`; require the incident and remaining lease time to be conspicuous.
- [ ] Run focused tests plus runtime and Control Center tests; commit with `git commit -m "feat: expose audited break-glass control"`.

### Task 4: Release and Adversarial Gate

**Files:**
- Create: `test/king-admin-adversarial.test.mjs`
- Modify: `docs/PRODUCTION-VERIFICATION.md`
- Modify: `docs/ROLLBACK.md`

- [ ] Add adversarial tests for prompt-requested self-elevation, fake owner approval, lease replay, clock boundary, path aliases, symlink escape, audit failure, rollback sabotage, public listener, tenant transfer, credential access, destructive command, and simultaneous activation.
- [ ] Prove healthy normal project work never invokes Codex and still completes the Phase D real-task scenario with zero credits.
- [ ] Perform full verification, inactive-runtime smoke, isolated repair canary, rollback drill, and post-expiry access denial. Record bounded evidence only.
- [ ] Stage activation; do not promote production until all gates settle and the owner approves the candidate.
- [ ] Commit with `git commit -m "test: gate king-admin break-glass release"`.
