# Canonical Workspace Administrative Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the remaining owner-grade administrative capabilities into the one canonical Mahoraga workspace: Agents, Files & Data, Browser, Automations, Activity & Receipts, and Settings, with chat-first access to the same core-owned actions.

**Architecture:** Each UI module is a typed projection of existing core capabilities. The browser does not become a new state store or execution plane. A small core-side workspace admin adapter maps existing agent, artifact, browser, automation, event/receipt, and owner-policy contracts into stable snapshot/action schemas. The encrypted relay transports those schemas to integrated views in `cloud-app/`.

**Tech Stack:** Existing Node ESM control plane and SQLite ledger, `agent-foundry`, artifact contracts, browser/task workers, existing automation/evolution workflows, Next.js/React/TypeScript canonical workspace, encrypted relay, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-06-canonical-workspace-admin-extensibility-design.md`

## Global Constraints

- Reuse existing durable core contracts; do not duplicate agent/task/artifact state in Vercel or browser storage.
- Every mutation uses a stable action ID and validated schema; never expose a generic shell/command executor.
- Routine owner-authorized writes may execute directly. Core policy returns confirmation requirements only for destructive/irreversible/out-of-authority/credential-broadening/major-release cases.
- Browser tasks remain isolated and approval-aware; no installed Chrome takeover or public debugging endpoint is introduced by this UI work.
- Files/attachments must use the core artifact path; do not silently upload through a separate Vercel persistence layer.
- No Codex review and no Vercel merge gate.
- TDD first, exact-head verification last.

---

## Task 1: Define the unified admin-module contract

**Files:**
- Create: `src/workspace-admin-modules.mjs`
- Create: `test/workspace-admin-modules.test.mjs`
- Modify: `src/server.mjs`
- Modify: `src/conversation-gateway.mjs`
- Modify: `src/relay-runtime.mjs`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `test/conversation-gateway.test.mjs`
- Modify: `test/relay-runtime.test.mjs`

### Module IDs

- `agents`
- `files`
- `browser`
- `automations`
- `activity`
- `settings`

### Relay interface

```js
workspaceModuleSnapshot({ module })
workspaceModuleAction({ module, action, targetId, input, idempotencyKey })
```

- [ ] Write tests rejecting unknown modules/actions, unbounded input, raw secret values, missing idempotency keys on writes, and caller-supplied executable paths/commands.
- [ ] Write tests proving read snapshots are metadata-bounded and deterministically sorted.
- [ ] Run `node --test test/workspace-admin-modules.test.mjs`; confirm RED.
- [ ] Implement a strict dispatcher whose per-module handlers are supplied dependencies; do not import UI code into the core.
- [ ] Wire module snapshot/action methods through `createRelayHandlers`, `createConversationGateway`, `relay-runtime` `ACTIONS`, and `RuntimeRelay` using two stable relay message types: `workspace-module-snapshot` and `workspace-module-action`.
- [ ] Add focused relay/gateway tests, including attended-session context propagation.
- [ ] Run focused Node + cloud contract tests.

**Acceptance:** The canonical UI has one generic but strictly enumerated transport for administrative modules; arbitrary execution remains impossible.

---

## Task 2: Agents module using the existing agent foundry and feat ledger

**Files:**
- Modify: `src/workspace-admin-modules.mjs`
- Read/adapt: `src/agent-foundry.mjs`
- Read/adapt: `src/agent-feat-ledger.mjs`
- Modify/Create focused tests adjacent to: `test/agent-foundry.test.mjs`, `test/agent-feat-ledger.test.mjs`, `test/workspace-admin-modules.test.mjs`
- Create: `cloud-app/components/workspace/agents-view.tsx`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

### Agent snapshot

Expose bounded fields: agent ID, name, parent, role, state, capabilities/extensions, connected systems, schedules, health, recent work receipt IDs, and child count.

### Initial actions

- `agent.create`
- `agent.update`
- `agent.pause`
- `agent.resume`
- `agent.retire`
- `agent.assign-capability`
- `agent.remove-capability`

- [ ] Write failing adapter tests proving parent/child topology and feat/capability inheritance are represented without leaking instructions/private task content.
- [ ] Add mutation tests for stable action IDs and existing owner authority checks.
- [ ] Implement adapters around the current agent foundry/feat ledger rather than a second agent registry.
- [ ] Implement `AgentsView` with topology/list modes, health, capability badges, schedules, and direct lifecycle controls.
- [ ] When Plugins & Connections is installed, capability assignment selects from the live extension/capability registry; otherwise it uses current core capabilities.
- [ ] Add a chat starter such as `Inspect unhealthy agents` that only populates the composer.
- [ ] Run agent focused tests and cloud tests.

**Acceptance:** Owner can create/equip/manage Mahoraga agents from the canonical workspace and chat, using existing durable agent state.

---

## Task 3: Files & Data module through the artifact plane

**Files:**
- Modify: `src/workspace-admin-modules.mjs`
- Read/adapt: `src/artifact-authoring.mjs`
- Read/adapt: `src/artifact-contract.mjs`
- Read/adapt: `src/local-artifact-store.mjs`
- Modify: `test/workspace-admin-modules.test.mjs`
- Create: `cloud-app/components/workspace/files-data-view.tsx`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

### Actions

- `artifact.list`
- `artifact.inspect`
- `artifact.delete-eligible`
- `artifact.attach-to-task`
- `artifact.create-analysis-task`

- [ ] Add tests showing artifact metadata can be listed but content is fetched only through the existing authorized artifact/content path.
- [ ] Add tests preserving `artifact-in-use` deletion refusal and bounded file metadata.
- [ ] Extend the relay artifact support only as necessary; do not embed file bytes in ordinary operations snapshots.
- [ ] Implement Files & Data view with source, size, classification, references, status, and available actions.
- [ ] Connect the existing composer attachment UX to the core artifact bridge when the bridge is available; until then retain the current fail-closed message instead of faking upload success.
- [ ] Run artifact tests and `cloud-app` tests.

**Acceptance:** Files/data become first-class workspace objects without creating a Vercel database or bypassing core artifact controls.

---

## Task 4: Browser module around approved isolated browser capabilities

**Files:**
- Modify: `src/workspace-admin-modules.mjs`
- Read/adapt the existing core browser worker/capability modules under `src/`
- Keep: `cloud-app/lib/browser-tool.ts` as non-authoritative packaged capability code unless core policy routes it
- Modify: `test/workspace-admin-modules.test.mjs`
- Create: `cloud-app/components/workspace/browser-view.tsx`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

### Snapshot

Expose active/queued browser tasks, isolation state, approved domains, pending approvals, latest receipts, and capability readiness. Do not expose cookies, tokens, browser profile data, or debugging endpoints.

### Actions

- `browser.task.create`
- `browser.task.cancel`
- `browser.approval.respond`
- `browser.session.close`

- [ ] Write tests requiring isolation, domain validation, approval state, and absence of local Chrome/public-debug controls.
- [ ] Implement core adapters to current task/approval/browser worker contracts.
- [ ] Implement Browser view with task history, active task detail, approval cards, and close/cancel controls.
- [ ] Ensure browser actions unavailable in current runtime display as `unroutable` rather than being simulated client-side.
- [ ] Run browser and cloud tests.

**Acceptance:** Browser work can be administered from the canonical UI without weakening containment.

---

## Task 5: Automations module for recurring and condition-driven work

**Files:**
- Modify: `src/workspace-admin-modules.mjs`
- Read/adapt: existing autonomy/steward scheduling contracts, including `src/autonomy-heartbeat.mjs` and durable task/objective state
- Read-only reference: `.github/workflows/steward-two-hour-learning.yml`
- Read-only reference: `.github/workflows/sovereign-eight-hour-cycle.yml`
- Modify: `test/workspace-admin-modules.test.mjs`
- Create: `cloud-app/components/workspace/automations-view.tsx`

### Actions

- `automation.create`
- `automation.update`
- `automation.enable`
- `automation.disable`
- `automation.run-now`
- `automation.retire`

- [ ] Inventory which schedules are core-durable vs GitHub workflow-owned. Represent both with a common read model but do not mutate GitHub workflow YAML when a runtime automation is intended.
- [ ] Add tests for schedule validation, no sub-hour unsupported loop creation where the backing scheduler cannot honor it, condition-watch semantics, idempotent updates, and no duplicate learning cycles.
- [ ] Implement adapters over the existing durable scheduler/heartbeat mechanisms. If a requested automation class is not yet backed by a core scheduler, expose it as unavailable rather than persisting a fake schedule.
- [ ] Implement Automations view with cadence, state, next/last run where known, source plane, recent result, and controls.
- [ ] Run focused tests.

**Acceptance:** Owner can see and manage real recurring Mahoraga work from one UI, with source-of-truth boundaries explicit.

---

## Task 6: Activity & Receipts module

**Files:**
- Modify: `src/workspace-admin-modules.mjs`
- Read/adapt: existing database event and receipt APIs used by `src/server.mjs`
- Modify: `test/workspace-admin-modules.test.mjs`
- Create: `cloud-app/components/workspace/activity-view.tsx`

- [ ] Add tests for a unified reverse-chronological activity projection that includes task events, approvals, agent actions, repair transitions, verification results, deployments when represented in core evidence, and rollback/update receipts.
- [ ] Ensure content-bearing fields are omitted or represented by vault/artifact references and classifications.
- [ ] Add bounded pagination/cursor input; do not return the entire SQLite history in one response.
- [ ] Implement Activity view with filters by agent/capability/source/state and expandable receipt metadata.
- [ ] Add direct navigation from Operations/Agents/Browser actions to their receipt IDs.
- [ ] Run focused tests.

**Acceptance:** Administrative work is auditable in one ledger-style UI without leaking private content.

---

## Task 7: Settings and owner-policy module

**Files:**
- Modify: `src/workspace-admin-modules.mjs`
- Read/adapt: `src/autonomy-policy.mjs`
- Read/adapt: `src/controller-authority.mjs`
- Modify: `test/workspace-admin-modules.test.mjs`
- Create: `cloud-app/components/workspace/settings-view.tsx`

### Settings categories

- workspace/canonical identity
- runtime pairing state
- owner authority mode
- plugin/connection policy
- cost/credit policy
- update/rollback state
- privacy/data classifications
- UI preferences that are safe to keep browser-local for the current tab only

- [ ] Add tests distinguishing owner-editable policy from immutable/hard safety and owner-sovereignty invariants.
- [ ] Do not expose secret values; display only credential/connection presence and scope metadata.
- [ ] Implement routine settings updates through stable action IDs; core returns confirmation-required for authority broadening or major activation boundaries.
- [ ] Implement Settings view with plain-language current policy and receipts for changes.
- [ ] Do not add a control that disables exact-head verification, owner recovery/stop authority, or secret containment.
- [ ] Run focused tests.

**Acceptance:** Settings provide meaningful owner control without turning the UI into a raw config editor or secret viewer.

---

## Task 8: Chat-first parity for administrative functions

**Files:**
- Modify: `src/task-intent.mjs` and/or existing intent/capability routing only where necessary
- Modify focused task-intent/router tests
- Modify: `cloud-app/components/workspace/chat-view.tsx`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

- [ ] Add intent tests for representative owner prompts: manage an agent, inspect files, create a browser task, manage an automation, show receipts, change a routine setting, install/equip a legitimate plugin.
- [ ] Ensure chat routes to the same capability/action contracts used by the panes; do not build separate chat-only implementations.
- [ ] Ensure identity ambiguity and consequential actions produce structured owner-decision/confirmation events visible inline in chat.
- [ ] Add structured result cards for administrative receipts where data is available; retain text fallback.
- [ ] Run focused router/conversation tests and cloud tests.

**Acceptance:** Most administrative work can be initiated naturally from Chat and observed/managed in the corresponding view.

---

## Task 9: Verification and integration

- [ ] Run all focused admin-module tests.
- [ ] Run `cd cloud-app && npm run verify`.
- [ ] Run repository `npm run verify` once on the exact candidate head.
- [ ] Open focused PR(s) if the branch becomes too large; preserve dependency order: contract -> Agents/Files -> Browser/Automations -> Activity/Settings -> chat parity.
- [ ] Require exact-head Ubuntu/Windows Verify green. Vercel remains observational. No Codex review.

**Acceptance:** The canonical Mahoraga workspace provides practical ChatGPT-style administration across agents, data, browser work, automation, audit history, and owner policy while keeping the core authoritative.