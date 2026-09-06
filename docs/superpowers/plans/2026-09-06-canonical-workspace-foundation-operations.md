# Canonical Workspace Foundation and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the incomplete PR #174 with a tested, core-mediated canonical workspace shell and an integrated Operations module, while preserving the existing encrypted conversation experience and making `cloud-app/` the only browser authority surface.

**Architecture:** The browser remains a client. Operational reads and writes travel through the existing encrypted runtime relay into the authoritative Mahoraga core. The control plane owns snapshots, action validation, receipts, and policy. `operator-deck/` is a migration source only during this phase; no new browser-side GitHub/Vercel/GitLab authority is created.

**Tech Stack:** Node 24 ESM (`src/`, `test/`), Next.js 16 + React 19 + TypeScript (`cloud-app/`), existing encrypted ECDH/HKDF/AES-GCM relay, Node test runner, GitHub Actions `Verify Mahoraga`.

**Spec:** `docs/superpowers/specs/2026-09-06-canonical-workspace-admin-extensibility-design.md`

## Global Constraints

- Preserve `cloud-app/` as the canonical browser UI and `src/*.mjs` as the authority plane.
- Do not merge, reuse, or retry PR #174 as-is. Its CSS is truncated and its test expects UI that was never pushed.
- Do not add a Vercel `/api/fleet-status` route that directly queries GitHub. Operations data must come through the paired core.
- Do not use Codex for code review. Do not make Vercel a merge gate.
- No raw credentials, tokens, private task content, or conversation plaintext in browser persistence or operational snapshots.
- No ngrok, public reverse tunnels, reverse SSH, or direct public exposure of the loopback API.
- Keep the current Windows production/rollback boundary unchanged.
- TDD: every behavior change starts with a focused failing test, then minimum implementation, then focused verification.

---

## Task 1: Supersede the broken PR #174 safely

**Files:**
- Modify: `cloud-app/test/cloud-contract.test.mjs`
- Read-only comparison: `cloud-app/app/globals.css`
- Read-only comparison: PR #174 files `cloud-app/app/api/fleet-status/route.ts`, `cloud-app/app/globals.css`, `cloud-app/test/cloud-contract.test.mjs`

- [ ] Create implementation branch `feature/canonical-workspace-foundation-operations` from the current exact `main` SHA, not from PR #174.
- [ ] Add a regression test to `cloud-app/test/cloud-contract.test.mjs` asserting that the canonical workspace does **not** contain a browser-hosted `app/api/fleet-status/route.ts` authority path and that operations are represented by relay method names instead.
- [ ] Add a regression assertion that the three existing starter cards remain valid until the Operations starter is actually implemented in Task 5; do not predeclare a label before the UI exists.
- [ ] Run `cd cloud-app && npm test` and confirm the new authority-path assertion fails for the intentionally staged implementation target, not because of unrelated baseline failures.
- [ ] Do **not** copy PR #174's `globals.css`; retain the `main` stylesheet as the baseline.
- [ ] Record PR #174's known defects in the replacement PR body: accidental CSS truncation and missing `workspace.tsx` implementation.

**Acceptance:** New work starts from clean `main`; PR #174 contributes requirements/evidence only, never commits.

---

## Task 2: Split the workspace shell without changing conversation behavior

**Files:**
- Modify: `cloud-app/components/workspace.tsx`
- Create: `cloud-app/components/workspace/workspace-shell.tsx`
- Create: `cloud-app/components/workspace/workspace-nav.tsx`
- Create: `cloud-app/components/workspace/chat-view.tsx`
- Create: `cloud-app/components/workspace/workspace-types.ts`
- Modify: `cloud-app/app/globals.css`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

