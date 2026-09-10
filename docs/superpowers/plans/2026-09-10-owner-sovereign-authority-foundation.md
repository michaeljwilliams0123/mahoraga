# Owner-Sovereign Authority Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make privileged Mahoraga capabilities, including direct Test/Prod deployment, execute without an extra human gate when owner authority, platform permission, and registered capability scope all agree.

**Architecture:** Add one deterministic authority resolver and keep it separate from transport adapters. The router uses the resolver only for tasks that declare `authorityScope`, so existing task behavior is unchanged; Copilot Studio and future workers declare their privileged scopes in the existing capability registry. Owner intent lives in the manifest, platform permission remains live runtime context, and effective authority is their intersection.

**Tech Stack:** Node.js 24+, ESM `.mjs`, built-in `node:test`, JSON Schema draft-07, existing Mahoraga manifest/router/capability registry.

**Spec:** `docs/superpowers/specs/2026-09-10-owner-sovereign-copilot-studio-control-plane-design.md`

## Global Constraints

- Do not bypass GitHub branch protection or Microsoft tenant/identity controls.
- Do not store raw credentials, bearer tokens, cookies, private keys, or passwords in Git.
- No generic public tunnel, reverse proxy, or arbitrary port-forwarding path.
- `effectiveAuthority = ownerGrant ∩ platformGrantedPermissions ∩ registeredCapability`.
- Direct deployment is gate-free only when the requested target is owner-granted and the connected platform reports the required permission.
- Existing non-privileged tasks must route exactly as before.
- Preserve localhost runtime boundaries and existing exact-head verification/recovery semantics.
- Use `npm.cmd` on Windows to avoid the local PowerShell `npm.ps1` execution-policy block.

---

## File Structure
- Create `src/owner-authority.mjs`: validate owner grants and resolve effective authority.
- Create `test/owner-authority.test.mjs`: resolver and grant contract behavior.
- Modify `src/config.mjs`: validate the manifest `ownerAuthority` section and worker `authorityScopesByCapability` maps.
- Modify `mahoraga.manifest.json`: install the active owner-sovereign grant and declare capability-specific Copilot Studio privileged scopes.
- Modify `src/capability-registry.mjs`: project each capability's declared authority scopes into routable capability entries.
- Modify `src/router.mjs`: resolve privileged task authority after capability selection and fail closed when any intersection member is missing.
- Modify `test/router.test.mjs`: prove gate-free `deployment.execute` routing and platform-denied behavior.
- Modify `config/autonomy-envelope.json`, `schemas/autonomy-envelope.schema.json`, `docs/AUTONOMY-MODEL.md`: replace the blanket gated model with owner-delegable privileged actions while preserving structural prohibitions.
- Refresh `state/release-baseline/**` only after source/config tests pass.

### Task 1: Owner Authority Contract and Resolver

**Files:**
- Create: `src/owner-authority.mjs`
- Create: `test/owner-authority.test.mjs`
- Modify: `src/config.mjs`
- Modify: `mahoraga.manifest.json`

**Interfaces:**
- Produces: `validateOwnerAuthorityGrant(value)` -> frozen validated grant.
- Produces: `resolveEffectiveAuthority({ grant, requestedScope, requestedTarget, platformScopes, capabilityScopes, now })` -> `{ authorized, reason, requestedScope, requestedTarget, confirmationRequired }`.
- Manifest adds `ownerAuthority` and optional worker `authorityScopesByCapability` maps keyed by declared capability.

- [ ] **Step 1: Write failing resolver tests**

```js
import { resolveEffectiveAuthority, validateOwnerAuthorityGrant } from "../src/owner-authority.mjs";

const grant = validateOwnerAuthorityGrant({ schemaVersion: 1, kind: "owner-authority-grant", grantId: "owner-sovereign-primary", ownerPrincipal: "github:michaeljwilliams0123", grantee: "mahoraga-core", state: "active", scopes: ["deployment.execute", "copilot.invoke"], deploymentTargets: ["dev", "test", "prod"], confirmationRequiredScopes: [], revokedScopes: [] });
assert.equal(resolveEffectiveAuthority({ grant, requestedScope: "deployment.execute", requestedTarget: "prod", platformScopes: ["deployment.execute"], capabilityScopes: ["deployment.execute"] }).authorized, true);
assert.equal(resolveEffectiveAuthority({ grant, requestedScope: "deployment.execute", requestedTarget: "prod", platformScopes: [], capabilityScopes: ["deployment.execute"] }).reason, "platform-authority-missing");
```
- [ ] **Step 2: Run the resolver test and verify RED**

