# Singular UI Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one complete Mahoraga Vercel UI and restore automatic production deployment from verified `main`.

**Architecture:** Keep `cloud-app/` as the only browser application. Replace placeholder navigation with four real surfaces backed by existing `/api/health` and `RuntimeRelay` contracts; expose non-secret build identity; keep all mutation authority in the paired core; restore Git deployment only after tests are green.

**Tech Stack:** Next.js 16, React 19, TypeScript 7, Node test runner, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-07-singular-ui-finalization-design.md`

## Global Constraints

- No Codex code review or review traffic.
- Vercel bot/review output is not a PR completion gate.
- No paid model fallback.
- No browser direct GitHub authority.
- No browser direct provider selection.
- No automatic owner confirmation.
- TypeScript for UI; Node ESM `.mjs` control plane remains unchanged.
- One Vercel browser UI: `cloud-app/`.

---

### Task 1: Write failing singular-UI contract tests

**Files:**
- Modify: `cloud-app/test/cloud-contract.test.mjs`
- Modify: `cloud-app/test/cockpit-contract.test.mjs`

**Interfaces:**
- Produces: contract expectations consumed by Tasks 2-4.

- [ ] **Step 1: Replace the old 10-tab navigation expectation** with exactly `Chat`, `Control Center`, `Operations`, and `Connections`, and assert placeholder copy such as `will land in a later track` is absent from `components/workspace.tsx`.
- [ ] **Step 2: Add a Control Center contract** asserting `CockpitView` receives runtime capabilities and renders deployment commit/environment identity from `Health`.
- [ ] **Step 3: Add a Connections contract** asserting capability worker IDs and routable state are rendered and that the component contains no `api.github.com`, provider SDK, or automatic confirmation path.
- [ ] **Step 4: Add a health/deployment contract** asserting `/api/health` contains `version`, `deployment.commitSha`, `deployment.environment`, and `deployment.gitRef`.
- [ ] **Step 5: Add a deployment configuration contract** asserting root `vercel.json` no longer contains `"deploymentEnabled": false`.
- [ ] **Step 6: Run `npm test --prefix cloud-app` and confirm the new assertions fail for the missing final UI behavior.**

### Task 2: Implement build identity and final Control Center

**Files:**
- Modify: `cloud-app/app/api/health/route.ts`
- Modify: `cloud-app/components/workspace/workspace-types.ts`
- Modify: `cloud-app/components/cockpit/CockpitView.tsx`
- Create: `cloud-app/components/workspace/connections-view.tsx`

**Interfaces:**
- Produces: extended `Health` shape and `ConnectionsView`.
- Consumes: `RuntimeCapability[]` and existing RuntimeRelay pairing state.

- [ ] **Step 1: Extend `/api/health`** with `version: "7.0.0-alpha.2"` and `deployment: { environment, url, commitSha, gitRef }` from `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA`, and `VERCEL_GIT_COMMIT_REF`, falling back to `local`/`null` without secrets.
- [ ] **Step 2: Extend the `Health` type** to match the route plus routing authority and capability metadata already returned.
- [ ] **Step 3: Rewrite `CockpitView` as the final Control Center** using existing `connection-panel`, `section-heading`, `capability-list`, and action styles. Render deployment identity, cloud boundary, paired-core state, no-paid-fallback status, and routable capability counts. Do not use direct Ollama or browser-side mutation code.
- [ ] **Step 4: Create `ConnectionsView`** that lists each RuntimeRelay capability, its `routable` state, and `workerIds`, and provides pair/revoke navigation callbacks only.
- [ ] **Step 5: Run `npm test --prefix cloud-app` and confirm Task 2 contracts turn green while navigation tests remain red.**

### Task 3: Collapse navigation to four real surfaces

**Files:**
- Modify: `cloud-app/components/workspace/workspace-types.ts`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/components/workspace/workspace-shell.tsx`

**Interfaces:**
- Consumes: `ConnectionsView`, final `CockpitView`, existing `OperationsView` and `ChatView`.

- [ ] **Step 1: Change `WorkspaceView`** to `chat | cockpit | operations | connections` and set labels to `Chat`, `Control Center`, `Operations`, `Connections`.
- [ ] **Step 2: Remove the generic placeholder renderer and all placeholder branches.**
- [ ] **Step 3: Pass `runtimeCapabilities` into `CockpitView`.**
- [ ] **Step 4: Render `ConnectionsView` with `coreReady`, `health`, `runtimeCapabilities`, pair navigation, and revoke callback.**
- [ ] **Step 5: Update sidebar copy to identify this as the single Mahoraga workspace/control surface.**
- [ ] **Step 6: Run `npm test --prefix cloud-app`; all UI contract tests must pass.**

### Task 4: Correct repository and deployment truth

**Files:**
- Modify: `vercel.json`
- Modify: `README.md`
- Modify: `operator-deck/README.md`
- Modify: `docs/OPERATOR-CONSOLE.md`

**Interfaces:**
- Produces: one documented deployment surface and automatic Git deployment restored.

- [ ] **Step 1: Change `git.deploymentEnabled` to `true`.** This restores Git-triggered deployments; Vercel output remains non-gating for PR completion.
- [ ] **Step 2: Update root README** from “two Vercel browser UIs” to one `cloud-app` workspace containing Chat, Control Center, Operations, and Connections.
- [ ] **Step 3: Update `operator-deck/README.md`** to state it is a TypeScript reference/control library, not a separately deployed UI.
- [ ] **Step 4: Update `docs/OPERATOR-CONSOLE.md`** to describe the integrated Control Center/Operations surfaces in `cloud-app`.
- [ ] **Step 5: Run `npm test --prefix cloud-app` again.**

### Task 5: Verify, merge, and validate production

**Files:** no new production files.

- [ ] **Step 1: Run `npm run typecheck --prefix cloud-app`.** Expected: exit 0.
- [ ] **Step 2: Run `npm run build --prefix cloud-app`.** Expected: exit 0.
- [ ] **Step 3: Open a PR from `feature/finalize-singular-ui-20260907` to `main`.**
- [ ] **Step 4: Wait only for repository-required exact-head Ubuntu/Windows verification; do not request Codex review and do not block on Vercel bot status.**
- [ ] **Step 5: Merge with expected head SHA once exact-head verification is green and `main` has not moved incompatibly.**
- [ ] **Step 6: Verify the production URL serves the new health metadata and that the displayed commit SHA matches the merged `main` deployment SHA.**