- [ ] Add a contract test requiring canonical navigation labels: `Chat`, `Operations`, `Agents`, `Plugins & Connections`, `Files & Data`, `Browser`, `Automations`, `Activity`, `Settings`.
- [ ] Add a contract test preserving current chat invariants: `RuntimeRelay`, `creditPolicy: "zero-codex"`, pairing, stop/cancel, no direct model selector, no direct paid fallback.
- [ ] Run `cd cloud-app && npm test`; confirm navigation test fails before implementation.
- [ ] Extract visual shell/navigation from `workspace.tsx` into `workspace-shell.tsx` and `workspace-nav.tsx`; keep relay/session state owned by `Workspace` for this phase.
- [ ] Extract the existing conversation/welcome/composer rendering into `chat-view.tsx` using explicit typed props from `workspace-types.ts`.
- [ ] Use an in-app view state (`WorkspaceView`) rather than links to alternate URLs. Every nav item renders inside the same Next.js application/origin.
- [ ] Keep `New conversation`, pairing state, task mode, and current message semantics unchanged.
- [ ] Add responsive and keyboard focus styles to `globals.css`; do not rewrite the visual system or replace Tailwind setup.
- [ ] Run `cd cloud-app && npm run typecheck && npm test`.

**Acceptance:** One shell exposes the full approved navigation, Chat works exactly as before, and no nav item leaves the canonical Mahoraga application.

---

## Task 3: Add a core-owned Operations contract

**Files:**
- Create: `src/workspace-operations.mjs`
- Create: `test/workspace-operations.test.mjs`
- Modify: `src/server.mjs`
- Modify: `src/conversation-gateway.mjs`
- Modify: `test/conversation-gateway.test.mjs`
- Modify: `src/relay-runtime.mjs`
- Modify: `test/relay-runtime.test.mjs`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

### Contract

`workspace-operations.mjs` exports:

```js
export function operationsSnapshot({ database, manifest, supervisor, repositoryHeadReader, now })
export async function executeOperationsAction(input, context)
```

Snapshot shape is bounded metadata only:

```js
{
  generatedAt,
  runtime: { version, productionBaseline, rollbackTarget },
  repository: { branch, headSha, cleanState },
  workers: [{ id, state, capabilities }],
  tasks: { active, waiting, failed },
  objectives: { active, waiting },
  repairs: { activeIncidents, lastRepairState },
  verification: { state, exactHeadSha },
  update: { candidate, activationState, rollbackReady }
}
```

Operations actions use stable action IDs, never caller-supplied shell commands. Initial IDs:

- `task.cancel`
- `task.retry`
- `repair.request`
- `repository.verify`
- `runtime.health-check`

- [ ] Write `test/workspace-operations.test.mjs` first. Cover metadata-only output, deterministic sorting, bounded counts, no token/secret fields, stable action allowlist, idempotency key requirement, and rejection of arbitrary command/path input.
- [ ] Run `node --test test/workspace-operations.test.mjs`; confirm RED.
- [ ] Implement `operationsSnapshot` using existing database/supervisor/repository contracts. Do not make outbound GitHub calls from this module; use repository evidence already available to the core.
- [ ] Implement `executeOperationsAction` as a dispatcher over stable IDs. Route task retry/cancel to existing task contracts; route verify/repair/health through existing capability/task intake rather than `exec`.
- [ ] Extend `createRelayHandlers(...)` in `src/server.mjs` with `operationsSnapshot` and `operationsAction` handlers so policy/context remain core-owned.
- [ ] Extend `createConversationGateway(...)` with `operationsSnapshot(context)` and `operationsAction(input, context)` methods that call the supplied relay handlers. Add focused tests in `test/conversation-gateway.test.mjs` showing missing handlers fail closed.
- [ ] Extend `src/relay-runtime.mjs` `ACTIONS` with `operations-snapshot` and `operations-action`; dispatch only to the gateway methods. Update the gateway interface validation and `test/relay-runtime.test.mjs` fake gateway.
- [ ] Extend `cloud-app/lib/runtime-relay.ts` with typed `RuntimeOperationsSnapshot`, `RuntimeOperationsAction`, `operationsSnapshot()`, and `operationsAction(input)` methods using the encrypted private `call()` transport.
- [ ] Add cloud contract tests proving Operations uses `RuntimeRelay` and no browser `/api/fleet-status` or direct GitHub API endpoint.
- [ ] Run focused tests: `node --test test/workspace-operations.test.mjs test/conversation-gateway.test.mjs test/relay-runtime.test.mjs` and `cd cloud-app && npm test`.