Run: `node --test --test-isolation=none test/owner-authority.test.mjs`
Expected: FAIL because `src/owner-authority.mjs` does not exist.

- [ ] **Step 3: Implement the minimal grant validator and intersection resolver**

```js
export function resolveEffectiveAuthority({ grant, requestedScope, requestedTarget = null, platformScopes = [], capabilityScopes = [], now = Date.now() }) {
  const validated = validateOwnerAuthorityGrant(grant);
  if (validated.state !== "active") return deny("owner-grant-inactive", requestedScope, requestedTarget);
  if (validated.revokedScopes.includes(requestedScope)) return deny("owner-scope-revoked", requestedScope, requestedTarget);
  if (!validated.scopes.includes(requestedScope)) return deny("owner-authority-missing", requestedScope, requestedTarget);
  if (!platformScopes.includes(requestedScope)) return deny("platform-authority-missing", requestedScope, requestedTarget);
  if (!capabilityScopes.includes(requestedScope)) return deny("capability-authority-missing", requestedScope, requestedTarget);
  if (requestedScope === "deployment.execute" && !validated.deploymentTargets.includes(requestedTarget)) return deny("deployment-target-not-granted", requestedScope, requestedTarget);
  return Object.freeze({ authorized: true, reason: null, requestedScope, requestedTarget, confirmationRequired: validated.confirmationRequiredScopes.includes(requestedScope) });
}
```

`validateOwnerAuthorityGrant` must reject unknown fields, duplicate scopes, malformed IDs, unsupported scopes/targets, revoked grants with active-only assumptions, and any secret-bearing field names.

- [ ] **Step 4: Add manifest validation and reference owner grant**

`src/config.mjs` validates `value.ownerAuthority` through `validateOwnerAuthorityGrant`; each worker may optionally declare an `authorityScopesByCapability` map whose keys must be that worker's declared capabilities and whose values are unique authority-scope lists. `mahoraga.manifest.json` grants `deployment.execute` for `dev`, `test`, and `prod` with no confirmation-required scope and declares matching capability-specific Copilot Studio authority scopes.

- [ ] **Step 5: Run focused tests GREEN**

Run: `node --test --test-isolation=none test/owner-authority.test.mjs test/autonomy-policy.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/owner-authority.mjs src/config.mjs mahoraga.manifest.json test/owner-authority.test.mjs
git commit -m "feat(authority): add owner-sovereign grant resolver"
```

### Task 2: Capability Registry and Gate-Free Router Wiring

**Files:**
- Modify: `src/capability-registry.mjs`
- Modify: `src/router.mjs`
- Modify: `test/router.test.mjs`
**Interfaces:**
- `buildCapabilityRegistry` exposes `authorityScopes` for every route; absent declarations become `[]`.
- Privileged tasks declare `authorityScope` and optional `authorityTarget`.
- Runtime context supplies `platformAuthorityScopesByWorkerId` as `{ [workerId]: string[] }`.
- `routeTask` returns `authorityDecision` for privileged routes and does not add a confirmation gate when the decision is authorized with `confirmationRequired: false`.

- [ ] **Step 1: Write failing router tests**

```js
const task = { capability: "studio.deploy", dataClass: "enterprise", requestedMode: "maximum", authorityScope: "deployment.execute", authorityTarget: "prod" };
const route = routeTask(manifest, task, { workerStates: [verifiedWorkerState(manifest, "copilot-studio")], now: NOW, platformAuthorityScopesByWorkerId: { "copilot-studio": ["deployment.execute"] } });
assert.equal(route.status, "routable");
assert.equal(route.authorityDecision.authorized, true);
assert.equal(route.authorityDecision.confirmationRequired, false);
```

Add a second case with the same owner/capability declaration but no platform scope; expect `status: "waiting"` and reason `platform-authority-missing`.

- [ ] **Step 2: Run router test RED**

Run: `node --test --test-isolation=none test/router.test.mjs`
Expected: FAIL because capability entries do not yet project authority scopes and router does not resolve authority.

- [ ] **Step 3: Project capability authority scopes**

In `src/capability-registry.mjs`, add `authorityScopes: [...(worker.authorityScopesByCapability?.[capability] ?? [])]` to each static capability entry and normalize projected entries to an array.

- [ ] **Step 4: Resolve privileged authority after candidate selection**

In `src/router.mjs`, after selecting the candidate, call `resolveEffectiveAuthority` only when `task.authorityScope` is present. Pass `manifest.ownerAuthority`, the task scope/target, the selected route's `authorityScopes`, and `context.platformAuthorityScopesByWorkerId?.[selected.workerId] ?? []`. A denied decision returns `waiting`; an authorized decision is attached to the routable result.

- [ ] **Step 5: Run router + authority tests GREEN**

Run: `node --test --test-isolation=none test/owner-authority.test.mjs test/router.test.mjs`
Expected: PASS, including existing router tests.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/capability-registry.mjs src/router.mjs test/router.test.mjs
git commit -m "feat(router): enforce delegated capability authority"
```
### Task 3: Autonomy Envelope v2 — Owner-Delegable Direct Deploy

**Files:**
- Modify: `config/autonomy-envelope.json`
- Modify: `schemas/autonomy-envelope.schema.json`
- Modify: `docs/AUTONOMY-MODEL.md`
- Create: `test/autonomy-envelope-contract.test.mjs`

**Interfaces:**
- Contract tiers become `selfRun`, `ownerDelegable`, `confirmationRequired`, and `neverAutomated`.
- `deploy-to-test-or-prod`, `change-permissions-or-security`, `any-external-send-or-share`, `merge-to-main`, and `governance-administration` are owner-delegable.
- `force-push`, `delete-branch-or-file`, and `spend-money` remain configurable confirmation-required actions in this increment.
- Structural prohibitions remain unchanged.

- [ ] **Step 1: Write the failing contract test**

```js
assert.ok(envelope.ownerDelegable.includes("deploy-to-test-or-prod"));
assert.equal(envelope.confirmationRequired.includes("deploy-to-test-or-prod"), false);
assert.ok(envelope.neverAutomated.includes("bypass-tenant-or-identity-controls"));
```

Validate the reference config against the JSON Schema and assert that moving `deploy-to-test-or-prod` back into `confirmationRequired` fails the exact reference-set constraints.

- [ ] **Step 2: Run contract test RED**

Run: `node --test --test-isolation=none test/autonomy-envelope-contract.test.mjs`
Expected: FAIL because the current contract still has a single blanket `gated` tier.

- [ ] **Step 3: Update schema, reference config, and documentation**

Schema must require exact unique sets for all four tiers. Documentation must state that direct Test/Prod deployment has no intrinsic Mahoraga confirmation gate and is controlled by the authority resolver plus platform policy.

- [ ] **Step 4: Run focused contract tests GREEN**

Run: `node --test --test-isolation=none test/autonomy-envelope-contract.test.mjs test/autonomy-policy.test.mjs test/owner-authority.test.mjs test/router.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add config/autonomy-envelope.json schemas/autonomy-envelope.schema.json docs/AUTONOMY-MODEL.md test/autonomy-envelope-contract.test.mjs
git commit -m "feat(autonomy): make direct deploy owner-delegable"
```

### Task 4: Full Verification and Release Baseline

**Files:**
- Modify generated mirrors under `state/release-baseline/**` only via the repository baseline refresh command.
- Modify plan/spec only if verification exposes a contract mismatch.

**Interfaces:**
- Source of truth remains the live source/config files; release-baseline mirrors must match them exactly.

- [ ] **Step 1: Run focused authority/autonomy/router tests**

Run: `node --test --test-isolation=none test/owner-authority.test.mjs test/router.test.mjs test/autonomy-envelope-contract.test.mjs test/autonomy-policy.test.mjs`
Expected: PASS.

- [ ] **Step 2: Refresh release baseline**

Run: `npm.cmd run baseline:refresh`
Expected: generated release-baseline copies update to the exact current source/config state.

- [ ] **Step 3: Run full verification**

Run: `npm.cmd run verify`
Expected: exit 0 with zero failing tests and release baseline verified.

- [ ] **Step 4: Inspect diff for scope and secrets**

Run: `git status --short; git diff --check; git diff --stat; git diff -- . ':!state/release-baseline'`
Expected: only authority/autonomy/router/spec-plan changes plus deterministic baseline mirrors; no credential values.

- [ ] **Step 5: Commit verification/baseline update**

```bash
git add state/release-baseline docs/superpowers/plans/2026-09-10-owner-sovereign-authority-foundation.md
git commit -m "chore: refresh owner-sovereign release baseline"
```