**Acceptance:** A paired browser can retrieve operational state and request bounded actions, but all authority, policy, and side effects remain inside the Mahoraga core.

---

## Task 4: Migrate useful operator-deck fleet semantics into the core contract

**Files:**
- Read/migrate from: `operator-deck/src/lib/fleet/actions.ts`
- Read/migrate from: `operator-deck/src/lib/fleet/github.server.ts`
- Read/migrate from: `operator-deck/src/lib/fleet/agents.ts`
- Read/migrate from: `operator-deck/src/lib/fleet/findings.ts`
- Read/migrate from: `operator-deck/src/lib/fleet/heartbeat.ts`
- Read/migrate from: `operator-deck/src/lib/fleet/lanes.ts`
- Modify: `src/workspace-operations.mjs`
- Modify: `test/workspace-operations.test.mjs`

- [ ] Inventory each operator-deck fleet primitive and classify it as `reuse-core`, `port-contract`, or `retire-browser-authority`.
- [ ] Add tests for any semantics we keep: lane/status classification, health/heartbeat aggregation, agent/fleet summary, and bounded owner action IDs.
- [ ] Port pure classification/aggregation logic into `src/workspace-operations.mjs` or small adjacent `.mjs` helpers. Do not import TanStack server functions into the Node core.
- [ ] Retire any operator-deck behavior that shells out or creates a parallel GitHub authority path when the equivalent action can be expressed through existing Mahoraga workers/tasks.
- [ ] Preserve labels/receipts useful to the owner, but normalize them into the Operations snapshot schema.
- [ ] Run focused Node tests.

**Acceptance:** The useful information model of the operator deck exists in the authoritative core without retaining a second browser control plane.

---

## Task 5: Build the integrated Operations view

**Files:**
- Create: `cloud-app/components/workspace/operations-view.tsx`
- Modify: `cloud-app/components/workspace/workspace-shell.tsx`
- Modify: `cloud-app/components/workspace/workspace-nav.tsx`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/app/globals.css`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

- [ ] Add tests requiring an `Operations` view and an `Inspect fleet cycle` starter only once the actual view/handler exists.
- [ ] Run `cd cloud-app && npm test`; confirm RED.
- [ ] Implement `OperationsView` with cards/sections for runtime, repository/exact-head verification, workers, tasks/objectives, incidents/repair, and update/rollback state.
- [ ] When unpaired, render a clear `Pair runtime to load Operations` state; never silently call a public API as fallback.
- [ ] On paired entry or explicit refresh, call `relay.operationsSnapshot()`; show generated timestamp and stale/error state.
- [ ] Render bounded action buttons only when corresponding state makes them applicable. Actions call `relay.operationsAction()` and then refresh snapshot.
- [ ] Surface confirmation-required responses from the core as an owner approval card rather than bypassing them.
- [ ] Add `Inspect fleet cycle` as a starter that only prepares the chat composer, matching existing starter behavior.
- [ ] Ensure responsive mobile behavior and keyboard navigation.
- [ ] Run `cd cloud-app && npm run verify`.

**Acceptance:** The canonical workspace contains a usable Operations control surface with no second URL and no browser-side authority bypass.

---

## Task 6: Replacement PR, exact-head verification, and retirement of #174

**Files:** no additional product files unless tests expose a defect.

- [ ] Run focused Node tests from Tasks 3–4.
- [ ] Run `cd cloud-app && npm run verify`.
- [ ] Run repository `npm run verify` once on the exact candidate head.
- [ ] Open a replacement PR from `feature/canonical-workspace-foundation-operations` to `main` describing how it supersedes #174 and explicitly noting no Codex review and Vercel observational only.
- [ ] Wait for required `Verify (ubuntu-latest)` and `Verify (windows-latest)` on the exact head. Do not merge a blocked head.
- [ ] After the replacement PR is open and clearly references #174, comment on #174 with the superseding PR and close #174 without merging it.
- [ ] Preserve the replacement PR until required exact-head checks are green; integration follows existing repository policy.

**Acceptance:** #174 is closed as superseded, no bad CSS is merged, and the new Operations foundation is represented by a green exact-head PR.